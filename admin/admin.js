(function () {
  'use strict';

  const LS_API_URL = 'cm_admin_api_url';
  const TIPOS = ['infoprodutos', 'dashboards'];

  let config = {
    apiUrl: localStorage.getItem(LS_API_URL) || '',
  };

  // Credenciais ficam só na memória da aba (sessionStorage): somem ao fechar a
  // aba/navegador. O servidor (Cloudflare Worker) é quem de fato valida usuário
  // e senha e guarda o token do GitHub — nada disso fica no código deste site.
  let authHeader = sessionStorage.getItem('cm_admin_auth') || '';

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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---------- Chamadas ao servidor (Cloudflare Worker) ----------

  async function apiGetFile(tipo) {
    const res = await fetch(`${config.apiUrl}/api/file?path=${tipo}`, {
      headers: { Authorization: authHeader },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Erro ao carregar ${tipo} (HTTP ${res.status})`);
    return body; // { json, sha }
  }

  async function apiPutFile(tipo, dados, sha) {
    const res = await fetch(`${config.apiUrl}/api/file?path=${tipo}`, {
      method: 'PUT',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: dados, sha }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Erro ao salvar ${tipo} (HTTP ${res.status})`);
    return body; // { sha }
  }

  // ---------- Login ----------

  const loginScreen = document.getElementById('loginScreen');
  const painel = document.getElementById('painel');
  const loginForm = document.getElementById('loginForm');
  const userInput = document.getElementById('userInput');
  const passInput = document.getElementById('passInput');
  const apiUrlInput = document.getElementById('apiUrlInput');
  const loginFeedback = document.getElementById('loginFeedback');
  const btnEntrar = document.getElementById('btnEntrar');

  apiUrlInput.value = config.apiUrl;

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

    const apiUrl = apiUrlInput.value.trim().replace(/\/+$/, '');
    if (!apiUrl) {
      loginFeedback.textContent = 'Configure o endereço do servidor em "Configurações do servidor" (veja admin/README-servidor.md).';
      loginFeedback.className = 'admin-feedback error';
      return;
    }

    btnEntrar.disabled = true;
    loginFeedback.textContent = 'Verificando...';
    loginFeedback.className = 'admin-feedback';

    config.apiUrl = apiUrl;
    const tentativaAuth = `Basic ${btoa(`${userInput.value.trim()}:${passInput.value}`)}`;

    try {
      const res = await fetch(`${config.apiUrl}/api/file?path=infoprodutos`, {
        headers: { Authorization: tentativaAuth },
      });

      if (res.status === 401) {
        tentativasFalhas += 1;
        if (tentativasFalhas >= 5) {
          bloqueadoAte = Date.now() + 30000;
          tentativasFalhas = 0;
          throw new Error('Muitas tentativas incorretas. Aguarde 30s e tente de novo.');
        }
        throw new Error('Usuário ou senha inválidos.');
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Não foi possível falar com o servidor (HTTP ${res.status}).`);
      }

      authHeader = tentativaAuth;
      sessionStorage.setItem('cm_admin_auth', authHeader);
      localStorage.setItem(LS_API_URL, config.apiUrl);

      tentativasFalhas = 0;
      loginScreen.hidden = true;
      painel.hidden = false;
      carregarTudo();
    } catch (err) {
      loginFeedback.textContent = err.message.includes('fetch')
        ? 'Não foi possível conectar ao servidor. Confira o endereço configurado.'
        : err.message;
      loginFeedback.className = 'admin-feedback error';
    } finally {
      btnEntrar.disabled = false;
    }
  }

  loginForm.addEventListener('submit', tentarEntrar);

  document.getElementById('btnSair').addEventListener('click', () => {
    authHeader = '';
    sessionStorage.removeItem('cm_admin_auth');
    painel.hidden = true;
    loginScreen.hidden = false;
    passInput.value = '';
    userInput.focus();
  });

  // Se já existe uma sessão ativa nesta aba (ex: recarregou a página), reentra direto
  if (authHeader && config.apiUrl) {
    fetch(`${config.apiUrl}/api/file?path=infoprodutos`, { headers: { Authorization: authHeader } })
      .then((res) => {
        if (res.ok) {
          loginScreen.hidden = true;
          painel.hidden = false;
          carregarTudo();
        } else {
          sessionStorage.removeItem('cm_admin_auth');
        }
      })
      .catch(() => {});
  }

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
    TIPOS.forEach(carregarLista);
  }

  // ---------- Carregar / Renderizar listas ----------

  async function carregarLista(tipo) {
    const lista = document.getElementById(`lista${capitalize(tipo)}`);
    const feedback = document.getElementById(`feedback${capitalize(tipo)}`);
    lista.innerHTML = '<p class="loading-placeholder">Carregando...</p>';
    feedback.textContent = '';
    feedback.className = 'admin-feedback';
    try {
      const { json, sha } = await apiGetFile(tipo);
      state[tipo].items = json;
      state[tipo].sha = sha;
      marcarDirty(tipo, false);
      renderLista(tipo);
    } catch (err) {
      lista.innerHTML = '';
      feedback.textContent = err.message;
      feedback.className = 'admin-feedback error';
    }
  }

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
    carregarLista('infoprodutos');
  });
  document.getElementById('btnRecarregarDashboards').addEventListener('click', () => {
    if (state.dashboards.dirty && !confirm('Isso descarta suas alterações não salvas. Continuar?')) return;
    carregarLista('dashboards');
  });

  async function salvar(tipo) {
    const feedback = document.getElementById(`feedback${capitalize(tipo)}`);
    feedback.textContent = 'Salvando...';
    feedback.className = 'admin-feedback';
    try {
      const resultado = await apiPutFile(tipo, state[tipo].items, state[tipo].sha);
      state[tipo].sha = resultado.sha;
      marcarDirty(tipo, false);
      feedback.textContent = 'Alterações salvas! O site será atualizado em poucos minutos.';
      feedback.className = 'admin-feedback success';
    } catch (err) {
      feedback.textContent = err.message + (err.message.includes('409') ? ' Clique em Recarregar e tente de novo.' : '');
      feedback.className = 'admin-feedback error';
    }
  }

  document.getElementById('btnSalvarInfoprodutos').addEventListener('click', () => salvar('infoprodutos'));
  document.getElementById('btnSalvarDashboards').addEventListener('click', () => salvar('dashboards'));

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
