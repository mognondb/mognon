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
    painel.hidden = true;
    loginScreen.hidden = false;
    passInput.value = '';
    userInput.focus();
  });

  // Se já existe uma sessão ativa nesta aba (ex: recarregou a página), reentra direto
  if (authHeader && config.apiUrl) {
    fetch(`${config.apiUrl}/api/login`, { headers: { Authorization: authHeader } })
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
    carregarRelatorios();
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

  // ---------- Relatórios de clientes (fechamento mensal p/ apresentação) ----------

  const relatoriosState = { itens: [], editId: null };

  function numOuNull(valorStr) {
    if (valorStr === '' || valorStr == null) return null;
    const n = parseFloat(String(valorStr).replace(',', '.'));
    return Number.isNaN(n) ? null : n;
  }
  function num(valorStr) { return numOuNull(valorStr) ?? 0; }

  // "Label | Valor | Tipo" (uma linha por item) <-> [{label, valor, tipo}]
  function linhasParaObjetos(texto, campos, numericos = []) {
    return (texto || '').split('\n').map((l) => l.trim()).filter(Boolean).map((linha) => {
      const partes = linha.split('|').map((p) => p.trim());
      const obj = {};
      campos.forEach((campo, i) => {
        let v = partes[i] ?? '';
        if (numericos.includes(campo)) v = num(v);
        obj[campo] = v;
      });
      return obj;
    });
  }
  function objetosParaLinhas(lista, campos) {
    return (lista || []).map((obj) => campos.map((c) => obj[c] ?? '').join(' | ')).join('\n');
  }
  function linhasSimples(texto) {
    return (texto || '').split('\n').map((l) => l.trim()).filter(Boolean);
  }

  async function apiRelatorios() {
    const res = await fetch(`${config.apiUrl}/api/relatorios`, { headers: { Authorization: authHeader } });
    const body = await res.json().catch(() => ([]));
    if (!res.ok) throw new Error(body.message || `Erro (HTTP ${res.status})`);
    return body;
  }
  async function apiGetRelatorio(id) {
    const res = await fetch(`${config.apiUrl}/api/relatorio?id=${encodeURIComponent(id)}`, { headers: { Authorization: authHeader } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Erro (HTTP ${res.status})`);
    return body;
  }
  async function apiSalvarRelatorio(relatorio) {
    const res = await fetch(`${config.apiUrl}/api/relatorio`, {
      method: 'PUT',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(relatorio),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Erro (HTTP ${res.status})`);
    return body;
  }
  async function apiExcluirRelatorio(id) {
    const res = await fetch(`${config.apiUrl}/api/relatorio?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: authHeader },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Erro (HTTP ${res.status})`);
    return body;
  }

  async function carregarRelatorios() {
    const lista = document.getElementById('listaRelatorios');
    const feedback = document.getElementById('feedbackRelatorios');
    lista.innerHTML = '<p class="loading-placeholder">Carregando...</p>';
    feedback.textContent = '';
    feedback.className = 'admin-feedback';
    try {
      relatoriosState.itens = await apiRelatorios();
      renderListaRelatorios();
    } catch (err) {
      lista.innerHTML = '';
      feedback.textContent = err.message;
      feedback.className = 'admin-feedback error';
    }
  }

  function renderListaRelatorios() {
    const lista = document.getElementById('listaRelatorios');
    if (relatoriosState.itens.length === 0) {
      lista.innerHTML = '<p class="loading-placeholder">Nenhum relatório cadastrado ainda.</p>';
      return;
    }
    lista.innerHTML = relatoriosState.itens
      .slice()
      .sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''))
      .map((r) => `
        <div class="admin-item" data-id="${escapeHtml(r.id)}">
          <div class="admin-item-icon">📑</div>
          <div class="admin-item-info">
            <h4>${escapeHtml(r.cliente)}</h4>
            <p>${escapeHtml(r.periodo)}</p>
            <span class="admin-item-meta">${r.atualizadoEm ? new Date(r.atualizadoEm).toLocaleString('pt-BR') : ''}</span>
          </div>
          <div class="admin-item-actions">
            <a class="btn btn-ghost btn-sm" href="relatorio.html?id=${encodeURIComponent(r.id)}" target="_blank" rel="noopener">Abrir</a>
            <button class="btn btn-ghost btn-sm" data-acao="editar">Editar</button>
            <button class="btn btn-outline btn-sm" data-acao="remover">Remover</button>
          </div>
        </div>`).join('');

    lista.querySelectorAll('.admin-item').forEach((el) => {
      const id = el.dataset.id;
      el.querySelector('[data-acao="editar"]').addEventListener('click', () => abrirModalRelatorio(id));
      el.querySelector('[data-acao="remover"]').addEventListener('click', () => removerRelatorio(id));
    });
  }

  async function removerRelatorio(id) {
    if (!confirm('Excluir este relatório definitivamente?')) return;
    const feedback = document.getElementById('feedbackRelatorios');
    try {
      await apiExcluirRelatorio(id);
      relatoriosState.itens = relatoriosState.itens.filter((r) => r.id !== id);
      renderListaRelatorios();
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = 'admin-feedback error';
    }
  }

  document.getElementById('btnRecarregarRelatorios').addEventListener('click', carregarRelatorios);

  // ---------- Modal Relatório ----------

  const modalRelatorio = document.getElementById('modalRelatorio');
  const formRelatorio2 = document.getElementById('formRelatorio2');

  function limparFormRelatorio() {
    formRelatorio2.reset();
  }

  function preencherFormRelatorio(r) {
    document.getElementById('rCliente').value = r.cliente || '';
    document.getElementById('rPeriodo').value = r.periodo || '';
    document.getElementById('rPreparadoPor').value = r.preparadoPor || '';
    document.getElementById('rDataPreparo').value = r.dataPreparo || '';
    document.getElementById('rResumo').value = (r.resumoExecutivo || []).join('\n');

    const k = r.kpis || {};
    document.getElementById('rKpiReceita').value = k.receitaOperacional ?? '';
    document.getElementById('rKpiDespesas').value = k.despesasOperacionais ?? '';
    document.getElementById('rKpiResultado').value = k.resultadoOperacional ?? '';
    document.getElementById('rKpiMargem').value = k.margemOperacional != null ? (k.margemOperacional * 100) : '';
    document.getElementById('rKpiCaixaMes').value = k.resultadoCaixaMes ?? '';
    document.getElementById('rKpiCaixaSemEmprestimo').value = k.caixaSemEmprestimo ?? '';
    document.getElementById('rKpiSessoes').value = k.sessoesRealizadas ?? '';
    document.getElementById('rKpiTicket').value = k.ticketMedio ?? '';

    document.getElementById('rFormacaoTitulo').value = r.formacaoCaixa?.titulo || '';
    document.getElementById('rFormacaoItens').value = objetosParaLinhas(r.formacaoCaixa?.itens, ['label', 'valor', 'tipo']);
    document.getElementById('rReceitaServico').value = objetosParaLinhas(r.receitaPorServico, ['label', 'valor']);
    document.getElementById('rDespesasGrupo').value = objetosParaLinhas(r.despesasPorGrupo, ['label', 'valor']);
    document.getElementById('rDespesasSub').value = objetosParaLinhas(r.despesasPorSubcategoria, ['label', 'valor']);
    document.getElementById('rProducao').value = objetosParaLinhas(r.producaoPorProfissional, ['profissional', 'sessoes', 'produzido', 'recebido']);
    document.getElementById('rCaixaConta').value = objetosParaLinhas(r.caixaPorConta, ['conta', 'entradas', 'saidas']);
    document.getElementById('rAPagarMes').value = objetosParaLinhas(r.contasAPagarPorMes, ['mes', 'valor']);
    document.getElementById('rAPagarCategoria').value = objetosParaLinhas(r.contasAPagarPorCategoria, ['label', 'valor']);
    document.getElementById('rPendencias').value = objetosParaLinhas(r.pendencias, ['item', 'situacao', 'necessario']);
    document.getElementById('rPassos').value = objetosParaLinhas(r.proximosPassos, ['prazo', 'responsavel', 'titulo', 'descricao']);
    document.getElementById('rFontes').value = r.fontes || '';
  }

  async function abrirModalRelatorio(id) {
    relatoriosState.editId = id || null;
    limparFormRelatorio();
    document.getElementById('modalRelatorioTitulo').textContent = id ? 'Editar relatório' : 'Novo relatório';
    modalRelatorio.hidden = false;
    if (id) {
      try {
        const r = await apiGetRelatorio(id);
        preencherFormRelatorio(r);
      } catch (err) {
        alert('Não foi possível carregar o relatório: ' + err.message);
        modalRelatorio.hidden = true;
      }
    }
  }

  document.getElementById('btnNovoRelatorio').addEventListener('click', () => abrirModalRelatorio(null));
  document.getElementById('btnCancelarRelatorio').addEventListener('click', () => { modalRelatorio.hidden = true; });

  formRelatorio2.addEventListener('submit', async (e) => {
    e.preventDefault();
    const feedback = document.getElementById('feedbackRelatorios');
    const relatorio = {
      id: relatoriosState.editId || undefined,
      cliente: document.getElementById('rCliente').value.trim(),
      periodo: document.getElementById('rPeriodo').value.trim(),
      preparadoPor: document.getElementById('rPreparadoPor').value.trim(),
      dataPreparo: document.getElementById('rDataPreparo').value.trim(),
      resumoExecutivo: linhasSimples(document.getElementById('rResumo').value),
      kpis: {
        receitaOperacional: numOuNull(document.getElementById('rKpiReceita').value),
        despesasOperacionais: numOuNull(document.getElementById('rKpiDespesas').value),
        resultadoOperacional: numOuNull(document.getElementById('rKpiResultado').value),
        margemOperacional: numOuNull(document.getElementById('rKpiMargem').value) != null ? num(document.getElementById('rKpiMargem').value) / 100 : null,
        resultadoCaixaMes: numOuNull(document.getElementById('rKpiCaixaMes').value),
        caixaSemEmprestimo: numOuNull(document.getElementById('rKpiCaixaSemEmprestimo').value),
        sessoesRealizadas: numOuNull(document.getElementById('rKpiSessoes').value),
        ticketMedio: numOuNull(document.getElementById('rKpiTicket').value),
      },
      formacaoCaixa: {
        titulo: document.getElementById('rFormacaoTitulo').value.trim(),
        itens: linhasParaObjetos(document.getElementById('rFormacaoItens').value, ['label', 'valor', 'tipo'], ['valor']),
      },
      receitaPorServico: linhasParaObjetos(document.getElementById('rReceitaServico').value, ['label', 'valor'], ['valor']),
      despesasPorGrupo: linhasParaObjetos(document.getElementById('rDespesasGrupo').value, ['label', 'valor'], ['valor']),
      despesasPorSubcategoria: linhasParaObjetos(document.getElementById('rDespesasSub').value, ['label', 'valor'], ['valor']),
      producaoPorProfissional: linhasParaObjetos(document.getElementById('rProducao').value, ['profissional', 'sessoes', 'produzido', 'recebido'], ['sessoes', 'produzido', 'recebido']),
      caixaPorConta: linhasParaObjetos(document.getElementById('rCaixaConta').value, ['conta', 'entradas', 'saidas'], ['entradas', 'saidas']),
      contasAPagarPorMes: linhasParaObjetos(document.getElementById('rAPagarMes').value, ['mes', 'valor'], ['valor']),
      contasAPagarPorCategoria: linhasParaObjetos(document.getElementById('rAPagarCategoria').value, ['label', 'valor'], ['valor']),
      pendencias: linhasParaObjetos(document.getElementById('rPendencias').value, ['item', 'situacao', 'necessario'], []),
      proximosPassos: linhasParaObjetos(document.getElementById('rPassos').value, ['prazo', 'responsavel', 'titulo', 'descricao'], []),
      fontes: document.getElementById('rFontes').value.trim(),
    };

    try {
      await apiSalvarRelatorio(relatorio);
      modalRelatorio.hidden = true;
      await carregarRelatorios();
      feedback.textContent = 'Relatório salvo!';
      feedback.className = 'admin-feedback success';
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = 'admin-feedback error';
    }
  });

  // ---------- Importar planilha (.xlsx) ----------

  const NOMES_COLUNAS = {
    receitaPorServico: ['label', 'valor'],
    despesasPorGrupo: ['label', 'valor'],
    despesasPorSubcategoria: ['label', 'valor'],
    producaoPorProfissional: ['profissional', 'sessoes', 'produzido', 'recebido'],
    caixaPorConta: ['conta', 'entradas', 'saidas'],
    contasAPagarPorMes: ['mes', 'valor'],
    contasAPagarPorCategoria: ['label', 'valor'],
    pendencias: ['item', 'situacao', 'necessario'],
    proximosPassos: ['prazo', 'responsavel', 'titulo', 'descricao'],
    formacaoCaixa: ['label', 'valor', 'tipo'],
  };

  function planilhaLinhasParaTexto(linhas) {
    // linhas: array de arrays (sheet_to_json com header:1), primeira linha = cabeçalho
    return linhas.slice(1)
      .filter((linha) => linha.some((v) => v !== undefined && v !== ''))
      .map((linha) => linha.map((v) => v ?? '').join(' | '))
      .join('\n');
  }

  function carregarXlsx(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          resolve(wb);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      reader.readAsArrayBuffer(file);
    });
  }

  function sheetParaLinhas(wb, nome) {
    const ws = wb.Sheets[nome];
    if (!ws) return null;
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  }

  document.getElementById('btnImportarPlanilha').addEventListener('click', () => {
    document.getElementById('inputPlanilha').click();
  });

  document.getElementById('inputPlanilha').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const feedback = document.getElementById('feedbackRelatorios');
    try {
      const wb = await carregarXlsx(file);

      const ident = sheetParaLinhas(wb, 'Identificacao') || [];
      const mapaIdent = {};
      ident.forEach((linha) => { if (linha[0]) mapaIdent[String(linha[0]).trim()] = linha[1]; });

      const kpisLinhas = sheetParaLinhas(wb, 'KPIs') || [];
      const mapaKpis = {};
      kpisLinhas.forEach((linha) => { if (linha[0]) mapaKpis[String(linha[0]).trim()] = linha[1]; });

      const resumo = (sheetParaLinhas(wb, 'ResumoExecutivo') || []).slice(1)
        .map((l) => l[0]).filter(Boolean);

      const fontesLinhas = sheetParaLinhas(wb, 'Fontes') || [];
      const fontes = fontesLinhas[0]?.[0] || '';

      abrirModalRelatorio(null);
      // abrirModalRelatorio(null) já limpa o form; preenche em seguida
      document.getElementById('rCliente').value = mapaIdent['Cliente'] || '';
      document.getElementById('rPeriodo').value = mapaIdent['Periodo'] || '';
      document.getElementById('rPreparadoPor').value = mapaIdent['PreparadoPor'] || '';
      document.getElementById('rDataPreparo').value = mapaIdent['DataPreparo'] || '';
      document.getElementById('rResumo').value = resumo.join('\n');

      document.getElementById('rKpiReceita').value = mapaKpis['ReceitaOperacional'] ?? '';
      document.getElementById('rKpiDespesas').value = mapaKpis['DespesasOperacionais'] ?? '';
      document.getElementById('rKpiResultado').value = mapaKpis['ResultadoOperacional'] ?? '';
      document.getElementById('rKpiMargem').value = mapaKpis['MargemOperacionalPct'] ?? '';
      document.getElementById('rKpiCaixaMes').value = mapaKpis['ResultadoCaixaMes'] ?? '';
      document.getElementById('rKpiCaixaSemEmprestimo').value = mapaKpis['CaixaSemEmprestimo'] ?? '';
      document.getElementById('rKpiSessoes').value = mapaKpis['SessoesRealizadas'] ?? '';
      document.getElementById('rKpiTicket').value = mapaKpis['TicketMedio'] ?? '';

      const formacao = sheetParaLinhas(wb, 'FormacaoCaixa');
      if (formacao) {
        document.getElementById('rFormacaoTitulo').value = String(formacao[0]?.[0] || '').startsWith('Titulo:') ? formacao[0][0].replace('Titulo:', '').trim() : '';
        document.getElementById('rFormacaoItens').value = planilhaLinhasParaTexto(formacao);
      }

      const mapaSheets = {
        rReceitaServico: 'ReceitaPorServico',
        rDespesasGrupo: 'DespesasPorGrupo',
        rDespesasSub: 'DespesasPorSubcategoria',
        rProducao: 'ProducaoPorProfissional',
        rCaixaConta: 'CaixaPorConta',
        rAPagarMes: 'ContasAPagarPorMes',
        rAPagarCategoria: 'ContasAPagarPorCategoria',
        rPendencias: 'Pendencias',
        rPassos: 'ProximosPassos',
      };
      Object.entries(mapaSheets).forEach(([campoId, nomeAba]) => {
        const linhas = sheetParaLinhas(wb, nomeAba);
        if (linhas) document.getElementById(campoId).value = planilhaLinhasParaTexto(linhas);
      });

      document.getElementById('rFontes').value = fontes;

      feedback.textContent = 'Planilha importada — revise os campos antes de salvar.';
      feedback.className = 'admin-feedback success';
    } catch (err) {
      feedback.textContent = 'Não foi possível importar a planilha: ' + err.message;
      feedback.className = 'admin-feedback error';
    } finally {
      e.target.value = '';
    }
  });

  // ---------- Baixar modelo de planilha ----------

  document.getElementById('btnBaixarModelo').addEventListener('click', (e) => {
    e.preventDefault();
    const wb = XLSX.utils.book_new();
    const add = (nome, linhas) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), nome);

    add('Identificacao', [
      ['Campo', 'Valor'],
      ['Cliente', 'Instituto Exemplo'],
      ['Periodo', 'Mês/Ano'],
      ['PreparadoPor', 'CM Soluções Financeiras'],
      ['DataPreparo', 'Mês/Ano'],
    ]);
    add('ResumoExecutivo', [['Frase (uma por linha)'], ['Exemplo: caixa do mês fechou positivo em R$ X.'], ['Exemplo: maior despesa foi...']]);
    add('KPIs', [
      ['Indicador', 'Valor'],
      ['ReceitaOperacional', 0],
      ['DespesasOperacionais', 0],
      ['ResultadoOperacional', 0],
      ['MargemOperacionalPct', 0],
      ['ResultadoCaixaMes', 0],
      ['CaixaSemEmprestimo', ''],
      ['SessoesRealizadas', ''],
      ['TicketMedio', ''],
    ]);
    add('FormacaoCaixa', [['Label', 'Valor', 'Tipo (entrada/saida/total)'], ['Receita', 0, 'entrada'], ['Despesas', 0, 'saida'], ['Caixa', 0, 'total']]);
    add('ReceitaPorServico', [['Label', 'Valor'], ['Serviço exemplo', 0]]);
    add('DespesasPorGrupo', [['Label', 'Valor'], ['Grupo exemplo', 0]]);
    add('DespesasPorSubcategoria', [['Label', 'Valor'], ['Subcategoria exemplo', 0]]);
    add('ProducaoPorProfissional', [['Profissional', 'Sessoes', 'Produzido', 'Recebido'], ['Nome', 0, 0, 0]]);
    add('CaixaPorConta', [['Conta', 'Entradas', 'Saidas'], ['Banco exemplo', 0, 0]]);
    add('ContasAPagarPorMes', [['Mes', 'Valor'], ['Mês 1', 0]]);
    add('ContasAPagarPorCategoria', [['Label', 'Valor'], ['Categoria exemplo', 0]]);
    add('Pendencias', [['Pendencia', 'Situacao', 'Necessario'], ['Exemplo', 'Situação encontrada', 'O que falta']]);
    add('ProximosPassos', [['Prazo', 'Responsavel', 'Titulo', 'Descricao'], ['Até dd/mm', 'Cliente/CM', 'Título', 'Descrição']]);
    add('Fontes', [['Fonte: descreva de onde vieram os dados e a data de referência.']]);

    XLSX.writeFile(wb, 'modelo-relatorio-cm.xlsx');
  });

})();
