(function () {
  'use strict';

  // Endereço do servidor (Cloudflare Worker). Não é segredo — só a senha é.
  const API_URL = 'https://bold-forest-84c8fff.mognon-db.workers.dev';

  let authHeader = sessionStorage.getItem('cm_admin_auth') || '';
  let papelSessao = sessionStorage.getItem('cm_admin_papel') || 'admin';

  const params = new URLSearchParams(location.search);
  const clienteId = params.get('id');
  let clienteNome = '';
  const estado = { itens: [] };

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  // ---------- Login ----------

  const loginScreen = document.getElementById('loginScreen');
  const painel = document.getElementById('painel');
  const loginForm = document.getElementById('loginForm');
  const userInput = document.getElementById('userInput');
  const passInput = document.getElementById('passInput');
  const loginFeedback = document.getElementById('loginFeedback');
  const btnEntrar = document.getElementById('btnEntrar');

  async function tentarEntrar(e) {
    e.preventDefault();
    if (!clienteId) {
      loginFeedback.textContent = 'Cliente não especificado na URL.';
      loginFeedback.className = 'admin-feedback error';
      return;
    }
    btnEntrar.disabled = true;
    loginFeedback.textContent = 'Verificando...';
    loginFeedback.className = 'admin-feedback';

    const tentativaAuth = `Basic ${btoa(`${userInput.value.trim()}:${passInput.value}`)}`;
    try {
      const res = await fetch(`${API_URL}/api/login`, { headers: { Authorization: tentativaAuth } });
      if (res.status === 401) throw new Error('Usuário ou senha inválidos.');
      if (!res.ok) throw new Error(`Não foi possível falar com o servidor (HTTP ${res.status}).`);
      const dadosSessao = await res.json().catch(() => ({}));
      if (dadosSessao.papel === 'cliente' && dadosSessao.clienteId !== clienteId) {
        throw new Error('Este usuário não tem acesso a esta pasta de cliente.');
      }
      if (dadosSessao.papel === 'dashboard') {
        throw new Error('Este usuário só tem acesso a um relatório específico, não a esta pasta.');
      }

      authHeader = tentativaAuth;
      papelSessao = dadosSessao.papel || 'admin';
      sessionStorage.setItem('cm_admin_auth', authHeader);
      sessionStorage.setItem('cm_admin_papel', papelSessao);
      loginScreen.hidden = true;
      await iniciar();
    } catch (err) {
      loginFeedback.textContent = err instanceof TypeError
        ? `Não foi possível conectar ao servidor (${err.message}).`
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
    sessionStorage.removeItem('cm_admin_papel');
    painel.hidden = true;
    loginScreen.hidden = false;
  });

  async function apiGet(path) {
    const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: authHeader } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Erro (HTTP ${res.status})`);
    return body;
  }
  async function apiSalvarRelatorio(relatorio) {
    const res = await fetch(`${API_URL}/api/relatorio`, {
      method: 'PUT',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(relatorio),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Erro (HTTP ${res.status})`);
    return body;
  }
  async function apiExcluirRelatorio(id) {
    const res = await fetch(`${API_URL}/api/relatorio?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: authHeader },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Erro (HTTP ${res.status})`);
    return body;
  }

  async function iniciar() {
    try {
      const cliente = await apiGet(`/api/cliente?id=${encodeURIComponent(clienteId)}`);
      clienteNome = cliente.nome;
      document.getElementById('nomeCliente').textContent = cliente.nome;
      document.title = `${cliente.nome} | CM Soluções Financeiras`;
      painel.hidden = false;
      if (papelSessao !== 'admin') document.getElementById('btnNovoDashboard').hidden = true;
      await carregarLista();
    } catch (err) {
      document.getElementById('nomeCliente').textContent = 'Cliente não encontrado';
      painel.hidden = false;
    }
  }

  if (authHeader) {
    loginScreen.hidden = true;
    iniciar();
  }

  document.getElementById('btnRecarregar').addEventListener('click', carregarLista);

  // ---------- Lista de dashboards do cliente ----------

  function feedbackEl() { return document.getElementById('feedbackLista'); }
  function feedbackErro(msg) {
    const fb = feedbackEl();
    fb.textContent = msg;
    fb.className = 'admin-feedback error';
  }
  function feedbackSucesso(msg) {
    const fb = feedbackEl();
    fb.textContent = msg;
    fb.className = 'admin-feedback success';
  }

  async function carregarLista() {
    const lista = document.getElementById('listaDashboards');
    lista.innerHTML = '<p class="loading-placeholder">Carregando...</p>';
    feedbackEl().textContent = '';
    feedbackEl().className = 'admin-feedback';
    try {
      estado.itens = await apiGet(`/api/relatorios?clienteId=${encodeURIComponent(clienteId)}`);
      renderLista();
    } catch (err) {
      lista.innerHTML = '';
      feedbackErro(err.message);
    }
  }

  function tipoLabel(r) {
    if (r.modo === 'embed') return 'Link externo';
    if (r.tipo === 'personalizado') return 'Construtor';
    if (r.tipo === 'fechamento') return 'Fechamento (antigo)';
    if (r.tipo === 'orcamento') return 'Orçamento (antigo)';
    if (r.tipo === 'comissoes') return 'Comissões (antigo)';
    return r.tipo || '—';
  }

  function linkEditar(r) {
    if (r.tipo === 'personalizado' && r.modo !== 'embed') return `construtor.html?id=${encodeURIComponent(r.id)}`;
    return null;
  }

  function renderLista() {
    const lista = document.getElementById('listaDashboards');
    const itens = estado.itens;
    if (itens.length === 0) {
      lista.innerHTML = '<p class="loading-placeholder">Nenhum dashboard cadastrado ainda.</p>';
      return;
    }
    lista.innerHTML = itens
      .slice()
      .sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''))
      .map((r) => {
        const editar = linkEditar(r);
        return `
        <div class="admin-item ${r.ativo === false ? 'inativo' : ''}" data-id="${escapeHtml(r.id)}">
          <div class="admin-item-info">
            <h4>${escapeHtml(r.periodo)}</h4>
            <p>${r.atualizadoEm ? new Date(r.atualizadoEm).toLocaleString('pt-BR') : ''}</p>
            <span class="admin-item-meta">${tipoLabel(r)} · ${r.ativo === false ? 'Inativo' : 'Ativo'}</span>
          </div>
          <div class="admin-item-actions">
            <a class="btn btn-ghost btn-sm" href="relatorio.html?id=${encodeURIComponent(r.id)}" target="_blank" rel="noopener">Abrir</a>
            ${papelSessao === 'admin' ? `
            ${editar ? `<a class="btn btn-ghost btn-sm" href="${editar}">Editar</a>` : (r.modo === 'embed' ? '<button class="btn btn-ghost btn-sm" data-acao="editar-embed">Editar</button>' : '')}
            <button class="btn btn-ghost btn-sm" data-acao="alternar-ativo">${r.ativo === false ? 'Ativar' : 'Desativar'}</button>
            <button class="btn btn-outline btn-sm" data-acao="remover">Remover</button>` : ''}
          </div>
        </div>`;
      }).join('');

    if (papelSessao === 'admin') {
      lista.querySelectorAll('.admin-item').forEach((el) => {
        const id = el.dataset.id;
        // A lista traz só um resumo (sem embedUrl/descrição) — busca o relatório
        // completo antes de abrir o formulário de edição.
        el.querySelector('[data-acao="editar-embed"]')?.addEventListener('click', async () => {
          try {
            const completo = await apiGet(`/api/relatorio?id=${encodeURIComponent(id)}`);
            abrirModalEmbed(completo);
          } catch (err) {
            feedbackErro(err.message);
          }
        });
        el.querySelector('[data-acao="alternar-ativo"]')?.addEventListener('click', () => alternarAtivo(id));
        el.querySelector('[data-acao="remover"]')?.addEventListener('click', () => removerRelatorio(id));
      });
    }
  }

  async function alternarAtivo(id) {
    try {
      const atual = await apiGet(`/api/relatorio?id=${encodeURIComponent(id)}`);
      atual.ativo = !atual.ativo;
      await apiSalvarRelatorio(atual);
      await carregarLista();
    } catch (err) {
      feedbackErro(err.message);
    }
  }

  async function removerRelatorio(id) {
    if (!confirm('Excluir este dashboard definitivamente?')) return;
    try {
      await apiExcluirRelatorio(id);
      estado.itens = estado.itens.filter((r) => r.id !== id);
      renderLista();
    } catch (err) {
      feedbackErro(err.message);
    }
  }

  // ---------- Novo dashboard (escolha do modo) ----------

  const modalNovo = document.getElementById('modalNovo');
  document.getElementById('btnNovoDashboard').addEventListener('click', () => { modalNovo.hidden = false; });
  document.getElementById('btnCancelarNovo').addEventListener('click', () => { modalNovo.hidden = true; });
  document.getElementById('btnNovoConstrutor').addEventListener('click', () => {
    location.href = `construtor.html?clienteId=${encodeURIComponent(clienteId)}`;
  });
  document.getElementById('btnNovoEmbed').addEventListener('click', () => {
    modalNovo.hidden = true;
    abrirModalEmbed(null);
  });

  // ---------- Link público (Power BI / Looker Studio) — criar ou editar ----------

  const modalEmbed = document.getElementById('modalEmbed');
  const formEmbed = document.getElementById('formEmbed');
  let embedExistente = null;

  function abrirModalEmbed(existente) {
    embedExistente = existente;
    formEmbed.reset();
    document.getElementById('modalEmbedTitulo').textContent = existente ? 'Editar link público' : 'Novo dashboard — Link público';
    document.getElementById('eLinkPeriodo').value = existente?.periodo || '';
    document.getElementById('eLinkDescricao').value = existente?.descricao || '';
    document.getElementById('eLinkUrl').value = existente?.embedUrl || '';
    document.getElementById('eLinkAtivo').checked = existente ? existente.ativo !== false : true;
    modalEmbed.hidden = false;
  }
  document.getElementById('btnCancelarEmbed').addEventListener('click', () => { modalEmbed.hidden = true; });

  formEmbed.addEventListener('submit', async (e) => {
    e.preventDefault();
    const relatorio = {
      ...(embedExistente || {}),
      clienteId,
      cliente: clienteNome,
      tipo: 'personalizado',
      modo: 'embed',
      periodo: document.getElementById('eLinkPeriodo').value.trim(),
      descricao: document.getElementById('eLinkDescricao').value.trim(),
      embedUrl: document.getElementById('eLinkUrl').value.trim(),
      ativo: document.getElementById('eLinkAtivo').checked,
    };
    try {
      await apiSalvarRelatorio(relatorio);
      modalEmbed.hidden = true;
      await carregarLista();
      feedbackSucesso('Link salvo!');
    } catch (err) {
      feedbackErro(err.message);
    }
  });
})();
