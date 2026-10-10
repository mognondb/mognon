(function () {
  'use strict';

  const LS_TOKEN = 'cm_admin_token';
  const LS_OWNER = 'cm_admin_owner';
  const LS_REPO = 'cm_admin_repo';
  const LS_BRANCH = 'cm_admin_branch';

  const PATH_INFOPRODUTOS = 'assets/data/infoprodutos.json';
  const PATH_DASHBOARDS = 'assets/data/dashboards.json';

  let config = {
    token: localStorage.getItem(LS_TOKEN) || '',
    owner: localStorage.getItem(LS_OWNER) || 'mognondb',
    repo: localStorage.getItem(LS_REPO) || 'mognon',
    branch: localStorage.getItem(LS_BRANCH) || 'master',
  };

  const state = {
    infoprodutos: { items: [], sha: null, dirty: false, editId: null },
    dashboards: { items: [], sha: null, dirty: false, editId: null },
  };

  // ---------- Utilidades ----------

  function slugify(str) {
    return (str || '')
      .toString()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  function gerarId(base, existentes) {
    const raiz = slugify(base) || 'item';
    let candidato = raiz;
    let i = 1;
    while (existentes.includes(candidato)) {
      candidato = `${raiz}-${i++}`;
    }
    return candidato;
  }

  function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary);
  }

  function fromBase64(b64) {
    const binary = atob((b64 || '').replace(/\n/g, ''));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function apiUrl(path) {
    return `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`;
  }

  async function ghGetFile(path) {
    const res = await fetch(`${apiUrl(path)}?ref=${encodeURIComponent(config.branch)}`, {
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github+json',
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Erro ao carregar ${path} (HTTP ${res.status})`);
    }
    const data = await res.json();
    const conteudo = fromBase64(data.content);
    return { json: JSON.parse(conteudo), sha: data.sha };
  }

  async function ghPutFile(path, jsonObj, sha, mensagem) {
    const conteudo = toBase64(JSON.stringify(jsonObj, null, 2) + '\n');
    const res = await fetch(apiUrl(path), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({
        message: mensagem,
        content: conteudo,
        sha,
        branch: config.branch,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const base = body.message || 'Erro ao salvar';
      throw new Error(`${base} (HTTP ${res.status})`);
    }
    return body;
  }

  // ---------- Login (usuário/senha + token do GitHub por trás) ----------

  // Hash SHA-256 de "usuario:senha". A senha nunca fica em texto puro no código.
  // Isso é uma barreira de conveniência, não segurança forte: como o site é
  // estático (sem servidor), qualquer pessoa com conhecimento técnico pode ler
  // este arquivo .js. Quem de fato autoriza gravações no repositório é o token
  // do GitHub configurado abaixo, que fica só no navegador de quem acessa.
  const CREDENCIAIS_HASH = 'cebc636714aad79882b98aac434c99e87cce7f31aa0398035f56131b2ee56507';

  async function sha256Hex(texto) {
    const dados = new TextEncoder().encode(texto);
    const buffer = await crypto.subtle.digest('SHA-256', dados);
    return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  const loginScreen = document.getElementById('loginScreen');
  const painel = document.getElementById('painel');
  const loginForm = document.getElementById('loginForm');
  const userInput = document.getElementById('userInput');
  const passInput = document.getElementById('passInput');
  const tokenInput = document.getElementById('tokenInput');
  const ownerInput = document.getElementById('ownerInput');
  const repoInput = document.getElementById('repoInput');
  const branchInput = document.getElementById('branchInput');
  const loginFeedback = document.getElementById('loginFeedback');
  const primeiroAcessoBox = document.getElementById('primeiroAcessoBox');
  const btnEntrar = document.getElementById('btnEntrar');

  ownerInput.value = config.owner;
  repoInput.value = config.repo;
  branchInput.value = config.branch;

  function atualizarVisibilidadeToken() {
    const temTokenSalvo = Boolean(config.token);
    primeiroAcessoBox.hidden = temTokenSalvo;
    tokenInput.required = !temTokenSalvo;
  }
  atualizarVisibilidadeToken();

  document.getElementById('btnTrocarToken').addEventListener('click', () => {
    primeiroAcessoBox.hidden = !primeiroAcessoBox.hidden;
  });

  let tentativasFalhas = 0;
  let bloqueadoAte = 0;

  async function tentarEntrar(e) {
    e.preventDefault();

    if (Date.now() < bloqueadoAte) {
      const segundos = Math.ceil((bloqueadoAte - Date.now()) / 1000);
      loginFeedback.textContent = `Muitas tentativas. Aguarde ${segundos}s e tente de novo.`;
      loginFeedback.className = 'admin-feedback error';
      return;
    }

    btnEntrar.disabled = true;
    loginFeedback.textContent = 'Verificando...';
    loginFeedback.className = 'admin-feedback';

    try {
      const hashDigitado = await sha256Hex(`${userInput.value.trim()}:${passInput.value}`);
      if (hashDigitado !== CREDENCIAIS_HASH) {
        tentativasFalhas += 1;
        if (tentativasFalhas >= 5) {
          bloqueadoAte = Date.now() + 30000;
          tentativasFalhas = 0;
          throw new Error('Muitas tentativas incorretas. Aguarde 30s e tente de novo.');
        }
        throw new Error('Usuário ou senha inválidos.');
      }

      const tokenDigitado = tokenInput.value.trim();
      const token = tokenDigitado || config.token;
      if (!token) {
        throw new Error('Configure o token de acesso do GitHub (primeiro acesso).');
      }

      config.token = token;
      config.owner = ownerInput.value.trim() || 'mognondb';
      config.repo = repoInput.value.trim() || 'mognon';
      config.branch = branchInput.value.trim() || 'master';

      loginFeedback.textContent = 'Verificando acesso ao repositório...';

      const res = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}`, {
        headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) {
        throw new Error(res.status === 401 || res.status === 403
          ? 'Token inválido ou sem permissão para este repositório.'
          : `Não foi possível acessar o repositório (HTTP ${res.status}).`);
      }

      localStorage.setItem(LS_TOKEN, config.token);
      localStorage.setItem(LS_OWNER, config.owner);
      localStorage.setItem(LS_REPO, config.repo);
      localStorage.setItem(LS_BRANCH, config.branch);

      tentativasFalhas = 0;
      loginScreen.hidden = true;
      painel.hidden = false;
      carregarTudo();
    } catch (err) {
      loginFeedback.textContent = err.message;
      loginFeedback.className = 'admin-feedback error';
    } finally {
      btnEntrar.disabled = false;
    }
  }

  loginForm.addEventListener('submit', tentarEntrar);

  document.getElementById('btnSair').addEventListener('click', () => {
    painel.hidden = true;
    loginScreen.hidden = false;
    userInput.value = '';
    passInput.value = '';
    tokenInput.value = '';
    atualizarVisibilidadeToken();
    userInput.focus();
  });

  // ---------- Abas ----------

  document.querySelectorAll('.admin-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.admin-tab-panel').forEach((p) => { p.hidden = true; });
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).hidden = false;
    });
  });

  function carregarTudo() {
    carregarLista('infoprodutos', PATH_INFOPRODUTOS);
    carregarLista('dashboards', PATH_DASHBOARDS);
  }

  // ---------- Carregar / Renderizar listas ----------

  async function carregarLista(tipo, path) {
    const lista = document.getElementById(`lista${capitalize(tipo)}`);
    const feedback = document.getElementById(`feedback${capitalize(tipo)}`);
    lista.innerHTML = '<p class="loading-placeholder">Carregando...</p>';
    feedback.textContent = '';
    feedback.className = 'admin-feedback';
    try {
      const { json, sha } = await ghGetFile(path);
      state[tipo].items = json;
      state[tipo].sha = sha;
      state[tipo].dirty = false;
      marcarDirty(tipo, false);
      renderLista(tipo);
    } catch (err) {
      lista.innerHTML = '';
      feedback.textContent = err.message;
      feedback.className = 'admin-feedback error';
    }
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function marcarDirty(tipo, valor) {
    state[tipo].dirty = valor;
    document.getElementById(`dirty${capitalize(tipo)}`).hidden = !valor;
  }

  function renderLista(tipo) {
    const lista = document.getElementById(`lista${capitalize(tipo)}`);
    const itens = state[tipo].items;
    if (itens.length === 0) {
      lista.innerHTML = '<p class="loading-placeholder">Nenhum item cadastrado ainda.</p>';
      return;
    }
    lista.innerHTML = itens.map((item) => {
      const ativo = item.ativo !== false;
      if (tipo === 'infoprodutos') {
        const tipoLabel = item.tipo === 'gratis' ? 'Grátis' : (item.precoLabel || 'Pago');
        return `
          <div class="admin-item ${ativo ? '' : 'inativo'}" data-id="${escapeHtml(item.id)}">
            <div class="admin-item-icon">${escapeHtml(item.icone || '📦')}</div>
            <div class="admin-item-info">
              <h4>${escapeHtml(item.nome)}</h4>
              <p>${escapeHtml(item.descricao)}</p>
              <span class="admin-item-meta">${escapeHtml(tipoLabel)}${ativo ? '' : ' · inativo'}</span>
            </div>
            <div class="admin-item-actions">
              <button class="btn btn-ghost btn-sm" data-acao="editar">Editar</button>
              <button class="btn btn-outline btn-sm" data-acao="remover">Remover</button>
            </div>
          </div>`;
      }
      return `
        <div class="admin-item ${ativo ? '' : 'inativo'}" data-id="${escapeHtml(item.id)}">
          <div class="admin-item-icon">${item.preview === 'donut' ? '🍩' : '📊'}</div>
          <div class="admin-item-info">
            <h4>${escapeHtml(item.titulo)}</h4>
            <p>${escapeHtml(item.descricao)}</p>
            <span class="admin-item-meta">${item.preview === 'donut' ? 'Donut' : 'Barras'}${ativo ? '' : ' · inativo'}</span>
          </div>
          <div class="admin-item-actions">
            <button class="btn btn-ghost btn-sm" data-acao="editar">Editar</button>
            <button class="btn btn-outline btn-sm" data-acao="remover">Remover</button>
          </div>
        </div>`;
    }).join('');

    lista.querySelectorAll('.admin-item').forEach((el) => {
      const id = el.dataset.id;
      el.querySelector('[data-acao="editar"]').addEventListener('click', () => abrirModal(tipo, id));
      el.querySelector('[data-acao="remover"]').addEventListener('click', () => removerItem(tipo, id));
    });
  }

  function abrirModal(tipo, id) {
    if (tipo === 'infoprodutos') abrirModalInfoproduto(id);
    else abrirModalDashboard(id);
  }

  function removerItem(tipo, id) {
    if (!confirm('Remover este item? Isso só é aplicado de verdade ao clicar em "Salvar alterações".')) return;
    state[tipo].items = state[tipo].items.filter((i) => i.id !== id);
    marcarDirty(tipo, true);
    renderLista(tipo);
  }

  // ---------- Recarregar / Salvar ----------

  document.getElementById('btnRecarregarInfoprodutos').addEventListener('click', () => {
    if (state.infoprodutos.dirty && !confirm('Isso descarta suas alterações não salvas. Continuar?')) return;
    carregarLista('infoprodutos', PATH_INFOPRODUTOS);
  });
  document.getElementById('btnRecarregarDashboards').addEventListener('click', () => {
    if (state.dashboards.dirty && !confirm('Isso descarta suas alterações não salvas. Continuar?')) return;
    carregarLista('dashboards', PATH_DASHBOARDS);
  });

  async function salvar(tipo, path) {
    const feedback = document.getElementById(`feedback${capitalize(tipo)}`);
    feedback.textContent = 'Salvando...';
    feedback.className = 'admin-feedback';
    try {
      const resultado = await ghPutFile(
        path,
        state[tipo].items,
        state[tipo].sha,
        `Atualiza ${tipo} via painel administrativo`
      );
      state[tipo].sha = resultado.content.sha;
      marcarDirty(tipo, false);
      feedback.textContent = 'Alterações salvas! O site será atualizado em poucos minutos.';
      feedback.className = 'admin-feedback success';
    } catch (err) {
      feedback.textContent = err.message + (err.message.includes('409') ? ' Clique em Recarregar e tente de novo.' : '');
      feedback.className = 'admin-feedback error';
    }
  }

  document.getElementById('btnSalvarInfoprodutos').addEventListener('click', () => salvar('infoprodutos', PATH_INFOPRODUTOS));
  document.getElementById('btnSalvarDashboards').addEventListener('click', () => salvar('dashboards', PATH_DASHBOARDS));

  // ---------- Modal Infoproduto ----------

  const modalInfoproduto = document.getElementById('modalInfoproduto');
  const formInfoproduto = document.getElementById('formInfoproduto');
  const ipTipo = document.getElementById('ipTipo');
  const labelIpLink = document.getElementById('labelIpLink');
  const hintIpLink = document.getElementById('hintIpLink');
  const campoPreco = document.getElementById('campoPreco');

  function atualizarCamposInfoproduto() {
    const gratis = ipTipo.value === 'gratis';
    campoPreco.style.display = gratis ? 'none' : 'block';
    document.getElementById('ipPreco').required = !gratis;
    labelIpLink.textContent = gratis ? 'Caminho do arquivo *' : 'Link de checkout na Hotmart *';
    document.getElementById('ipLink').placeholder = gratis
      ? 'assets/downloads/minha-planilha.csv'
      : 'https://pay.hotmart.com/XXXXXXX';
    hintIpLink.style.display = gratis ? 'block' : 'none';
  }
  ipTipo.addEventListener('change', atualizarCamposInfoproduto);

  function abrirModalInfoproduto(id) {
    state.infoprodutos.editId = id || null;
    const item = id ? state.infoprodutos.items.find((i) => i.id === id) : null;
    document.getElementById('modalInfoprodutoTitulo').textContent = item ? 'Editar infoproduto' : 'Novo infoproduto';
    document.getElementById('ipNome').value = item?.nome || '';
    document.getElementById('ipDescricao').value = item?.descricao || '';
    document.getElementById('ipIcone').value = item?.icone || '';
    ipTipo.value = item?.tipo || 'gratis';
    document.getElementById('ipPreco').value = item?.precoLabel || '';
    document.getElementById('ipLink').value = item?.link || '';
    document.getElementById('ipAtivo').checked = item ? item.ativo !== false : true;
    atualizarCamposInfoproduto();
    modalInfoproduto.hidden = false;
  }

  document.getElementById('btnNovoInfoproduto').addEventListener('click', () => abrirModalInfoproduto(null));
  document.getElementById('btnCancelarInfoproduto').addEventListener('click', () => { modalInfoproduto.hidden = true; });

  formInfoproduto.addEventListener('submit', (e) => {
    e.preventDefault();
    const gratis = ipTipo.value === 'gratis';
    const dados = {
      nome: document.getElementById('ipNome').value.trim(),
      descricao: document.getElementById('ipDescricao').value.trim(),
      icone: document.getElementById('ipIcone').value.trim() || '📦',
      tipo: ipTipo.value,
      precoLabel: gratis ? 'Grátis' : document.getElementById('ipPreco').value.trim(),
      link: document.getElementById('ipLink').value.trim(),
      ativo: document.getElementById('ipAtivo').checked,
    };

    const itens = state.infoprodutos.items;
    if (state.infoprodutos.editId) {
      const idx = itens.findIndex((i) => i.id === state.infoprodutos.editId);
      itens[idx] = { ...itens[idx], ...dados };
    } else {
      const id = gerarId(dados.nome, itens.map((i) => i.id));
      itens.push({ id, ...dados });
    }

    marcarDirty('infoprodutos', true);
    renderLista('infoprodutos');
    modalInfoproduto.hidden = true;
  });

  // ---------- Modal Dashboard ----------

  const modalDashboard = document.getElementById('modalDashboard');
  const formDashboard = document.getElementById('formDashboard');
  const dbPreview = document.getElementById('dbPreview');
  const camposBarras = document.getElementById('camposBarras');
  const camposDonut = document.getElementById('camposDonut');

  function atualizarCamposDashboard() {
    const barras = dbPreview.value === 'barras';
    camposBarras.style.display = barras ? 'block' : 'none';
    camposDonut.style.display = barras ? 'none' : 'block';
  }
  dbPreview.addEventListener('change', atualizarCamposDashboard);

  function abrirModalDashboard(id) {
    state.dashboards.editId = id || null;
    const item = id ? state.dashboards.items.find((i) => i.id === id) : null;
    document.getElementById('modalDashboardTitulo').textContent = item ? 'Editar dashboard' : 'Novo dashboard';
    document.getElementById('dbTitulo').value = item?.titulo || '';
    document.getElementById('dbDescricao').value = item?.descricao || '';
    dbPreview.value = item?.preview || 'barras';
    document.getElementById('dbKpi1Valor').value = item?.kpis?.[0]?.valor || '';
    document.getElementById('dbKpi1Label').value = item?.kpis?.[0]?.label || '';
    document.getElementById('dbKpi2Valor').value = item?.kpis?.[1]?.valor || '';
    document.getElementById('dbKpi2Label').value = item?.kpis?.[1]?.label || '';
    document.getElementById('dbBarras').value = (item?.barras || []).join(',');
    document.getElementById('dbP1').value = item?.donut?.p1 ?? '';
    document.getElementById('dbP2').value = item?.donut?.p2 ?? '';
    document.getElementById('dbLegendas').value = (item?.legendas || []).join(',');
    document.getElementById('dbAtivo').checked = item ? item.ativo !== false : true;
    atualizarCamposDashboard();
    modalDashboard.hidden = false;
  }

  document.getElementById('btnNovoDashboard').addEventListener('click', () => abrirModalDashboard(null));
  document.getElementById('btnCancelarDashboard').addEventListener('click', () => { modalDashboard.hidden = true; });

  formDashboard.addEventListener('submit', (e) => {
    e.preventDefault();
    const barras = dbPreview.value === 'barras';

    const dados = {
      titulo: document.getElementById('dbTitulo').value.trim(),
      descricao: document.getElementById('dbDescricao').value.trim(),
      preview: dbPreview.value,
      ativo: document.getElementById('dbAtivo').checked,
    };

    if (barras) {
      dados.kpis = [
        { valor: document.getElementById('dbKpi1Valor').value.trim(), label: document.getElementById('dbKpi1Label').value.trim() },
        { valor: document.getElementById('dbKpi2Valor').value.trim(), label: document.getElementById('dbKpi2Label').value.trim() },
      ];
      dados.barras = document.getElementById('dbBarras').value
        .split(',')
        .map((v) => parseInt(v.trim(), 10))
        .filter((v) => !Number.isNaN(v));
    } else {
      dados.donut = {
        p1: parseInt(document.getElementById('dbP1').value, 10) || 0,
        p2: parseInt(document.getElementById('dbP2').value, 10) || 0,
      };
      dados.legendas = document.getElementById('dbLegendas').value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    }

    const itens = state.dashboards.items;
    if (state.dashboards.editId) {
      const idx = itens.findIndex((i) => i.id === state.dashboards.editId);
      itens[idx] = { ...itens[idx], ...dados };
    } else {
      const id = gerarId(dados.titulo, itens.map((i) => i.id));
      itens.push({ id, ...dados });
    }

    marcarDirty('dashboards', true);
    renderLista('dashboards');
    modalDashboard.hidden = true;
  });

})();
