(function () {
  'use strict';

  // Mesmo endereço de servidor usado pelo painel admin.
  const API_URL = 'https://bold-forest-84c8fff.mognon-db.workers.dev';

  let authHeader = sessionStorage.getItem('cm_admin_auth') || '';
  let papelSessao = sessionStorage.getItem('cm_admin_papel') || 'admin';

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function fmtBRL(valor) {
    const n = Number(valor) || 0;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function fmtPct(valor) {
    return `${(Number(valor) * 100).toFixed(1).replace('.', ',')}%`;
  }

  // ---------- Login ----------

  const loginScreen = document.getElementById('loginScreen');
  const listaWrap = document.getElementById('listaWrap');
  const relApp = document.getElementById('relApp');
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
      iniciar();
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

  // ---------- Carregar lista ou relatório específico ----------

  async function iniciar() {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    if (id) {
      await carregarRelatorio(id);
    } else {
      await carregarLista();
    }
  }

  async function apiGet(path) {
    const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: authHeader } });
    if (res.status === 401) {
      sessionStorage.removeItem('cm_admin_auth');
      sessionStorage.removeItem('cm_admin_papel');
      loginScreen.hidden = false;
      throw new Error('Sessão expirada, faça login de novo.');
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Erro (HTTP ${res.status})`);
    return body;
  }

  async function carregarLista() {
    listaWrap.hidden = false;
    const container = document.getElementById('listaRelatorios');
    try {
      const itens = await apiGet('/api/relatorios');
      if (itens.length === 0) {
        container.innerHTML = '<p class="loading-placeholder">Nenhum relatório cadastrado ainda. Crie um pelo painel administrativo.</p>';
        return;
      }
      container.innerHTML = itens
        .sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''))
        .map((r) => `
          <a class="rel-card" href="relatorio.html?id=${encodeURIComponent(r.id)}">
            <div>
              <h4>${escapeHtml(r.cliente)}</h4>
              <p>${escapeHtml(r.periodo)}</p>
            </div>
          </a>`).join('');
    } catch (err) {
      container.innerHTML = `<p class="loading-placeholder">${escapeHtml(err.message)}</p>`;
    }
  }

  async function carregarRelatorio(id) {
    relApp.hidden = false;
    const main = document.getElementById('relMain');
    main.innerHTML = '<p class="loading-placeholder">Carregando relatório...</p>';
    try {
      const r = await apiGet(`/api/relatorio?id=${encodeURIComponent(id)}`);
      renderizar(r);
    } catch (err) {
      main.innerHTML = `<p class="loading-placeholder">${escapeHtml(err.message)}</p>`;
    }
  }

  // ---------- Render ----------

  function secao(id, eyebrow, titulo, sub, conteudoHtml) {
    return `
      <section class="rel-secao" id="${id}">
        <p class="rel-secao-eyebrow">${escapeHtml(eyebrow)}</p>
        <h2>${escapeHtml(titulo)}</h2>
        ${sub ? `<p class="rel-secao-sub">${escapeHtml(sub)}</p>` : ''}
        ${conteudoHtml}
      </section>`;
  }

  function barrasHtml(itens, { negativo = false } = {}) {
    const max = Math.max(...itens.map((i) => Math.abs(i.valor)), 1);
    return `<div class="rel-barras">${itens.map((i) => {
      const pct = Math.round((Math.abs(i.valor) / max) * 100);
      const classe = i.tipo === 'total' ? 'total' : (i.valor < 0 || negativo ? 'saida' : '');
      return `
        <div class="rel-barra-linha">
          <span class="rel-barra-label">${escapeHtml(i.label)}</span>
          <span class="rel-barra-trilha"><span class="rel-barra-preenchimento ${classe}" style="width:${pct}%"></span></span>
          <span class="rel-barra-valor ${i.valor < 0 ? 'neg' : ''}">${fmtBRL(i.valor)}</span>
        </div>`;
    }).join('')}</div>`;
  }

  const TITULOS_TIPO = {
    fechamento: 'Fechamento financeiro',
    orcamento: 'Acompanhamento orçamentário',
    comissoes: 'Demonstrativo de comissões',
  };

  function finalizar(secoes, nav) {
    document.getElementById('relMain').innerHTML = secoes.join('');
    document.getElementById('navLista').innerHTML = nav.map(([id, label]) =>
      `<li><a href="#${id}">${escapeHtml(label)}</a></li>`).join('');

    const links = Array.from(document.querySelectorAll('.rel-nav-lista a'));
    const alvos = links.map((l) => document.getElementById(l.getAttribute('href').slice(1))).filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const link = links.find((l) => l.getAttribute('href') === `#${entry.target.id}`);
        if (!link) return;
        links.forEach((l) => l.classList.remove('ativo'));
        link.classList.add('ativo');
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    alvos.forEach((el) => observer.observe(el));
  }

  function renderizar(r) {
    document.getElementById('navCliente').textContent = r.cliente || '—';
    document.getElementById('navPeriodo').textContent = r.periodo || '—';
    document.title = `${r.cliente} · ${r.periodo} | CM Soluções Financeiras`;
    const voltar = document.querySelector('.rel-nav-voltar');
    if (voltar) {
      if (r.clienteId && papelSessao === 'admin') {
        voltar.href = `cliente.html?id=${encodeURIComponent(r.clienteId)}`;
      } else {
        voltar.hidden = true;
      }
    }

    if (r.modo === 'embed') return renderizarEmbed(r);
    if (r.tipo === 'orcamento') return renderizarOrcamento(r);
    if (r.tipo === 'comissoes') return renderizarComissoes(r);
    return renderizarFechamento(r);
  }

  // ---------- Embed (Power BI / Looker Studio) ----------

  function renderizarEmbed(r) {
    const titulo = TITULOS_TIPO[r.tipo] || 'Dashboard';
    const secoes = [`
      <div class="rel-capa">
        <p class="rel-capa-eyebrow">${escapeHtml(titulo)}</p>
        <h1>${escapeHtml(r.cliente)} — ${escapeHtml(r.periodo)}</h1>
        ${r.descricao ? `<p>${escapeHtml(r.descricao)}</p>` : ''}
      </div>
      <section class="rel-secao" id="dashboard">
        <div class="rel-embed-wrap">
          <iframe class="rel-embed-frame" src="${escapeHtml(r.embedUrl)}" loading="lazy" allowfullscreen></iframe>
        </div>
      </section>`];
    finalizar(secoes, [['dashboard', 'Dashboard']]);
  }

  // ---------- Fechamento financeiro ----------

  function renderizarFechamento(r) {
    const secoes = [];
    const nav = [];

    // Capa
    secoes.push(`
      <div class="rel-capa">
        <p class="rel-capa-eyebrow">Fechamento financeiro</p>
        <h1>${escapeHtml(r.cliente)} — ${escapeHtml(r.periodo)}</h1>
        <p>Preparado por ${escapeHtml(r.preparadoPor || 'CM Soluções Financeiras')}${r.dataPreparo ? ` · ${escapeHtml(r.dataPreparo)}` : ''}</p>
      </div>`);

    // Resumo executivo
    if (r.resumoExecutivo?.length) {
      nav.push(['resumo', 'Resumo executivo']);
      secoes.push(secao('resumo', 'Visão geral', 'Resumo executivo', '',
        `<ul class="rel-resumo-lista">${r.resumoExecutivo.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`));
    }

    // KPIs
    if (r.kpis) {
      const k = r.kpis;
      const kpiItens = [
        ['Receita operacional', fmtBRL(k.receitaOperacional)],
        ['Despesas operacionais', fmtBRL(k.despesasOperacionais)],
        ['Resultado operacional', `${fmtBRL(k.resultadoOperacional)}${k.margemOperacional != null ? ` (${fmtPct(k.margemOperacional)})` : ''}`],
        ['Resultado de caixa do mês', fmtBRL(k.resultadoCaixaMes), k.resultadoCaixaMes < 0],
        k.caixaSemEmprestimo != null ? ['Caixa sem empréstimo', fmtBRL(k.caixaSemEmprestimo), k.caixaSemEmprestimo < 0] : null,
        k.sessoesRealizadas != null ? ['Sessões realizadas', k.sessoesRealizadas] : null,
        k.ticketMedio != null ? ['Ticket médio', fmtBRL(k.ticketMedio)] : null,
      ].filter(Boolean);
      nav.push(['kpis', 'Indicadores do mês']);
      secoes.push(secao('kpis', 'Números do mês', 'Indicadores do mês', '',
        `<div class="rel-kpis">${kpiItens.map(([label, valor, neg]) =>
          `<div class="rel-kpi"><strong class="${neg ? 'neg' : ''}">${valor}</strong><span>${escapeHtml(label)}</span></div>`
        ).join('')}</div>`));
    }

    // Formação do caixa
    if (r.formacaoCaixa?.itens?.length) {
      nav.push(['formacao', 'Formação do caixa']);
      secoes.push(secao('formacao', 'Como o caixa se formou', 'Formação do resultado de caixa', r.formacaoCaixa.titulo || '',
        barrasHtml(r.formacaoCaixa.itens)));
    }

    // Receita por serviço
    if (r.receitaPorServico?.length) {
      nav.push(['receita', 'Receita por serviço']);
      secoes.push(secao('receita', 'De onde veio', 'Receita por serviço', '', barrasHtml(r.receitaPorServico)));
    }

    // Despesas por grupo
    if (r.despesasPorGrupo?.length) {
      nav.push(['despesas-grupo', 'Despesas por grupo']);
      secoes.push(secao('despesas-grupo', 'Para onde foi', 'Despesas por grupo', '', barrasHtml(r.despesasPorGrupo, { negativo: true })));
    }

    // Despesas por subcategoria
    if (r.despesasPorSubcategoria?.length) {
      nav.push(['despesas-sub', 'Despesas por subcategoria']);
      secoes.push(secao('despesas-sub', 'Detalhe', 'Despesas por subcategoria', '', barrasHtml(r.despesasPorSubcategoria, { negativo: true })));
    }

    // Produção por profissional
    if (r.producaoPorProfissional?.length) {
      const totalSessoes = r.producaoPorProfissional.reduce((s, p) => s + Number(p.sessoes || 0), 0);
      const totalProd = r.producaoPorProfissional.reduce((s, p) => s + Number(p.produzido || 0), 0);
      const totalReceb = r.producaoPorProfissional.reduce((s, p) => s + Number(p.recebido || 0), 0);
      nav.push(['equipe', 'Produção por profissional']);
      secoes.push(secao('equipe', 'Equipe', 'Produção e recebimento por profissional', '', `
        <table class="rel-tabela">
          <thead><tr><th>Profissional</th><th>Sessões</th><th>Produzido</th><th>Recebido</th><th>% recebido</th></tr></thead>
          <tbody>
            ${r.producaoPorProfissional.map((p) => `
              <tr>
                <td>${escapeHtml(p.profissional)}</td>
                <td class="num">${p.sessoes}</td>
                <td class="num">${fmtBRL(p.produzido)}</td>
                <td class="num">${fmtBRL(p.recebido)}</td>
                <td class="num">${p.produzido ? fmtPct(p.recebido / p.produzido) : '—'}</td>
              </tr>`).join('')}
            <tr class="total">
              <td>Total</td>
              <td class="num">${totalSessoes}</td>
              <td class="num">${fmtBRL(totalProd)}</td>
              <td class="num">${fmtBRL(totalReceb)}</td>
              <td class="num">${totalProd ? fmtPct(totalReceb / totalProd) : '—'}</td>
            </tr>
          </tbody>
        </table>`));
    }

    // Caixa por conta
    if (r.caixaPorConta?.length) {
      nav.push(['contas', 'Caixa por conta']);
      secoes.push(secao('contas', 'Contas', 'Movimento de caixa por conta', '', `
        <div class="rel-contas-grid">
          ${r.caixaPorConta.map((c) => {
            const saldo = Number(c.entradas || 0) - Number(c.saidas || 0);
            return `
              <div class="rel-conta-card">
                <h4>${escapeHtml(c.conta)}</h4>
                <div class="saldo ${saldo < 0 ? 'neg' : ''}">${fmtBRL(saldo)}</div>
                <div class="linha"><span>Entradas</span><span>${fmtBRL(c.entradas)}</span></div>
                <div class="linha"><span>Saídas</span><span>${fmtBRL(-Math.abs(c.saidas))}</span></div>
              </div>`;
          }).join('')}
        </div>`));
    }

    // Estoque
    if (r.estoque?.length) {
      const totalQtd = r.estoque.reduce((s, e) => s + Number(e.quantidade || 0), 0);
      const totalValor = r.estoque.reduce((s, e) => s + Number(e.valorTotal || 0), 0);
      nav.push(['estoque', 'Estoque']);
      secoes.push(secao('estoque', 'Posição atual', 'Estoque', '', `
        <table class="rel-tabela">
          <thead><tr><th>Produto</th><th>Quantidade</th><th>Valor unitário</th><th>Valor total</th></tr></thead>
          <tbody>
            ${r.estoque.map((e) => `
              <tr>
                <td>${escapeHtml(e.produto)}</td>
                <td class="num">${e.quantidade}</td>
                <td class="num">${fmtBRL(e.valorUnitario)}</td>
                <td class="num">${fmtBRL(e.valorTotal)}</td>
              </tr>`).join('')}
            <tr class="total">
              <td>Total</td>
              <td class="num">${totalQtd}</td>
              <td></td>
              <td class="num">${fmtBRL(totalValor)}</td>
            </tr>
          </tbody>
        </table>`));
    }

    // Contas a pagar
    if (r.contasAPagarPorMes?.length || r.contasAPagarPorCategoria?.length) {
      nav.push(['apagar', 'Contas a pagar']);
      const porMes = r.contasAPagarPorMes?.length ? barrasHtml(r.contasAPagarPorMes.map((m) => ({ label: m.mes, valor: m.valor })), { negativo: true }) : '';
      const porCat = r.contasAPagarPorCategoria?.length ? barrasHtml(r.contasAPagarPorCategoria.map((c) => ({ label: c.label, valor: c.valor })), { negativo: true }) : '';
      secoes.push(secao('apagar', 'Próximos meses', 'Contas a pagar em aberto', '', `
        ${porMes ? `<h3 class="subtitulo-sm">Por mês</h3>${porMes}` : ''}
        ${porCat ? `<h3 class="subtitulo-sm">Por categoria</h3>${porCat}` : ''}`));
    }

    // Pendências
    if (r.pendencias?.length) {
      nav.push(['pendencias', 'Pendências']);
      secoes.push(secao('pendencias', 'Pontos de atenção', 'Pendências para validação do cliente', '', `
        <table class="rel-tabela">
          <thead><tr><th>Pendência</th><th>Situação encontrada</th><th>O que precisamos</th></tr></thead>
          <tbody>
            ${r.pendencias.map((p) => `<tr><td>${escapeHtml(p.item)}</td><td>${escapeHtml(p.situacao)}</td><td>${escapeHtml(p.necessario)}</td></tr>`).join('')}
          </tbody>
        </table>`));
    }

    // Próximos passos
    if (r.proximosPassos?.length) {
      nav.push(['passos', 'Próximos passos']);
      secoes.push(secao('passos', 'Plano de ação', 'Próximos passos', '', `
        <div class="rel-passos">
          ${r.proximosPassos.map((p) => `
            <div class="rel-passo">
              <div class="rel-passo-prazo">${escapeHtml(p.prazo)}</div>
              <div class="rel-passo-resp">${escapeHtml(p.responsavel)}</div>
              <div class="rel-passo-corpo"><h4>${escapeHtml(p.titulo)}</h4><p>${escapeHtml(p.descricao)}</p></div>
            </div>`).join('')}
        </div>`));
    }

    if (r.fontes) {
      secoes.push(`<p class="rel-fonte">${escapeHtml(r.fontes)}</p>`);
    }

    finalizar(secoes, nav);
  }

  // ---------- Acompanhamento orçamentário ----------

  function renderizarOrcamento(r) {
    const secoes = [];
    const nav = [];

    secoes.push(`
      <div class="rel-capa">
        <p class="rel-capa-eyebrow">Acompanhamento orçamentário</p>
        <h1>${escapeHtml(r.cliente)} — ${escapeHtml(r.periodo)}</h1>
        <p>Preparado por ${escapeHtml(r.preparadoPor || 'CM Soluções Financeiras')}${r.dataPreparo ? ` · ${escapeHtml(r.dataPreparo)}` : ''}</p>
      </div>`);

    if (r.categorias?.length) {
      const totalOrcado = r.categorias.reduce((s, c) => s + Number(c.orcado || 0), 0);
      const totalRealizado = r.categorias.reduce((s, c) => s + Number(c.realizado || 0), 0);
      const totalDesvio = totalRealizado - totalOrcado;
      nav.push(['categorias', 'Orçado vs. Realizado']);
      secoes.push(secao('categorias', 'Por categoria', 'Orçado vs. Realizado', '', `
        <table class="rel-tabela">
          <thead><tr><th>Categoria</th><th>Tipo</th><th>Orçado</th><th>Realizado</th><th>Desvio</th><th>Desvio %</th></tr></thead>
          <tbody>
            ${r.categorias.map((c) => {
              const orcado = Number(c.orcado || 0);
              const realizado = Number(c.realizado || 0);
              const desvio = realizado - orcado;
              const desvioPct = orcado ? desvio / orcado : null;
              return `
                <tr>
                  <td>${escapeHtml(c.categoria)}</td>
                  <td>${escapeHtml(c.tipo)}</td>
                  <td class="num">${fmtBRL(orcado)}</td>
                  <td class="num">${fmtBRL(realizado)}</td>
                  <td class="num ${desvio < 0 ? 'neg' : ''}">${fmtBRL(desvio)}</td>
                  <td class="num ${desvio < 0 ? 'neg' : ''}">${desvioPct != null ? fmtPct(desvioPct) : '—'}</td>
                </tr>`;
            }).join('')}
            <tr class="total">
              <td>Total</td>
              <td></td>
              <td class="num">${fmtBRL(totalOrcado)}</td>
              <td class="num">${fmtBRL(totalRealizado)}</td>
              <td class="num ${totalDesvio < 0 ? 'neg' : ''}">${fmtBRL(totalDesvio)}</td>
              <td class="num ${totalDesvio < 0 ? 'neg' : ''}">${totalOrcado ? fmtPct(totalDesvio / totalOrcado) : '—'}</td>
            </tr>
          </tbody>
        </table>`));
    }

    if (r.observacoes?.length) {
      nav.push(['observacoes', 'Observações']);
      secoes.push(secao('observacoes', 'Pontos de atenção', 'Observações', '',
        `<ul class="rel-resumo-lista">${r.observacoes.map((o) => `<li>${escapeHtml(o)}</li>`).join('')}</ul>`));
    }

    if (r.fontes) {
      secoes.push(`<p class="rel-fonte">${escapeHtml(r.fontes)}</p>`);
    }

    finalizar(secoes, nav);
  }

  // ---------- Demonstrativo de comissões ----------

  function renderizarComissoes(r) {
    const secoes = [];
    const nav = [];

    secoes.push(`
      <div class="rel-capa">
        <p class="rel-capa-eyebrow">Demonstrativo de comissões${r.ramo ? ` · ${escapeHtml(r.ramo)}` : ''}</p>
        <h1>${escapeHtml(r.cliente)} — ${escapeHtml(r.periodo)}</h1>
        <p>Preparado por ${escapeHtml(r.preparadoPor || 'CM Soluções Financeiras')}${r.dataPreparo ? ` · ${escapeHtml(r.dataPreparo)}` : ''}</p>
      </div>`);

    if (r.comissoes?.length) {
      const totalServico = r.comissoes.reduce((s, c) => s + Number(c.valorServico || 0), 0);
      const totalComissao = r.comissoes.reduce((s, c) => s + Number(c.valorComissao || 0), 0);
      const totalDescontos = r.comissoes.reduce((s, c) => s + Number(c.descontos || 0), 0);
      const totalLiquido = r.comissoes.reduce((s, c) => s + Number(c.valorLiquido || 0), 0);
      nav.push(['comissoes', 'Comissões por serviço']);
      secoes.push(secao('comissoes', 'Detalhe', 'Comissões por serviço', '', `
        <table class="rel-tabela">
          <thead><tr><th>Prestador</th><th>Serviço</th><th>Valor do serviço</th><th>% comissão</th><th>Comissão</th><th>Descontos</th><th>Líquido</th></tr></thead>
          <tbody>
            ${r.comissoes.map((c) => `
              <tr>
                <td>${escapeHtml(c.prestador)}</td>
                <td>${escapeHtml(c.servico)}</td>
                <td class="num">${fmtBRL(c.valorServico)}</td>
                <td class="num">${c.percComissao != null ? fmtPct(c.percComissao / 100) : '—'}</td>
                <td class="num">${fmtBRL(c.valorComissao)}</td>
                <td class="num ${c.descontos ? 'neg' : ''}">${c.descontos ? fmtBRL(-Math.abs(c.descontos)) : fmtBRL(0)}</td>
                <td class="num">${fmtBRL(c.valorLiquido)}</td>
              </tr>`).join('')}
            <tr class="total">
              <td colspan="2">Total</td>
              <td class="num">${fmtBRL(totalServico)}</td>
              <td></td>
              <td class="num">${fmtBRL(totalComissao)}</td>
              <td class="num ${totalDescontos ? 'neg' : ''}">${totalDescontos ? fmtBRL(-Math.abs(totalDescontos)) : fmtBRL(0)}</td>
              <td class="num">${fmtBRL(totalLiquido)}</td>
            </tr>
          </tbody>
        </table>`));

      const porPrestador = Object.values(r.comissoes.reduce((acc, c) => {
        const chave = c.prestador || '—';
        if (!acc[chave]) acc[chave] = { prestador: chave, valor: 0 };
        acc[chave].valor += Number(c.valorLiquido || 0);
        return acc;
      }, {}));
      if (porPrestador.length > 1) {
        nav.push(['por-prestador', 'Por prestador']);
        secoes.push(secao('por-prestador', 'Resumo', 'Comissão líquida por prestador', '', barrasHtml(porPrestador.map((p) => ({ label: p.prestador, valor: p.valor })))));
      }
    }

    if (r.fontes) {
      secoes.push(`<p class="rel-fonte">${escapeHtml(r.fontes)}</p>`);
    }

    finalizar(secoes, nav);
  }

  // Se já tem sessão ativa nesta aba, entra direto
  if (authHeader) {
    loginScreen.hidden = true;
    iniciar();
  }
})();
