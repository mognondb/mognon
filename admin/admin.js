(function () {
  'use strict';

  const TIPOS = ['infoprodutos', 'dashboards'];

  // Endereço do servidor (Cloudflare Worker). Não é segredo — só a senha é —
  // por isso fica fixo aqui em vez de pedir pra digitar a cada login.
  const API_URL = 'https://bold-forest-84c8fff.mognon-db.workers.dev';

  let config = { apiUrl: API_URL };

  // Credenciais ficam só na memória da aba (sessionStorage): somem ao fechar a
  // aba/navegador. O servidor (Cloudflare Worker) é quem de fato valida usuário
  // e senha — nada disso fica no código deste site.
  let authHeader = sessionStorage.getItem('cm_admin_auth') || '';

  const state = {
    infoprodutos: { items: [], dirty: false, editId: null },
    dashboards: { items: [], dirty: false, editId: null },
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
    const body = await res.json().catch(() => ([]));
    if (!res.ok) throw new Error(body.message || `Erro ao carregar ${tipo} (HTTP ${res.status})`);
    return body; // array de itens
  }

  async function apiPutFile(tipo, itens) {
    const res = await fetch(`${config.apiUrl}/api/file?path=${tipo}`, {
      method: 'PUT',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(itens),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Erro ao salvar ${tipo} (HTTP ${res.status})`);
    return body;
  }

  // ---------- Login ----------

  const loginScreen = document.getElementById('loginScreen');
  const painel = document.getElementById('painel');
  const loginForm = document.getElementById('loginForm');
  const userInput = document.getElementById('userInput');
  const passInput = document.getElementById('passInput');
  const loginFeedback = document.getElementById('loginFeedback');
  const btnEntrar = document.getElementById('btnEntrar');

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

    const tentativaAuth = `Basic ${btoa(`${userInput.value.trim()}:${passInput.value}`)}`;

    try {
      const res = await fetch(`${config.apiUrl}/api/login`, {
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

      const dadosSessao = await res.json().catch(() => ({}));
      if (dadosSessao.papel && dadosSessao.papel !== 'admin') {
        loginFeedback.textContent = 'Este usuário não tem acesso ao painel administrativo completo.';
        loginFeedback.className = 'admin-feedback error';
        if (dadosSessao.papel === 'cliente' && dadosSessao.clienteId) {
          location.href = `cliente.html?id=${encodeURIComponent(dadosSessao.clienteId)}`;
        } else if (dadosSessao.papel === 'dashboard' && dadosSessao.relatorioId) {
          location.href = `relatorio.html?id=${encodeURIComponent(dadosSessao.relatorioId)}`;
        }
        return;
      }

      authHeader = tentativaAuth;
      sessionStorage.setItem('cm_admin_auth', authHeader);

      tentativasFalhas = 0;
      loginScreen.hidden = true;
      painel.hidden = false;
      carregarTudo();
    } catch (err) {
      if (err instanceof TypeError) {
        // fetch() falhou antes de receber qualquer resposta: rede, CORS, DNS, etc.
        loginFeedback.textContent = `Não foi possível conectar ao servidor (${err.message}). Veja o console (F12) para mais detalhes.`;
        console.error('Erro de rede ao conectar no servidor do painel:', err);
      } else {
        loginFeedback.textContent = err.message;
      }
      loginFeedback.className = 'admin-feedback error';
    } finally {
      btnEntrar.disabled = false;
    }
  }

  loginForm.addEventListener('submit', tentarEntrar);

  document.getElementById('btnSair').addEventListener('click', () => {
    authHeader = '';
    sessionStorage.removeItem('cm_admin_auth');
    sessionStorage.removeItem('cm_admin_papel');
    painel.hidden = true;
    loginScreen.hidden = false;
    passInput.value = '';
    userInput.focus();
  });

  // Se já existe uma sessão ativa nesta aba (ex: recarregou a página), reentra direto
  if (authHeader && config.apiUrl) {
    fetch(`${config.apiUrl}/api/login`, { headers: { Authorization: authHeader } })
      .then(async (res) => {
        if (!res.ok) {
          sessionStorage.removeItem('cm_admin_auth');
          sessionStorage.removeItem('cm_admin_papel');
          return;
        }
        const dadosSessao = await res.json().catch(() => ({}));
        if (dadosSessao.papel && dadosSessao.papel !== 'admin') {
          sessionStorage.removeItem('cm_admin_auth');
          sessionStorage.removeItem('cm_admin_papel');
          return;
        }
        loginScreen.hidden = true;
        painel.hidden = false;
        carregarTudo();
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
    carregarClientes();
    carregarUsuarios();
  }

  // ---------- Carregar / Renderizar listas ----------

  async function carregarLista(tipo) {
    const lista = document.getElementById(`lista${capitalize(tipo)}`);
    const feedback = document.getElementById(`feedback${capitalize(tipo)}`);
    lista.innerHTML = '<p class="loading-placeholder">Carregando...</p>';
    feedback.textContent = '';
    feedback.className = 'admin-feedback';
    try {
      state[tipo].items = await apiGetFile(tipo);
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
      await apiPutFile(tipo, state[tipo].items);
      marcarDirty(tipo, false);
      feedback.textContent = 'Alterações salvas! Já estão no ar.';
      feedback.className = 'admin-feedback success';
    } catch (err) {
      feedback.textContent = err.message;
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
  // ---------- Clientes (pasta por cliente, com relatórios de fechamento) ----------

  const clientesState = { itens: [] };

  async function apiClientes() {
    const res = await fetch(`${config.apiUrl}/api/clientes`, { headers: { Authorization: authHeader } });
    const body = await res.json().catch(() => ([]));
    if (!res.ok) throw new Error(body.message || `Erro (HTTP ${res.status})`);
    return body;
  }
  async function apiSalvarCliente(cliente) {
    const res = await fetch(`${config.apiUrl}/api/cliente`, {
      method: 'PUT',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(cliente),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Erro (HTTP ${res.status})`);
    return body;
  }
  async function apiExcluirCliente(id) {
    const res = await fetch(`${config.apiUrl}/api/cliente?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: authHeader },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Erro (HTTP ${res.status})`);
    return body;
  }

  async function carregarClientes() {
    const lista = document.getElementById('listaClientes');
    const feedback = document.getElementById('feedbackClientes');
    lista.innerHTML = '<p class="loading-placeholder">Carregando...</p>';
    feedback.textContent = '';
    feedback.className = 'admin-feedback';
    try {
      clientesState.itens = await apiClientes();
      renderListaClientes();
    } catch (err) {
      lista.innerHTML = '';
      feedback.textContent = err.message;
      feedback.className = 'admin-feedback error';
    }
  }

  function renderListaClientes() {
    const lista = document.getElementById('listaClientes');
    if (clientesState.itens.length === 0) {
      lista.innerHTML = '<p class="loading-placeholder">Nenhum cliente cadastrado ainda.</p>';
      return;
    }
    lista.innerHTML = clientesState.itens
      .slice()
      .sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''))
      .map((c) => `
        <div class="admin-item" data-id="${escapeHtml(c.id)}">
          <div class="admin-item-info">
            <h4>${escapeHtml(c.nome)}</h4>
            <p>${c.qtdRelatorios || 0} relatório${c.qtdRelatorios === 1 ? '' : 's'} cadastrado${c.qtdRelatorios === 1 ? '' : 's'}</p>
            <span class="admin-item-meta">${c.atualizadoEm ? new Date(c.atualizadoEm).toLocaleString('pt-BR') : ''}</span>
          </div>
          <div class="admin-item-actions">
            <a class="btn btn-ghost btn-sm" href="cliente.html?id=${encodeURIComponent(c.id)}">Abrir</a>
            <button class="btn btn-outline btn-sm" data-acao="remover">Remover</button>
          </div>
        </div>`).join('');

    lista.querySelectorAll('.admin-item').forEach((el) => {
      const id = el.dataset.id;
      el.querySelector('[data-acao="remover"]').addEventListener('click', () => removerCliente(id));
    });
  }

  async function removerCliente(id) {
    if (!confirm('Excluir este cliente e TODOS os relatórios cadastrados nele? Essa ação não pode ser desfeita.')) return;
    const feedback = document.getElementById('feedbackClientes');
    try {
      await apiExcluirCliente(id);
      clientesState.itens = clientesState.itens.filter((c) => c.id !== id);
      renderListaClientes();
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = 'admin-feedback error';
    }
  }

  document.getElementById('btnRecarregarClientes').addEventListener('click', carregarClientes);

  const modalCliente = document.getElementById('modalCliente');
  const formCliente = document.getElementById('formCliente');

  document.getElementById('btnNovoCliente').addEventListener('click', () => {
    formCliente.reset();
    modalCliente.hidden = false;
  });
  document.getElementById('btnCancelarCliente').addEventListener('click', () => { modalCliente.hidden = true; });

  formCliente.addEventListener('submit', async (e) => {
    e.preventDefault();
    const feedback = document.getElementById('feedbackClientes');
    try {
      await apiSalvarCliente({
        nome: document.getElementById('cNome').value.trim(),
        observacoes: document.getElementById('cObservacoes').value.trim(),
      });
      modalCliente.hidden = true;
      await carregarClientes();
      feedback.textContent = 'Cliente criado!';
      feedback.className = 'admin-feedback success';
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = 'admin-feedback error';
    }
  });

  // ---------- Usuários (acessos com permissão limitada) ----------

  const PAPEL_LABEL = { admin: 'Administrador', cliente: 'Cliente', dashboard: 'Dashboard' };
  const usuariosState = { itens: [], editUsername: null };

  async function apiUsuarios() {
    const res = await fetch(`${config.apiUrl}/api/usuarios`, { headers: { Authorization: authHeader } });
    const body = await res.json().catch(() => ([]));
    if (!res.ok) throw new Error(body.message || `Erro (HTTP ${res.status})`);
    return body;
  }
  async function apiSalvarUsuario(usuario) {
    const res = await fetch(`${config.apiUrl}/api/usuario`, {
      method: 'PUT',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(usuario),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Erro (HTTP ${res.status})`);
    return body;
  }
  async function apiExcluirUsuario(username) {
    const res = await fetch(`${config.apiUrl}/api/usuario?username=${encodeURIComponent(username)}`, {
      method: 'DELETE',
      headers: { Authorization: authHeader },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Erro (HTTP ${res.status})`);
    return body;
  }
  async function apiRelatoriosDoCliente(clienteId) {
    const res = await fetch(`${config.apiUrl}/api/relatorios?clienteId=${encodeURIComponent(clienteId)}`, { headers: { Authorization: authHeader } });
    const body = await res.json().catch(() => ([]));
    if (!res.ok) throw new Error(body.message || `Erro (HTTP ${res.status})`);
    return body;
  }

  async function carregarUsuarios() {
    const lista = document.getElementById('listaUsuarios');
    const feedback = document.getElementById('feedbackUsuarios');
    lista.innerHTML = '<p class="loading-placeholder">Carregando...</p>';
    feedback.textContent = '';
    feedback.className = 'admin-feedback';
    try {
      usuariosState.itens = await apiUsuarios();
      renderListaUsuarios();
    } catch (err) {
      lista.innerHTML = '';
      feedback.textContent = err.message;
      feedback.className = 'admin-feedback error';
    }
  }

  function renderListaUsuarios() {
    const lista = document.getElementById('listaUsuarios');
    if (usuariosState.itens.length === 0) {
      lista.innerHTML = '<p class="loading-placeholder">Nenhum usuário adicional cadastrado ainda.</p>';
      return;
    }
    lista.innerHTML = usuariosState.itens
      .slice()
      .sort((a, b) => a.username.localeCompare(b.username))
      .map((u) => {
        const clienteNome = u.papel === 'cliente' ? (clientesState.itens.find((c) => c.id === u.clienteId)?.nome || u.clienteId) : '';
        const escopo = u.papel === 'admin' ? '' : u.papel === 'cliente' ? ` · ${escapeHtml(clienteNome)}` : ` · relatório ${escapeHtml(u.relatorioId || '')}`;
        return `
          <div class="admin-item ${u.ativo === false ? 'inativo' : ''}" data-username="${escapeHtml(u.username)}">
            <div class="admin-item-info">
              <h4>${escapeHtml(u.nome)} <small>(${escapeHtml(u.username)})</small></h4>
              <p>${PAPEL_LABEL[u.papel] || u.papel}${escopo}</p>
              <span class="admin-item-meta">${u.ativo === false ? 'Inativo' : 'Ativo'}</span>
            </div>
            <div class="admin-item-actions">
              <button class="btn btn-ghost btn-sm" data-acao="editar">Editar</button>
              <button class="btn btn-outline btn-sm" data-acao="remover">Remover</button>
            </div>
          </div>`;
      }).join('');

    lista.querySelectorAll('.admin-item').forEach((el) => {
      const username = el.dataset.username;
      el.querySelector('[data-acao="editar"]').addEventListener('click', () => abrirModalUsuario(username));
      el.querySelector('[data-acao="remover"]').addEventListener('click', () => removerUsuario(username));
    });
  }

  async function removerUsuario(username) {
    if (!confirm(`Excluir o acesso de "${username}"?`)) return;
    const feedback = document.getElementById('feedbackUsuarios');
    try {
      await apiExcluirUsuario(username);
      usuariosState.itens = usuariosState.itens.filter((u) => u.username !== username);
      renderListaUsuarios();
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = 'admin-feedback error';
    }
  }

  document.getElementById('btnRecarregarUsuarios').addEventListener('click', carregarUsuarios);

  const modalUsuario = document.getElementById('modalUsuario');
  const formUsuario = document.getElementById('formUsuario');
  const uPapel = document.getElementById('uPapel');
  const uSenha = document.getElementById('uSenha');
  const uUsername = document.getElementById('uUsername');
  const campoUsuarioCliente = document.getElementById('campoUsuarioCliente');
  const campoUsuarioRelatorio = document.getElementById('campoUsuarioRelatorio');
  const uCliente = document.getElementById('uCliente');
  const uRelatorioCliente = document.getElementById('uRelatorioCliente');
  const uRelatorio = document.getElementById('uRelatorio');

  function preencherSelectClientes(select) {
    select.innerHTML = clientesState.itens
      .slice()
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.nome)}</option>`).join('');
  }

  async function atualizarSelectRelatorios(clienteId, relatorioIdSelecionado) {
    uRelatorio.innerHTML = '<option value="">Carregando...</option>';
    try {
      const itens = await apiRelatoriosDoCliente(clienteId);
      if (itens.length === 0) {
        uRelatorio.innerHTML = '<option value="">Nenhum relatório cadastrado para esse cliente</option>';
        return;
      }
      uRelatorio.innerHTML = itens
        .map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.tipo)} · ${escapeHtml(r.periodo)}</option>`).join('');
      if (relatorioIdSelecionado) uRelatorio.value = relatorioIdSelecionado;
    } catch {
      uRelatorio.innerHTML = '<option value="">Não foi possível carregar os relatórios</option>';
    }
  }

  function atualizarCamposUsuario() {
    const papel = uPapel.value;
    campoUsuarioCliente.style.display = papel === 'cliente' ? 'block' : 'none';
    campoUsuarioRelatorio.style.display = papel === 'dashboard' ? 'block' : 'none';
    document.getElementById('uCliente').required = papel === 'cliente';
    document.getElementById('uRelatorioCliente').required = papel === 'dashboard';
    document.getElementById('uRelatorio').required = papel === 'dashboard';
  }
  uPapel.addEventListener('change', atualizarCamposUsuario);
  uRelatorioCliente.addEventListener('change', () => atualizarSelectRelatorios(uRelatorioCliente.value));

  async function abrirModalUsuario(username) {
    const item = username ? usuariosState.itens.find((u) => u.username === username) : null;
    usuariosState.editUsername = username || null;

    document.getElementById('modalUsuarioTitulo').textContent = item ? 'Editar usuário' : 'Novo usuário';
    uUsername.value = item?.username || '';
    uUsername.disabled = !!item;
    document.getElementById('uNome').value = item?.nome || '';
    uSenha.value = '';
    uSenha.placeholder = item ? 'Deixe em branco para manter a senha atual' : 'Senha de acesso';
    uPapel.value = item?.papel || 'cliente';
    document.getElementById('uAtivo').checked = item ? item.ativo !== false : true;

    preencherSelectClientes(uCliente);
    preencherSelectClientes(uRelatorioCliente);

    if (item?.papel === 'cliente' && item.clienteId) uCliente.value = item.clienteId;
    if (item?.papel === 'dashboard') {
      // Descobre o cliente dono do relatório pra pré-selecionar o combo em cascata.
      let clienteDoRelatorio = clientesState.itens[0]?.id;
      for (const c of clientesState.itens) {
        const itens = await apiRelatoriosDoCliente(c.id).catch(() => []);
        if (itens.some((r) => r.id === item.relatorioId)) { clienteDoRelatorio = c.id; break; }
      }
      if (clienteDoRelatorio) {
        uRelatorioCliente.value = clienteDoRelatorio;
        await atualizarSelectRelatorios(clienteDoRelatorio, item.relatorioId);
      }
    }

    atualizarCamposUsuario();
    modalUsuario.hidden = false;
  }

  document.getElementById('btnNovoUsuario').addEventListener('click', () => abrirModalUsuario(null));
  document.getElementById('btnCancelarUsuario').addEventListener('click', () => { modalUsuario.hidden = true; });

  formUsuario.addEventListener('submit', async (e) => {
    e.preventDefault();
    const feedback = document.getElementById('feedbackUsuarios');
    const dados = {
      username: uUsername.value.trim(),
      nome: document.getElementById('uNome').value.trim(),
      senha: uSenha.value,
      papel: uPapel.value,
      clienteId: uPapel.value === 'cliente' ? uCliente.value : null,
      relatorioId: uPapel.value === 'dashboard' ? uRelatorio.value : null,
      ativo: document.getElementById('uAtivo').checked,
    };
    try {
      await apiSalvarUsuario(dados);
      modalUsuario.hidden = true;
      await carregarUsuarios();
      feedback.textContent = 'Usuário salvo!';
      feedback.className = 'admin-feedback success';
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = 'admin-feedback error';
    }
  });

})();
