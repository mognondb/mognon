(function () {
  'use strict';

  // Endereço do servidor (Cloudflare Worker). Não é segredo — só a senha é.
  const API_URL = 'https://bold-forest-84c8fff.mognon-db.workers.dev';
  const config = { apiUrl: API_URL };

  let authHeader = sessionStorage.getItem('cm_admin_auth') || '';
  let papelSessao = sessionStorage.getItem('cm_admin_papel') || 'admin';

  const params = new URLSearchParams(location.search);
  const clienteId = params.get('id');
  let clienteNome = '';

  const PRODUTOS = {
    fechamento: {
      titulo: 'Fechamento Financeiro',
      dica: 'Fechamento de caixa mensal: receitas, despesas, produção por profissional e (se o cliente tiver) estoque. A seção de estoque só aparece na apresentação se a planilha trouxer itens.',
    },
    orcamento: {
      titulo: 'Acompanhamento Orçamentário',
      dica: 'Orçado x Realizado por categoria — só para clientes que contratam esse acompanhamento.',
    },
    comissoes: {
      titulo: 'Demonstrativo de Comissões',
      dica: 'Comissões por prestador/vendedor: serviço prestado, valor, percentual e descontos. O campo "ramo" é só um rótulo de contexto.',
    },
  };

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }
  function fmtBRL(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
    const res = await fetch(`${config.apiUrl}${path}`, { headers: { Authorization: authHeader } });
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

  async function iniciar() {
    try {
      const cliente = await apiGet(`/api/cliente?id=${encodeURIComponent(clienteId)}`);
      clienteNome = cliente.nome;
      document.getElementById('nomeCliente').textContent = cliente.nome;
      document.title = `${cliente.nome} | CM Soluções Financeiras`;
      painel.hidden = false;
      montarPaineis();
      ativarProduto('fechamento');
    } catch (err) {
      document.getElementById('nomeCliente').textContent = 'Cliente não encontrado';
      painel.hidden = false;
    }
  }

  if (authHeader) {
    loginScreen.hidden = true;
    iniciar();
  }

  // ---------- Monta um painel (toolbar + lista) por tipo de produto ----------

  const estadoPorProduto = {};

  function montarPaineis() {
    const template = document.getElementById('produtoPanelTemplate');
    const container = document.getElementById('paineisProdutos');
    Object.keys(PRODUTOS).forEach((tipo) => {
      const node = template.content.cloneNode(true);
      const secao = node.querySelector('.admin-tab-panel');
      secao.id = `painel-${tipo}`;
      secao.hidden = tipo !== 'fechamento';

      if (papelSessao === 'admin') {
        secao.querySelector('[data-acao="importar"]').addEventListener('click', () => {
          secao.querySelector('[data-acao="inputArquivo"]').click();
        });
        secao.querySelector('[data-acao="inputArquivo"]').addEventListener('change', (e) => handleImportar(tipo, secao, e));
        secao.querySelector('[data-acao="modelo"]').addEventListener('click', (e) => { e.preventDefault(); baixarModelo(tipo); });
        secao.querySelector('[data-acao="embed"]').addEventListener('click', () => abrirModalEmbed(tipo));
      } else {
        secao.querySelector('[data-acao="importar"]').hidden = true;
        secao.querySelector('[data-acao="modelo"]').hidden = true;
        secao.querySelector('[data-acao="embed"]').hidden = true;
      }
      secao.querySelector('[data-acao="recarregar"]').addEventListener('click', () => carregarLista(tipo));

      container.appendChild(node);
      estadoPorProduto[tipo] = { itens: [] };
    });
  }

  document.querySelectorAll('.admin-tabs .admin-tab').forEach((btn) => {
    btn.addEventListener('click', () => ativarProduto(btn.dataset.produto));
  });

  function ativarProduto(tipo) {
    document.querySelectorAll('.admin-tabs .admin-tab').forEach((b) => b.classList.toggle('active', b.dataset.produto === tipo));
    document.querySelectorAll('#paineisProdutos .admin-tab-panel').forEach((p) => { p.hidden = p.id !== `painel-${tipo}`; });
    document.getElementById('dicaProduto').textContent = PRODUTOS[tipo].dica;
    carregarLista(tipo);
  }

  function painelEl(tipo) { return document.getElementById(`painel-${tipo}`); }

  async function carregarLista(tipo) {
    const secao = painelEl(tipo);
    const lista = secao.querySelector('[data-acao="lista"]');
    const feedback = secao.querySelector('[data-acao="feedback"]');
    lista.innerHTML = '<p class="loading-placeholder">Carregando...</p>';
    feedback.textContent = '';
    feedback.className = 'admin-feedback';
    try {
      estadoPorProduto[tipo].itens = await apiGet(`/api/relatorios?clienteId=${encodeURIComponent(clienteId)}&tipo=${tipo}`);
      renderLista(tipo);
    } catch (err) {
      lista.innerHTML = '';
      feedback.textContent = err.message;
      feedback.className = 'admin-feedback error';
    }
  }

  function renderLista(tipo) {
    const secao = painelEl(tipo);
    const lista = secao.querySelector('[data-acao="lista"]');
    const itens = estadoPorProduto[tipo].itens;
    if (itens.length === 0) {
      lista.innerHTML = '<p class="loading-placeholder">Nenhum relatório cadastrado ainda.</p>';
      return;
    }
    lista.innerHTML = itens
      .slice()
      .sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''))
      .map((r) => `
        <div class="admin-item ${r.ativo === false ? 'inativo' : ''}" data-id="${escapeHtml(r.id)}">
          <div class="admin-item-info">
            <h4>${escapeHtml(r.periodo)}</h4>
            <p>${r.atualizadoEm ? new Date(r.atualizadoEm).toLocaleString('pt-BR') : ''}</p>
            <span class="admin-item-meta">${r.modo === 'embed' ? 'Link externo' : 'Importado'} · ${r.ativo === false ? 'Inativo' : 'Ativo'}</span>
          </div>
          <div class="admin-item-actions">
            <a class="btn btn-ghost btn-sm" href="relatorio.html?id=${encodeURIComponent(r.id)}" target="_blank" rel="noopener">Abrir</a>
            ${papelSessao === 'admin' ? `
            <button class="btn btn-ghost btn-sm" data-acao="alternar-ativo">${r.ativo === false ? 'Ativar' : 'Desativar'}</button>
            <button class="btn btn-outline btn-sm" data-acao="remover">Remover</button>` : ''}
          </div>
        </div>`).join('');

    if (papelSessao === 'admin') {
      lista.querySelectorAll('.admin-item').forEach((el) => {
        const id = el.dataset.id;
        el.querySelector('[data-acao="alternar-ativo"]').addEventListener('click', () => alternarAtivo(tipo, id));
        el.querySelector('[data-acao="remover"]').addEventListener('click', () => removerRelatorio(tipo, id));
      });
    }
  }

  async function alternarAtivo(tipo, id) {
    const secao = painelEl(tipo);
    const feedback = secao.querySelector('[data-acao="feedback"]');
    try {
      const atual = await apiGet(`/api/relatorio?id=${encodeURIComponent(id)}`);
      atual.ativo = !atual.ativo;
      await apiSalvarRelatorio(atual);
      await carregarLista(tipo);
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = 'admin-feedback error';
    }
  }

  async function removerRelatorio(tipo, id) {
    if (!confirm('Excluir este relatório definitivamente?')) return;
    const secao = painelEl(tipo);
    const feedback = secao.querySelector('[data-acao="feedback"]');
    try {
      await apiExcluirRelatorio(id);
      estadoPorProduto[tipo].itens = estadoPorProduto[tipo].itens.filter((r) => r.id !== id);
      renderLista(tipo);
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = 'admin-feedback error';
    }
  }

  // ---------- Anexar link público (Power BI / Looker Studio) ----------

  const modalEmbed = document.getElementById('modalEmbed');
  const formEmbed = document.getElementById('formEmbed');
  let embedProdutoAtual = null;

  function abrirModalEmbed(tipo) {
    embedProdutoAtual = tipo;
    formEmbed.reset();
    document.getElementById('modalEmbedTitulo').textContent = `Anexar link público — ${PRODUTOS[tipo].titulo}`;
    modalEmbed.hidden = false;
  }
  document.getElementById('btnCancelarEmbed').addEventListener('click', () => { modalEmbed.hidden = true; });

  formEmbed.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tipo = embedProdutoAtual;
    const secao = painelEl(tipo);
    const feedback = secao.querySelector('[data-acao="feedback"]');
    const relatorio = {
      clienteId,
      cliente: clienteNome,
      tipo,
      modo: 'embed',
      periodo: document.getElementById('eLinkPeriodo').value.trim(),
      descricao: document.getElementById('eLinkDescricao').value.trim(),
      embedUrl: document.getElementById('eLinkUrl').value.trim(),
      ativo: document.getElementById('eLinkAtivo').checked,
    };
    try {
      await apiSalvarRelatorio(relatorio);
      modalEmbed.hidden = true;
      await carregarLista(tipo);
      feedback.textContent = 'Link salvo!';
      feedback.className = 'admin-feedback success';
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = 'admin-feedback error';
    }
  });

  // ---------- Importar planilha (.xlsx) ----------

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

  function mapaDeAba(wb, nome) {
    const ws = wb.Sheets[nome];
    if (!ws) return {};
    const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const mapa = {};
    linhas.forEach((l) => { if (l[0] !== '' && l[0] != null) mapa[String(l[0]).trim()] = l[1]; });
    return mapa;
  }

  function linhasDeAba(wb, nome, campos, numericos = []) {
    const ws = wb.Sheets[nome];
    if (!ws) return [];
    const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).slice(1);
    return linhas
      .filter((l) => l.some((v) => v !== '' && v != null))
      .map((l) => {
        const obj = {};
        campos.forEach((campo, i) => {
          let v = l[i] ?? '';
          if (numericos.includes(campo)) v = Number(v) || 0;
          obj[campo] = v;
        });
        return obj;
      });
  }

  function textoDeAba(wb, nome) {
    const ws = wb.Sheets[nome];
    if (!ws) return '';
    const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    return linhas[0]?.[0] ? String(linhas[0][0]) : '';
  }

  function numOuNull(v) {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }

  function parseFechamento(wb) {
    const ident = mapaDeAba(wb, 'Identificacao');
    const k = mapaDeAba(wb, 'KPIs');
    const estoque = linhasDeAba(wb, 'Estoque', ['produto', 'quantidade', 'valorUnitario'], ['quantidade', 'valorUnitario'])
      .map((e) => ({ ...e, valorTotal: e.quantidade * e.valorUnitario }));
    return {
      tipo: 'fechamento',
      periodo: ident['Periodo'] || '',
      preparadoPor: ident['PreparadoPor'] || '',
      dataPreparo: ident['DataPreparo'] || '',
      resumoExecutivo: linhasDeAba(wb, 'ResumoExecutivo', ['frase']).map((o) => o.frase).filter(Boolean),
      kpis: {
        receitaOperacional: numOuNull(k['ReceitaOperacional']),
        despesasOperacionais: numOuNull(k['DespesasOperacionais']),
        resultadoOperacional: numOuNull(k['ResultadoOperacional']),
        margemOperacional: numOuNull(k['MargemOperacionalPct']) != null ? Number(k['MargemOperacionalPct']) / 100 : null,
        resultadoCaixaMes: numOuNull(k['ResultadoCaixaMes']),
        caixaSemEmprestimo: numOuNull(k['CaixaSemEmprestimo']),
        sessoesRealizadas: numOuNull(k['SessoesRealizadas']),
        ticketMedio: numOuNull(k['TicketMedio']),
      },
      formacaoCaixa: { itens: linhasDeAba(wb, 'FormacaoCaixa', ['label', 'valor', 'tipo'], ['valor']) },
      receitaPorServico: linhasDeAba(wb, 'ReceitaPorServico', ['label', 'valor'], ['valor']),
      despesasPorGrupo: linhasDeAba(wb, 'DespesasPorGrupo', ['label', 'valor'], ['valor']),
      despesasPorSubcategoria: linhasDeAba(wb, 'DespesasPorSubcategoria', ['label', 'valor'], ['valor']),
      producaoPorProfissional: linhasDeAba(wb, 'ProducaoPorProfissional', ['profissional', 'sessoes', 'produzido', 'recebido'], ['sessoes', 'produzido', 'recebido']),
      caixaPorConta: linhasDeAba(wb, 'CaixaPorConta', ['conta', 'entradas', 'saidas'], ['entradas', 'saidas']),
      contasAPagarPorMes: linhasDeAba(wb, 'ContasAPagarPorMes', ['mes', 'valor'], ['valor']),
      contasAPagarPorCategoria: linhasDeAba(wb, 'ContasAPagarPorCategoria', ['label', 'valor'], ['valor']),
      pendencias: linhasDeAba(wb, 'Pendencias', ['item', 'situacao', 'necessario']),
      proximosPassos: linhasDeAba(wb, 'ProximosPassos', ['prazo', 'responsavel', 'titulo', 'descricao']),
      estoque,
      fontes: textoDeAba(wb, 'Fontes'),
    };
  }

  function parseOrcamento(wb) {
    const ident = mapaDeAba(wb, 'Identificacao');
    return {
      tipo: 'orcamento',
      periodo: ident['Periodo'] || '',
      preparadoPor: ident['PreparadoPor'] || '',
      dataPreparo: ident['DataPreparo'] || '',
      categorias: linhasDeAba(wb, 'Categorias', ['categoria', 'tipo', 'orcado', 'realizado'], ['orcado', 'realizado']),
      observacoes: linhasDeAba(wb, 'Observacoes', ['texto']).map((o) => o.texto).filter(Boolean),
      fontes: textoDeAba(wb, 'Fontes'),
    };
  }

  function parseComissoes(wb) {
    const ident = mapaDeAba(wb, 'Identificacao');
    const comissoes = linhasDeAba(
      wb, 'Comissoes',
      ['prestador', 'servico', 'valorServico', 'percComissao', 'valorComissao', 'descontos'],
      ['valorServico', 'percComissao', 'valorComissao', 'descontos'],
    ).map((c) => {
      const valorComissao = c.valorComissao || Math.round(c.valorServico * (c.percComissao / 100) * 100) / 100;
      return { ...c, valorComissao, valorLiquido: valorComissao - (c.descontos || 0) };
    });
    return {
      tipo: 'comissoes',
      periodo: ident['Periodo'] || '',
      preparadoPor: ident['PreparadoPor'] || '',
      dataPreparo: ident['DataPreparo'] || '',
      ramo: ident['Ramo'] || '',
      comissoes,
      fontes: textoDeAba(wb, 'Fontes'),
    };
  }

  const PARSERS = { fechamento: parseFechamento, orcamento: parseOrcamento, comissoes: parseComissoes };

  async function handleImportar(tipo, secao, e) {
    const file = e.target.files[0];
    if (!file) return;
    const feedback = secao.querySelector('[data-acao="feedback"]');
    try {
      const wb = await carregarXlsx(file);
      const relatorio = PARSERS[tipo](wb);
      if (!relatorio.periodo) throw new Error('A planilha não tem o período preenchido na aba "Identificacao".');
      abrirPreview(tipo, relatorio);
    } catch (err) {
      feedback.textContent = 'Não foi possível importar a planilha: ' + err.message;
      feedback.className = 'admin-feedback error';
    } finally {
      e.target.value = '';
    }
  }

  // ---------- Prévia antes de salvar ----------

  const modalPreview = document.getElementById('modalPreview');
  let previewAtual = null;
  let previewTipoAtual = null;

  function resumoPreview(r) {
    if (r.tipo === 'fechamento') {
      return `<ul class="admin-preview-lista">
        <li>Período: <strong>${escapeHtml(r.periodo)}</strong></li>
        <li>${r.resumoExecutivo.length} frase(s) no resumo executivo</li>
        <li>Resultado operacional: ${r.kpis.resultadoOperacional != null ? fmtBRL(r.kpis.resultadoOperacional) : '—'}</li>
        <li>Resultado de caixa do mês: ${r.kpis.resultadoCaixaMes != null ? fmtBRL(r.kpis.resultadoCaixaMes) : '—'}</li>
        <li>${r.receitaPorServico.length} item(ns) de receita por serviço</li>
        <li>${r.despesasPorGrupo.length} grupo(s) de despesa</li>
        <li>${r.producaoPorProfissional.length} profissional(is)</li>
        <li>${r.estoque.length} item(ns) de estoque ${r.estoque.length ? '' : '— seção de estoque não vai aparecer'}</li>
        <li>${r.pendencias.length} pendência(s)</li>
      </ul>`;
    }
    if (r.tipo === 'orcamento') {
      const totalOrcado = r.categorias.reduce((s, c) => s + c.orcado, 0);
      const totalRealizado = r.categorias.reduce((s, c) => s + c.realizado, 0);
      return `<ul class="admin-preview-lista">
        <li>Período: <strong>${escapeHtml(r.periodo)}</strong></li>
        <li>${r.categorias.length} categoria(s)</li>
        <li>Total orçado: ${fmtBRL(totalOrcado)}</li>
        <li>Total realizado: ${fmtBRL(totalRealizado)}</li>
      </ul>`;
    }
    if (r.tipo === 'comissoes') {
      const totalComissao = r.comissoes.reduce((s, c) => s + c.valorComissao, 0);
      const prestadores = new Set(r.comissoes.map((c) => c.prestador)).size;
      return `<ul class="admin-preview-lista">
        <li>Período: <strong>${escapeHtml(r.periodo)}</strong></li>
        <li>Ramo: ${escapeHtml(r.ramo || '—')}</li>
        <li>${r.comissoes.length} lançamento(s), ${prestadores} prestador(es)</li>
        <li>Total de comissões: ${fmtBRL(totalComissao)}</li>
      </ul>`;
    }
    return '';
  }

  function abrirPreview(tipo, relatorio) {
    previewTipoAtual = tipo;
    previewAtual = relatorio;
    document.getElementById('previewResumo').innerHTML = resumoPreview(relatorio);
    modalPreview.hidden = false;
  }
  document.getElementById('btnCancelarPreview').addEventListener('click', () => { modalPreview.hidden = true; });

  document.getElementById('btnConfirmarPreview').addEventListener('click', async () => {
    const tipo = previewTipoAtual;
    const secao = painelEl(tipo);
    const feedback = secao.querySelector('[data-acao="feedback"]');
    try {
      await apiSalvarRelatorio({ ...previewAtual, clienteId, cliente: clienteNome });
      modalPreview.hidden = true;
      await carregarLista(tipo);
      feedback.textContent = 'Relatório salvo!';
      feedback.className = 'admin-feedback success';
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = 'admin-feedback error';
    }
  });

  // ---------- Baixar modelo de planilha ----------

  function sheet(wb, nome, linhas) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), nome);
  }

  function baixarModelo(tipo) {
    const wb = XLSX.utils.book_new();

    if (tipo === 'fechamento') {
      sheet(wb, 'Identificacao', [['Campo', 'Valor'], ['Periodo', 'Mês/Ano'], ['PreparadoPor', 'CM Soluções Financeiras'], ['DataPreparo', 'Mês/Ano']]);
      sheet(wb, 'ResumoExecutivo', [['Frase (uma por linha)'], ['Exemplo: caixa do mês fechou positivo em R$ X.']]);
      sheet(wb, 'KPIs', [['Indicador', 'Valor'], ['ReceitaOperacional', 0], ['DespesasOperacionais', 0], ['ResultadoOperacional', 0], ['MargemOperacionalPct', 0], ['ResultadoCaixaMes', 0], ['CaixaSemEmprestimo', ''], ['SessoesRealizadas', ''], ['TicketMedio', '']]);
      sheet(wb, 'FormacaoCaixa', [['Label', 'Valor', 'Tipo (entrada/saida/total)'], ['Receita', 0, 'entrada'], ['Despesas', 0, 'saida'], ['Caixa', 0, 'total']]);
      sheet(wb, 'ReceitaPorServico', [['Label', 'Valor'], ['Serviço exemplo', 0]]);
      sheet(wb, 'DespesasPorGrupo', [['Label', 'Valor'], ['Grupo exemplo', 0]]);
      sheet(wb, 'DespesasPorSubcategoria', [['Label', 'Valor'], ['Subcategoria exemplo', 0]]);
      sheet(wb, 'ProducaoPorProfissional', [['Profissional', 'Sessoes', 'Produzido', 'Recebido'], ['Nome', 0, 0, 0]]);
      sheet(wb, 'CaixaPorConta', [['Conta', 'Entradas', 'Saidas'], ['Banco exemplo', 0, 0]]);
      sheet(wb, 'ContasAPagarPorMes', [['Mes', 'Valor'], ['Mês 1', 0]]);
      sheet(wb, 'ContasAPagarPorCategoria', [['Label', 'Valor'], ['Categoria exemplo', 0]]);
      sheet(wb, 'Pendencias', [['Pendencia', 'Situacao', 'Necessario'], ['Exemplo', 'Situação encontrada', 'O que falta']]);
      sheet(wb, 'ProximosPassos', [['Prazo', 'Responsavel', 'Titulo', 'Descricao'], ['Até dd/mm', 'Cliente/CM', 'Título', 'Descrição']]);
      sheet(wb, 'Estoque', [['Produto', 'Quantidade', 'ValorUnitario'], ['(deixe em branco se o cliente não tem estoque)', '', '']]);
      sheet(wb, 'Fontes', [['Fonte: descreva de onde vieram os dados e a data de referência.']]);
      XLSX.writeFile(wb, 'modelo-fechamento-cm.xlsx');
    }

    if (tipo === 'orcamento') {
      sheet(wb, 'Identificacao', [['Campo', 'Valor'], ['Periodo', 'Mês/Ano'], ['PreparadoPor', 'CM Soluções Financeiras'], ['DataPreparo', 'Mês/Ano']]);
      sheet(wb, 'Categorias', [['Categoria', 'Tipo (receita/despesa)', 'Orcado', 'Realizado'], ['Receita de vendas', 'receita', 0, 0], ['Aluguel', 'despesa', 0, 0]]);
      sheet(wb, 'Observacoes', [['Observação (uma por linha)'], ['Exemplo: despesa X ficou acima do orçado por causa de Y.']]);
      sheet(wb, 'Fontes', [['Fonte: descreva de onde vieram os dados e a data de referência.']]);
      XLSX.writeFile(wb, 'modelo-orcamento-cm.xlsx');
    }

    if (tipo === 'comissoes') {
      sheet(wb, 'Identificacao', [['Campo', 'Valor'], ['Periodo', 'Mês/Ano'], ['PreparadoPor', 'CM Soluções Financeiras'], ['DataPreparo', 'Mês/Ano'], ['Ramo', 'Ex: Serviços, Comércio, Saúde...']]);
      sheet(wb, 'Comissoes', [
        ['Prestador', 'Servico', 'ValorServico', 'PercComissao', 'ValorComissao', 'Descontos'],
        ['Nome do prestador/vendedor', 'Serviço ou produto vendido', 0, 0, '(deixe em branco para calcular automático)', 0],
      ]);
      sheet(wb, 'Fontes', [['Fonte: descreva de onde vieram os dados e a data de referência.']]);
      XLSX.writeFile(wb, 'modelo-comissoes-cm.xlsx');
    }
  }

})();
