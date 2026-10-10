(function () {
  'use strict';

  // Endereço do servidor (Cloudflare Worker). Não é segredo — só a senha é.
  const API_URL = 'https://bold-forest-84c8fff.mognon-db.workers.dev';
  const config = { apiUrl: API_URL };

  let authHeader = sessionStorage.getItem('cm_admin_auth') || '';

  const params = new URLSearchParams(location.search);
  const clienteId = params.get('id');
  let clienteNome = '';

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
      const res = await fetch(`${config.apiUrl}/api/login`, { headers: { Authorization: tentativaAuth } });
      if (res.status === 401) throw new Error('Usuário ou senha inválidos.');
      if (!res.ok) throw new Error(`Não foi possível falar com o servidor (HTTP ${res.status}).`);

      authHeader = tentativaAuth;
      sessionStorage.setItem('cm_admin_auth', authHeader);
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
    painel.hidden = true;
    loginScreen.hidden = false;
  });

  async function iniciar() {
    try {
      const cliente = await apiGet(`/api/cliente?id=${encodeURIComponent(clienteId)}`);
      clienteNome = cliente.nome;
      document.getElementById('nomeCliente').textContent = cliente.nome;
      document.title = `${cliente.nome} | CM Soluções Financeiras`;
      painel.hidden = false;
      carregarRelatorios();
    } catch (err) {
      document.getElementById('nomeCliente').textContent = 'Cliente não encontrado';
      painel.hidden = false;
      document.getElementById('listaRelatorios').innerHTML = `<p class="loading-placeholder">${escapeHtml(err.message)}</p>`;
    }
  }

  async function apiGet(path) {
    const res = await fetch(`${config.apiUrl}${path}`, { headers: { Authorization: authHeader } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Erro (HTTP ${res.status})`);
    return body;
  }

  if (authHeader) {
    loginScreen.hidden = true;
    iniciar();
  }

  // ---------- Utilidades de parsing (mesmo formato "Label | Valor" do formulário) ----------

  function numOuNull(valorStr) {
    if (valorStr === '' || valorStr == null) return null;
    const n = parseFloat(String(valorStr).replace(',', '.'));
    return Number.isNaN(n) ? null : n;
  }
  function num(valorStr) { return numOuNull(valorStr) ?? 0; }

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

  // ---------- Relatórios do cliente ----------

  const relatoriosState = { itens: [], editId: null };

  async function apiRelatorios() {
    return apiGet(`/api/relatorios?clienteId=${encodeURIComponent(clienteId)}`);
  }
  async function apiGetRelatorio(id) {
    return apiGet(`/api/relatorio?id=${encodeURIComponent(id)}`);
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
      lista.innerHTML = '<p class="loading-placeholder">Nenhum relatório cadastrado ainda para esse cliente.</p>';
      return;
    }
    lista.innerHTML = relatoriosState.itens
      .slice()
      .sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''))
      .map((r) => `
        <div class="admin-item ${r.ativo === false ? 'inativo' : ''}" data-id="${escapeHtml(r.id)}">
          <div class="admin-item-icon">📑</div>
          <div class="admin-item-info">
            <h4>${escapeHtml(r.periodo)}</h4>
            <p>${r.atualizadoEm ? new Date(r.atualizadoEm).toLocaleString('pt-BR') : ''}</p>
            <span class="admin-item-meta">${r.ativo === false ? 'Inativo' : 'Ativo'}</span>
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
    document.getElementById('rPeriodo').value = r.periodo || '';
    document.getElementById('rPreparadoPor').value = r.preparadoPor || '';
    document.getElementById('rDataPreparo').value = r.dataPreparo || '';
    document.getElementById('rAtivo').checked = r.ativo !== false;
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
      clienteId,
      cliente: clienteNome,
      periodo: document.getElementById('rPeriodo').value.trim(),
      preparadoPor: document.getElementById('rPreparadoPor').value.trim(),
      dataPreparo: document.getElementById('rDataPreparo').value.trim(),
      ativo: document.getElementById('rAtivo').checked,
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

  function planilhaLinhasParaTexto(linhas) {
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
          resolve(XLSX.read(e.target.result, { type: 'array' }));
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
