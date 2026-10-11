(function () {
  'use strict';

  const API_URL = 'https://bold-forest-84c8fff.mognon-db.workers.dev';

  let authHeader = sessionStorage.getItem('cm_admin_auth') || '';
  let papelSessao = sessionStorage.getItem('cm_admin_papel') || 'admin';

  let relatorio = null;
  let abaAtivaId = null;
  let draft = null;
  let draftWidget = null;

  function gerarId(prefixo) {
    return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // ---------- Login (mesmo padrão das outras telas do painel) ----------

  const loginScreen = document.getElementById('loginScreen');
  const app = document.getElementById('construtorApp');
  const erroInicial = document.getElementById('erroInicial');
  const loginForm = document.getElementById('loginForm');
  const userInput = document.getElementById('userInput');
  const passInput = document.getElementById('passInput');
  const loginFeedback = document.getElementById('loginFeedback');
  const btnEntrar = document.getElementById('btnEntrar');

  async function tentarEntrar(e) {
    e.preventDefault();
    btnEntrar.disabled = true;
    loginFeedback.textContent = 'Verificando...';
    loginFeedback.className = 'admin-feedback';

    const tentativaAuth = `Basic ${btoa(`${userInput.value.trim()}:${passInput.value}`)}`;
    try {
      const res = await fetch(`${API_URL}/api/login`, { headers: { Authorization: tentativaAuth } });
      if (res.status === 401) throw new Error('Usuário ou senha inválidos.');
      if (!res.ok) throw new Error(`Não foi possível falar com o servidor (HTTP ${res.status}).`);
      const dadosSessao = await res.json().catch(() => ({}));

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
    app.hidden = true;
    loginScreen.hidden = false;
  });

  async function apiGet(path) {
    const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: authHeader } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Erro (HTTP ${res.status})`);
    return body;
  }
  async function apiSalvarRelatorio(r) {
    const res = await fetch(`${API_URL}/api/relatorio`, {
      method: 'PUT',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(r),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Erro (HTTP ${res.status})`);
    return body;
  }

  // ---------- Carregar cliente/relatório ----------

  async function iniciar() {
    if (papelSessao !== 'admin') {
      app.hidden = true;
      erroInicial.textContent = 'Acesso restrito ao administrador.';
      erroInicial.hidden = false;
      return;
    }
    const params = new URLSearchParams(location.search);
    const relatorioId = params.get('id');
    let clienteIdParam = params.get('clienteId');
    try {
      if (relatorioId) {
        relatorio = await apiGet(`/api/relatorio?id=${encodeURIComponent(relatorioId)}`);
        if (relatorio.tipo !== 'personalizado' || relatorio.modo === 'embed') {
          throw new Error('Este relatório não foi criado pelo construtor de blocos.');
        }
        if (!relatorio.abas || !relatorio.abas.length) relatorio.abas = [{ id: gerarId('aba'), nome: 'Visão geral', widgets: [] }];
        clienteIdParam = relatorio.clienteId;
      }
      if (!clienteIdParam) throw new Error('Cliente não especificado na URL.');
      const cliente = await apiGet(`/api/cliente?id=${encodeURIComponent(clienteIdParam)}`);
      if (!relatorioId) {
        relatorio = {
          clienteId: clienteIdParam,
          cliente: cliente.nome,
          tipo: 'personalizado',
          modo: 'personalizado',
          periodo: '',
          ativo: true,
          abas: [{ id: gerarId('aba'), nome: 'Visão geral', widgets: [] }],
        };
      }
      document.getElementById('nomeCliente').textContent = cliente.nome;
      document.title = `${cliente.nome} · Construtor | CM Soluções Financeiras`;
      document.getElementById('linkVoltar').href = `cliente.html?id=${encodeURIComponent(clienteIdParam)}`;
      document.getElementById('periodoInput').value = relatorio.periodo || '';
      abaAtivaId = relatorio.abas[0].id;
      app.hidden = false;
      renderAbas();
      renderCanvas();
    } catch (err) {
      app.hidden = true;
      erroInicial.textContent = err.message;
      erroInicial.hidden = false;
    }
  }

  if (authHeader) {
    loginScreen.hidden = true;
    iniciar();
  }

  // ---------- Salvar ----------

  const dirtyBadge = document.getElementById('dirtyBadge');
  const salvarFeedback = document.getElementById('salvarFeedback');
  function marcarAlterado() { dirtyBadge.hidden = false; }
  function limparAlterado() { dirtyBadge.hidden = true; }
  function mostrarFeedback(msg, erro) {
    salvarFeedback.textContent = msg;
    salvarFeedback.className = `admin-feedback ${erro ? 'error' : 'success'}`;
  }

  document.getElementById('btnSalvar').addEventListener('click', async () => {
    relatorio.periodo = document.getElementById('periodoInput').value.trim();
    if (!relatorio.periodo) {
      mostrarFeedback('Informe o período (ex: Outubro/2026).', true);
      return;
    }
    mostrarFeedback('Salvando...', false);
    try {
      relatorio = await apiSalvarRelatorio(relatorio);
      limparAlterado();
      mostrarFeedback('Salvo!', false);
      const params = new URLSearchParams(location.search);
      if (!params.get('id')) {
        params.set('id', relatorio.id);
        history.replaceState(null, '', `construtor.html?${params.toString()}`);
      }
    } catch (err) {
      mostrarFeedback(err.message, true);
    }
  });

  document.getElementById('periodoInput').addEventListener('input', marcarAlterado);

  // ---------- Abas ----------

  function abaAtual() {
    return relatorio.abas.find((a) => a.id === abaAtivaId) || relatorio.abas[0];
  }

  function renderAbas() {
    const nav = document.getElementById('abasNav');
    nav.innerHTML = relatorio.abas.map((aba) => `
      <div class="cw-aba-btn ${aba.id === abaAtivaId ? 'ativa' : ''}" data-aba="${CMWidgets.escapeHtml(aba.id)}">
        <span class="cw-aba-nome" data-aba="${CMWidgets.escapeHtml(aba.id)}" title="Clique duas vezes para renomear">${CMWidgets.escapeHtml(aba.nome)}</span>
        ${relatorio.abas.length > 1 ? `<button type="button" class="cw-aba-remover" data-aba="${CMWidgets.escapeHtml(aba.id)}" title="Remover aba">✕</button>` : ''}
      </div>`).join('')
      + '<button type="button" class="btn btn-ghost btn-sm" id="btnNovaAba">+ Nova aba</button>';

    nav.querySelectorAll('.cw-aba-btn').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.cw-aba-remover')) return;
        abaAtivaId = el.dataset.aba;
        renderAbas();
        renderCanvas();
      });
    });
    nav.querySelectorAll('.cw-aba-nome').forEach((el) => {
      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const aba = relatorio.abas.find((a) => a.id === el.dataset.aba);
        const novoNome = prompt('Nome da aba:', aba.nome);
        if (novoNome && novoNome.trim()) {
          aba.nome = novoNome.trim();
          marcarAlterado();
          renderAbas();
        }
      });
    });
    nav.querySelectorAll('.cw-aba-remover').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (relatorio.abas.length <= 1) return;
        if (!confirm('Remover esta aba e todos os blocos dela?')) return;
        relatorio.abas = relatorio.abas.filter((a) => a.id !== btn.dataset.aba);
        if (abaAtivaId === btn.dataset.aba) abaAtivaId = relatorio.abas[0].id;
        marcarAlterado();
        renderAbas();
        renderCanvas();
      });
    });
    document.getElementById('btnNovaAba').addEventListener('click', () => {
      const nome = prompt('Nome da nova aba:', `Aba ${relatorio.abas.length + 1}`);
      if (!nome || !nome.trim()) return;
      const aba = { id: gerarId('aba'), nome: nome.trim(), widgets: [] };
      relatorio.abas.push(aba);
      abaAtivaId = aba.id;
      marcarAlterado();
      renderAbas();
      renderCanvas();
    });
  }

  // ---------- Canvas / grade de widgets ----------

  function renderCanvas() {
    const aba = abaAtual();
    const canvas = document.getElementById('canvas');
    canvas.innerHTML = CMWidgets.renderGrid(aba.widgets, { editable: true });
    CMWidgets.ativarTooltips(canvas);
    CMWidgets.ativarOrdenacao(canvas);
    CMWidgets.ativarSegmentacao(canvas, aba.widgets);
    ligarInteracoesWidgets(aba, canvas);
  }

  function ligarInteracoesWidgets(aba, canvas) {
    canvas.querySelectorAll('.cw-widget').forEach((card) => {
      const widget = aba.widgets.find((w) => w.id === card.dataset.widgetId);
      if (!widget) return;
      card.querySelector('.cw-btn-editar')?.addEventListener('click', () => abrirEdicaoWidget(widget, aba));
      card.querySelector('.cw-btn-remover')?.addEventListener('click', () => {
        if (!confirm('Remover este bloco do dashboard?')) return;
        aba.widgets = aba.widgets.filter((w) => w.id !== widget.id);
        marcarAlterado();
        renderCanvas();
      });
      card.querySelector('.cw-drag')?.addEventListener('pointerdown', (e) => iniciarArraste(e, card, widget));
      card.querySelector('.cw-resize')?.addEventListener('pointerdown', (e) => iniciarRedimensionamento(e, card, widget));
    });
  }

  function colLargura(grid) {
    const rect = grid.getBoundingClientRect();
    return (rect.width - (CMWidgets.COLS - 1) * CMWidgets.GAP) / CMWidgets.COLS;
  }

  function iniciarArraste(e, card, widget) {
    e.preventDefault();
    const grid = card.parentElement;
    const startX = e.clientX, startY = e.clientY;
    const origX = widget.x, origY = widget.y;
    const passoCol = colLargura(grid) + CMWidgets.GAP;
    const passoLin = CMWidgets.ROW_H + CMWidgets.GAP;
    card.classList.add('cw-arrastando');

    function mover(ev) {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      const novoX = clamp(origX + Math.round(dx / passoCol), 0, CMWidgets.COLS - widget.w);
      const novoY = Math.max(0, origY + Math.round(dy / passoLin));
      card.style.gridColumn = `${novoX + 1} / span ${widget.w}`;
      card.style.gridRow = `${novoY + 1} / span ${widget.h}`;
      widget.x = novoX;
      widget.y = novoY;
    }
    function soltar() {
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerup', soltar);
      card.classList.remove('cw-arrastando');
      marcarAlterado();
    }
    document.addEventListener('pointermove', mover);
    document.addEventListener('pointerup', soltar);
  }

  function iniciarRedimensionamento(e, card, widget) {
    e.preventDefault();
    e.stopPropagation();
    const grid = card.parentElement;
    const startX = e.clientX, startY = e.clientY;
    const origW = widget.w, origH = widget.h;
    const passoCol = colLargura(grid) + CMWidgets.GAP;
    const passoLin = CMWidgets.ROW_H + CMWidgets.GAP;
    card.classList.add('cw-redimensionando');

    function mover(ev) {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      const novoW = clamp(origW + Math.round(dx / passoCol), 2, CMWidgets.COLS - widget.x);
      const novoH = Math.max(2, origH + Math.round(dy / passoLin));
      card.style.gridColumn = `${widget.x + 1} / span ${novoW}`;
      card.style.gridRow = `${widget.y + 1} / span ${novoH}`;
      widget.w = novoW;
      widget.h = novoH;
    }
    function soltar() {
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerup', soltar);
      card.classList.remove('cw-redimensionando');
      marcarAlterado();
    }
    document.addEventListener('pointermove', mover);
    document.addEventListener('pointerup', soltar);
  }

  // ---------- Adicionar bloco ----------

  document.querySelectorAll('[data-add-tipo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tipo = btn.dataset.addTipo;
      const aba = abaAtual();
      const widget = CMWidgets.novoWidget(tipo);
      const maxY = aba.widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0);
      widget.y = maxY;
      aba.widgets.push(widget);
      marcarAlterado();
      renderCanvas();
      abrirEdicaoWidget(widget, aba);
    });
  });

  // ---------- Importar planilha (genérico) ----------

  function lerPrimeiraAba(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      reader.readAsArrayBuffer(file);
    });
  }

  // ---------- Editor de dados por tipo de bloco ----------

  function montarEditorItens(container, ctx, tipo) {
    if (!ctx.itens) ctx.itens = [];
    function repintar() {
      container.innerHTML = `
        <div class="cw-editor-itens">
          ${ctx.itens.map((it, i) => `
            <div class="cw-editor-linha" data-i="${i}">
              <input type="text" class="cw-in-label" placeholder="Rótulo" value="${CMWidgets.escapeHtml(it.label || '')}">
              <input type="number" step="0.01" class="cw-in-valor" placeholder="Valor" value="${it.valor ?? ''}">
              <button type="button" class="cw-icon-btn cw-remover-linha" title="Remover linha">✕</button>
            </div>`).join('')}
        </div>
        <button type="button" class="btn btn-ghost btn-sm" id="btnAddLinha">+ Adicionar linha</button>
        <div class="cw-import-row">
          <button type="button" class="btn btn-outline btn-sm" id="btnImportarItens">Importar planilha (.xlsx)</button>
          <input type="file" accept=".xlsx" hidden id="inputImportarItens">
          <span class="admin-field-hint">Colunas: Rótulo, Valor.</span>
        </div>
        ${tipo === 'barras' ? `
        <label class="checkbox-label"><input type="checkbox" id="chkNegativo" ${ctx.negativo ? 'checked' : ''}> Valores negativos (ex: despesas)</label>
        <label class="checkbox-label"><input type="checkbox" id="chkPercentual" ${ctx.percentual ? 'checked' : ''}> Mostrar % do total no gráfico</label>` : ''}
      `;
      container.querySelectorAll('.cw-editor-linha').forEach((linha) => {
        const i = Number(linha.dataset.i);
        linha.querySelector('.cw-in-label').addEventListener('input', (e) => { ctx.itens[i].label = e.target.value; });
        linha.querySelector('.cw-in-valor').addEventListener('input', (e) => { ctx.itens[i].valor = Number(e.target.value) || 0; });
        linha.querySelector('.cw-remover-linha').addEventListener('click', () => { ctx.itens.splice(i, 1); repintar(); });
      });
      container.querySelector('#btnAddLinha').addEventListener('click', () => { ctx.itens.push({ label: '', valor: 0 }); repintar(); });
      if (tipo === 'barras') {
        container.querySelector('#chkNegativo').addEventListener('change', (e) => { ctx.negativo = e.target.checked; });
        container.querySelector('#chkPercentual').addEventListener('change', (e) => { ctx.percentual = e.target.checked; });
      }
      container.querySelector('#btnImportarItens').addEventListener('click', () => container.querySelector('#inputImportarItens').click());
      container.querySelector('#inputImportarItens').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const linhas = await lerPrimeiraAba(file);
          const comecarEm = (linhas[0] && linhas[0][1] !== '' && isNaN(Number(linhas[0][1]))) ? 1 : 0;
          ctx.itens = linhas.slice(comecarEm)
            .filter((l) => l[0] !== '' && l[0] != null)
            .map((l) => ({ label: String(l[0]), valor: Number(l[1]) || 0 }));
          repintar();
        } catch (err) {
          alert('Não foi possível importar: ' + err.message);
        }
        e.target.value = '';
      });
    }
    repintar();
  }

  function montarEditorTabela(container, ctx) {
    if (!ctx.colunas || !ctx.colunas.length) ctx.colunas = ['Coluna 1', 'Coluna 2'];
    if (!ctx.linhas) ctx.linhas = [];
    function repintar() {
      container.innerHTML = `
        <div class="cw-editor-tabela-scroll">
          <table class="cw-editor-tabela">
            <thead><tr>
              ${ctx.colunas.map((c, ci) => `<th><input type="text" class="cw-in-coluna" data-ci="${ci}" value="${CMWidgets.escapeHtml(c)}">${ctx.colunas.length > 1 ? `<button type="button" class="cw-icon-btn cw-remover-coluna" data-ci="${ci}" title="Remover coluna">✕</button>` : ''}</th>`).join('')}
              <th><button type="button" class="btn btn-ghost btn-sm" id="btnAddColuna">+ Coluna</button></th>
            </tr></thead>
            <tbody>
              ${ctx.linhas.map((linha, li) => `<tr data-li="${li}">
                ${ctx.colunas.map((_, ci) => `<td><input type="text" class="cw-in-celula" data-li="${li}" data-ci="${ci}" value="${CMWidgets.escapeHtml(linha[ci] ?? '')}"></td>`).join('')}
                <td><button type="button" class="cw-icon-btn cw-remover-linha-tabela" data-li="${li}" title="Remover linha">✕</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" id="btnAddLinhaTabela">+ Linha</button>
        <div class="cw-import-row">
          <button type="button" class="btn btn-outline btn-sm" id="btnImportarTabela">Importar planilha (.xlsx)</button>
          <input type="file" accept=".xlsx" hidden id="inputImportarTabela">
          <span class="admin-field-hint">Primeira linha = cabeçalho; as demais = dados.</span>
        </div>
      `;
      container.querySelectorAll('.cw-in-coluna').forEach((inp) => inp.addEventListener('input', (e) => { ctx.colunas[Number(e.target.dataset.ci)] = e.target.value; }));
      container.querySelectorAll('.cw-remover-coluna').forEach((btn) => btn.addEventListener('click', (e) => {
        const ci = Number(e.target.dataset.ci);
        ctx.colunas.splice(ci, 1);
        ctx.linhas.forEach((l) => l.splice(ci, 1));
        repintar();
      }));
      container.querySelector('#btnAddColuna').addEventListener('click', () => {
        ctx.colunas.push(`Coluna ${ctx.colunas.length + 1}`);
        ctx.linhas.forEach((l) => l.push(''));
        repintar();
      });
      container.querySelectorAll('.cw-in-celula').forEach((inp) => inp.addEventListener('input', (e) => { ctx.linhas[Number(e.target.dataset.li)][Number(e.target.dataset.ci)] = e.target.value; }));
      container.querySelectorAll('.cw-remover-linha-tabela').forEach((btn) => btn.addEventListener('click', (e) => { ctx.linhas.splice(Number(e.target.dataset.li), 1); repintar(); }));
      container.querySelector('#btnAddLinhaTabela').addEventListener('click', () => { ctx.linhas.push(ctx.colunas.map(() => '')); repintar(); });
      container.querySelector('#btnImportarTabela').addEventListener('click', () => container.querySelector('#inputImportarTabela').click());
      container.querySelector('#inputImportarTabela').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const linhas = await lerPrimeiraAba(file);
          const semVazias = linhas.filter((l) => l.some((v) => v !== '' && v != null));
          if (!semVazias.length) throw new Error('Planilha vazia.');
          ctx.colunas = semVazias[0].map(String);
          ctx.linhas = semVazias.slice(1).map((l) => ctx.colunas.map((_, i) => (l[i] != null ? String(l[i]) : '')));
          repintar();
        } catch (err) {
          alert('Não foi possível importar: ' + err.message);
        }
        e.target.value = '';
      });
    }
    repintar();
  }

  function montarEditorKpi(container, ctx) {
    container.innerHTML = `
      <label>Valor</label>
      <input type="number" step="0.01" id="kpiValor" value="${ctx.valor ?? 0}">
      <label>Rótulo</label>
      <input type="text" id="kpiRotulo" value="${CMWidgets.escapeHtml(ctx.rotulo || '')}" placeholder="Ex: Receita do mês">
      <label>Formato</label>
      <select id="kpiFormato">
        <option value="moeda" ${ctx.formato === 'moeda' ? 'selected' : ''}>Moeda (R$)</option>
        <option value="numero" ${ctx.formato === 'numero' ? 'selected' : ''}>Número</option>
        <option value="percentual" ${ctx.formato === 'percentual' ? 'selected' : ''}>Porcentagem</option>
      </select>
      <label>Comparação (opcional)</label>
      <input type="text" id="kpiComparacao" value="${CMWidgets.escapeHtml(ctx.comparacao || '')}" placeholder="Ex: +12% vs mês anterior">
    `;
    container.querySelector('#kpiValor').addEventListener('input', (e) => { ctx.valor = Number(e.target.value) || 0; });
    container.querySelector('#kpiRotulo').addEventListener('input', (e) => { ctx.rotulo = e.target.value; });
    container.querySelector('#kpiFormato').addEventListener('change', (e) => { ctx.formato = e.target.value; });
    container.querySelector('#kpiComparacao').addEventListener('input', (e) => { ctx.comparacao = e.target.value; });
  }

  function montarEditorTexto(container, ctx) {
    container.innerHTML = `
      <label>Texto (um parágrafo por linha)</label>
      <textarea id="textoConteudo" rows="6">${CMWidgets.escapeHtml(ctx.texto || '')}</textarea>
    `;
    container.querySelector('#textoConteudo').addEventListener('input', (e) => { ctx.texto = e.target.value; });
  }

  function montarEditorSegmentacao(container, ctx) {
    if (!ctx.segmentos) ctx.segmentos = [];
    function repintar() {
      container.innerHTML = `
        <div class="cw-editor-itens">
          ${ctx.segmentos.map((s, i) => `
            <div class="cw-editor-linha" data-i="${i}" style="grid-template-columns:1fr auto;">
              <input type="text" class="cw-in-seg" placeholder="Ex: Jan/2026" value="${CMWidgets.escapeHtml(s)}">
              <button type="button" class="cw-icon-btn cw-remover-linha" title="Remover">✕</button>
            </div>`).join('')}
        </div>
        <button type="button" class="btn btn-ghost btn-sm" id="btnAddSeg">+ Adicionar período</button>
        <p class="admin-field-hint">Depois de criar os períodos aqui, os outros blocos desta aba podem ter dados
        diferentes para cada período — veja a opção "Aplicar a" ao editar cada bloco.</p>
      `;
      container.querySelectorAll('.cw-editor-linha').forEach((linha) => {
        const i = Number(linha.dataset.i);
        linha.querySelector('.cw-in-seg').addEventListener('input', (e) => { ctx.segmentos[i] = e.target.value; });
        linha.querySelector('.cw-remover-linha').addEventListener('click', () => { ctx.segmentos.splice(i, 1); repintar(); });
      });
      container.querySelector('#btnAddSeg').addEventListener('click', () => { ctx.segmentos.push(''); repintar(); });
    }
    repintar();
  }

  // ---------- Modal de edição de bloco ----------

  const modalWidget = document.getElementById('modalWidget');
  const widgetTituloInput = document.getElementById('widgetTituloInput');
  const widgetCorpoEditor = document.getElementById('widgetCorpoEditor');
  const widgetSeletorPeriodoWrap = document.getElementById('widgetSeletorPeriodoWrap');

  function segmentosDaAba(aba) {
    const w = (aba.widgets || []).find((w) => w.tipo === 'segmentacao');
    return w && w.dados && w.dados.segmentos ? w.dados.segmentos.filter((s) => s && s.trim()) : [];
  }

  function obterContextoDados(d, periodo) {
    if (!periodo || periodo === '__todos__') return d.dados;
    if (!d.dados.porSegmento) d.dados.porSegmento = {};
    if (!d.dados.porSegmento[periodo]) d.dados.porSegmento[periodo] = CMWidgets.dadosVazios(d.tipo);
    if (!d.dados.segmentoPadrao) d.dados.segmentoPadrao = periodo;
    return d.dados.porSegmento[periodo];
  }

  function montarCorpoPorTipo(container, ctx, tipo) {
    container.innerHTML = '';
    if (tipo === 'barras' || tipo === 'linha' || tipo === 'pizza') montarEditorItens(container, ctx, tipo);
    else if (tipo === 'tabela') montarEditorTabela(container, ctx);
    else if (tipo === 'kpi') montarEditorKpi(container, ctx);
    else if (tipo === 'texto') montarEditorTexto(container, ctx);
    else if (tipo === 'segmentacao') montarEditorSegmentacao(container, ctx);
  }

  function abrirEdicaoWidget(widget, aba) {
    draftWidget = widget;
    draft = { tipo: widget.tipo, titulo: widget.titulo || '', dados: JSON.parse(JSON.stringify(widget.dados || {})) };

    document.getElementById('modalWidgetTitulo').textContent = `Editar — ${CMWidgets.TITULOS[widget.tipo] || ''}`;
    widgetTituloInput.value = draft.titulo;

    const segmentos = widget.tipo === 'segmentacao' ? [] : segmentosDaAba(aba);
    if (segmentos.length) {
      widgetSeletorPeriodoWrap.hidden = false;
      widgetSeletorPeriodoWrap.innerHTML = `
        <label>Aplicar a</label>
        <select id="widgetSeletorPeriodo">
          <option value="__todos__">Todos os períodos (mesmo conteúdo)</option>
          ${segmentos.map((s) => `<option value="${CMWidgets.escapeHtml(s)}">${CMWidgets.escapeHtml(s)}</option>`).join('')}
        </select>`;
      const select = document.getElementById('widgetSeletorPeriodo');
      select.addEventListener('change', () => montarCorpoPorTipo(widgetCorpoEditor, obterContextoDados(draft, select.value), draft.tipo));
      montarCorpoPorTipo(widgetCorpoEditor, obterContextoDados(draft, '__todos__'), draft.tipo);
    } else {
      widgetSeletorPeriodoWrap.hidden = true;
      widgetSeletorPeriodoWrap.innerHTML = '';
      montarCorpoPorTipo(widgetCorpoEditor, draft.dados, draft.tipo);
    }

    modalWidget.hidden = false;
  }

  widgetTituloInput.addEventListener('input', (e) => { if (draft) draft.titulo = e.target.value; });

  document.getElementById('btnCancelarWidget').addEventListener('click', () => {
    modalWidget.hidden = true;
    draft = null;
    draftWidget = null;
  });

  document.getElementById('btnSalvarWidget').addEventListener('click', () => {
    if (!draftWidget || !draft) return;
    draftWidget.titulo = draft.titulo;
    draftWidget.dados = draft.dados;
    modalWidget.hidden = true;
    marcarAlterado();
    renderCanvas();
    draft = null;
    draftWidget = null;
  });
  modalWidget.addEventListener('click', (e) => { if (e.target === modalWidget) { modalWidget.hidden = true; draft = null; draftWidget = null; } });
})();
