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

  // Cabeçalho compacto — uma linha, fica sempre visível acima da aba ativa.
  function cabecalho(eyebrow, cliente, periodo, meta) {
    return `
      <div class="rel-topo">
        <p class="rel-topo-eyebrow">${escapeHtml(eyebrow)}</p>
        <h1>${escapeHtml(cliente)} <span class="rel-topo-periodo">— ${escapeHtml(periodo)}</span></h1>
        ${meta ? `<p class="rel-topo-meta">${escapeHtml(meta)}</p>` : ''}
      </div>`;
  }

  // Gráfico de barras horizontais interativo: hover/foco destaca a barra e mostra
  // um tooltip com o valor exato (e, quando fizer sentido, o % do total do grupo).
  function graficoBarras(itens, { negativo = false, percentual = false } = {}) {
    const max = Math.max(...itens.map((i) => Math.abs(i.valor)), 1);
    const total = itens.reduce((s, i) => s + Math.abs(i.valor), 0);
    return `<div class="rel-barras">${itens.map((i) => {
      const pct = Math.round((Math.abs(i.valor) / max) * 100);
      const classe = i.tipo === 'total' ? 'total' : (i.valor < 0 || negativo ? 'saida' : '');
      const participacao = percentual && total ? Math.abs(i.valor) / total : null;
      return `
        <div class="rel-barra-linha" tabindex="0" data-tt-label="${escapeHtml(i.label)}" data-tt-valor="${escapeHtml(fmtBRL(i.valor))}" ${participacao != null ? `data-tt-extra="${escapeHtml(`${fmtPct(participacao)} do total`)}"` : ''}>
          <span class="rel-barra-label">${escapeHtml(i.label)}</span>
          <span class="rel-barra-trilha"><span class="rel-barra-preenchimento ${classe}" style="width:${pct}%"></span></span>
          <span class="rel-barra-valor ${i.valor < 0 ? 'neg' : ''}">${fmtBRL(i.valor)}</span>
        </div>`;
    }).join('')}</div>`;
  }

  // Cartão — agrupa um gráfico/tabela com um título pequeno; vários cabem lado a
  // lado numa grade (.rel-grid), deixando a aba mais compacta e densa em dados.
  function cartao(titulo, conteudoHtml) {
    return `<div class="rel-bloco"><h3>${escapeHtml(titulo)}</h3>${conteudoHtml}</div>`;
  }

  // Envolve um gráfico com um <details> nativo mostrando os mesmos dados em
  // tabela — sempre existe uma forma de ler os valores exatos sem depender do hover.
  function comTabela(graficoHtml, colunas, linhas) {
    const tabela = `
      <table class="rel-tabela">
        <thead><tr>${colunas.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
        <tbody>${linhas.map((linha) => `<tr>${linha.map((v, i) => `<td class="${i === 0 ? '' : 'num'}">${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
    return `${graficoHtml}<details class="rel-ver-tabela"><summary>Ver como tabela</summary>${tabela}</details>`;
  }

  // Dumbbell: orçado -> realizado por categoria, na mesma escala, cor indicando
  // se o realizado ficou dentro (olive) ou fora (vermelho) do orçado.
  function graficoDumbbell(categorias) {
    const max = Math.max(...categorias.flatMap((c) => [Math.abs(c.orcado || 0), Math.abs(c.realizado || 0)]), 1);
    const linhas = categorias.map((c) => {
      const orcado = Number(c.orcado || 0);
      const realizado = Number(c.realizado || 0);
      const pO = (Math.abs(orcado) / max) * 100;
      const pR = (Math.abs(realizado) / max) * 100;
      const despesa = (c.tipo || '').toLowerCase().includes('desp');
      const estourado = despesa ? realizado > orcado : realizado < orcado;
      const lo = Math.min(pO, pR);
      const hi = Math.max(pO, pR);
      const desvio = realizado - orcado;
      return `
        <div class="rel-dumbbell-linha" tabindex="0"
             data-tt-label="${escapeHtml(c.categoria)}"
             data-tt-valor="${escapeHtml(fmtBRL(realizado))}"
             data-tt-extra="${escapeHtml(`Orçado: ${fmtBRL(orcado)} · Desvio: ${fmtBRL(desvio)}`)}">
          <span class="rel-dumbbell-label">${escapeHtml(c.categoria)}</span>
          <span class="rel-dumbbell-trilha">
            <span class="rel-dumbbell-conector" style="left:${lo}%; width:${hi - lo}%"></span>
            <span class="rel-dumbbell-ponto orcado" style="left:${pO}%"></span>
            <span class="rel-dumbbell-ponto realizado ${estourado ? 'estourado' : ''}" style="left:${pR}%"></span>
          </span>
        </div>`;
    }).join('');
    return `
      <div class="rel-dumbbell">${linhas}</div>
      <div class="rel-dumbbell-legenda">
        <span><i class="rel-dumbbell-ponto orcado"></i> Orçado</span>
        <span><i class="rel-dumbbell-ponto realizado"></i> Realizado (dentro do orçado)</span>
        <span><i class="rel-dumbbell-ponto realizado estourado"></i> Realizado (fora do orçado)</span>
      </div>`;
  }

  // ---------- Tooltip compartilhado (barras e dumbbell) ----------

  let tooltipEl = null;
  function garantirTooltip() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'rel-tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltipEl);
    return tooltipEl;
  }

  function mostrarTooltip(alvo, x, y) {
    const tt = garantirTooltip();
    const { ttLabel, ttValor, ttExtra } = alvo.dataset;
    if (!ttLabel) return;
    tt.innerHTML = `<strong>${escapeHtml(ttValor || '')}</strong><span>${escapeHtml(ttLabel)}</span>${ttExtra ? `<small>${escapeHtml(ttExtra)}</small>` : ''}`;
    tt.style.left = `${x}px`;
    tt.style.top = `${y}px`;
    tt.classList.add('ativo');
  }
  function esconderTooltip() {
    if (tooltipEl) tooltipEl.classList.remove('ativo');
  }

  // Liga o tooltip por delegação de evento a todo .rel-barra-linha/.rel-dumbbell-linha
  // inserido no DOM — funciona tanto no mouse (hover) quanto no teclado (foco).
  function ativarTooltips(raiz) {
    raiz.querySelectorAll('.rel-barra-linha[data-tt-label], .rel-dumbbell-linha[data-tt-label]').forEach((el) => {
      // Dashboards personalizados reaproveitam essas mesmas classes (admin/widgets.js) e já
      // ativam seu próprio tooltip — evita ligar o listener duas vezes no mesmo elemento.
      if (el.dataset.ttBound) return;
      el.dataset.ttBound = '1';
      el.addEventListener('pointerenter', (e) => mostrarTooltip(el, e.clientX, e.clientY));
      el.addEventListener('pointermove', (e) => mostrarTooltip(el, e.clientX, e.clientY));
      el.addEventListener('pointerleave', esconderTooltip);
      el.addEventListener('focus', () => {
        const rect = el.getBoundingClientRect();
        mostrarTooltip(el, rect.left + 20, rect.top + rect.height / 2);
      });
      el.addEventListener('blur', esconderTooltip);
    });
  }

  // ---------- Tabelas ordenáveis (clique no cabeçalho) ----------

  function ativarOrdenacao(raiz) {
    raiz.querySelectorAll('.rel-tabela[data-sortable] th[data-sort]').forEach((th, index, todas) => {
      if (th.dataset.sortBound) return;
      th.dataset.sortBound = '1';
      th.addEventListener('click', () => {
        const table = th.closest('table');
        const tbody = table.querySelector('tbody');
        const linhaTotal = tbody.querySelector('tr.total');
        const linhas = Array.from(tbody.querySelectorAll('tr:not(.total)'));
        const colIndex = Array.from(th.parentNode.children).indexOf(th);
        const crescente = !th.classList.contains('asc');

        todas.forEach((t) => t.classList.remove('asc', 'desc'));
        th.classList.add(crescente ? 'asc' : 'desc');

        const tipo = th.dataset.sort;
        linhas.sort((a, b) => {
          const va = a.children[colIndex]?.dataset.v ?? a.children[colIndex]?.textContent ?? '';
          const vb = b.children[colIndex]?.dataset.v ?? b.children[colIndex]?.textContent ?? '';
          const cmp = tipo === 'num'
            ? Number(va) - Number(vb)
            : String(va).localeCompare(String(vb), 'pt-BR');
          return crescente ? cmp : -cmp;
        });

        linhas.forEach((tr) => tbody.appendChild(tr));
        if (linhaTotal) tbody.appendChild(linhaTotal);
      });
    });
  }

  const TITULOS_TIPO = {
    fechamento: 'Fechamento financeiro',
    orcamento: 'Acompanhamento orçamentário',
    comissoes: 'Demonstrativo de comissões',
  };

  // cabecalhoHtml fica sempre visível; secoes[i]/nav[i] são as abas — só uma
  // fica visível por vez, trocada por clique (não é mais âncora de rolagem).
  function finalizar(cabecalhoHtml, fontesHtml, secoes, nav) {
    const main = document.getElementById('relMain');
    const paineisHtml = secoes.map((html, i) =>
      `<div class="rel-tab-painel" data-tab="${nav[i][0]}" ${i === 0 ? '' : 'hidden'}>${html}</div>`).join('');
    main.innerHTML = cabecalhoHtml + paineisHtml + (fontesHtml || '');

    document.getElementById('navLista').innerHTML = nav.map(([id, label], i) =>
      `<li><a href="#" class="${i === 0 ? 'ativo' : ''}" data-tab="${id}">${escapeHtml(label)}</a></li>`).join('');

    ativarTooltips(main);
    ativarOrdenacao(main);

    const links = Array.from(document.querySelectorAll('.rel-nav-lista a'));
    const paineis = Array.from(main.querySelectorAll('.rel-tab-painel'));
    links.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        if (link.classList.contains('ativo')) return;
        links.forEach((l) => l.classList.remove('ativo'));
        link.classList.add('ativo');
        paineis.forEach((p) => { p.hidden = p.dataset.tab !== link.dataset.tab; });
      });
    });
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
    if (r.tipo === 'personalizado') return renderizarPersonalizado(r);
    return renderizarFechamento(r);
  }

  // ---------- Dashboard personalizado (construtor de blocos) ----------

  function renderizarPersonalizado(r) {
    const cabecalhoHtml = cabecalho('Dashboard', r.cliente, r.periodo,
      `Preparado por ${r.preparadoPor || 'CM Soluções Financeiras'}${r.dataPreparo ? ` · ${r.dataPreparo}` : ''}`);

    const abas = (r.abas && r.abas.length) ? r.abas : [{ id: 'aba-1', nome: 'Visão geral', widgets: [] }];
    const nav = abas.map((aba) => [aba.id, aba.nome]);
    const secoes = abas.map((aba) => CMWidgets.renderGrid(aba.widgets || [], { editable: false }));

    const fontesHtml = r.fontes ? `<p class="rel-fonte">${escapeHtml(r.fontes)}</p>` : '';
    finalizar(cabecalhoHtml, fontesHtml, secoes, nav);

    const main = document.getElementById('relMain');
    CMWidgets.ativarTooltips(main);
    CMWidgets.ativarOrdenacao(main);
    abas.forEach((aba) => {
      const painel = main.querySelector(`.rel-tab-painel[data-tab="${aba.id}"]`);
      const grid = painel ? painel.querySelector('.cw-grid') : null;
      if (grid) CMWidgets.ativarSegmentacao(grid, aba.widgets || []);
    });
  }

  // ---------- Embed (Power BI / Looker Studio) ----------

  function renderizarEmbed(r) {
    const titulo = TITULOS_TIPO[r.tipo] || 'Dashboard';
    const cabecalhoHtml = cabecalho(titulo, r.cliente, r.periodo, r.descricao || '');
    const secoes = [`
      <div class="rel-embed-wrap">
        <iframe class="rel-embed-frame" src="${escapeHtml(r.embedUrl)}" loading="lazy" allowfullscreen></iframe>
      </div>`];
    finalizar(cabecalhoHtml, '', secoes, [['dashboard', 'Dashboard']]);
  }

  // ---------- Fechamento financeiro ----------

  function renderizarFechamento(r) {
    const secoes = [];
    const nav = [];

    const cabecalhoHtml = cabecalho('Fechamento financeiro', r.cliente, r.periodo,
      `Preparado por ${r.preparadoPor || 'CM Soluções Financeiras'}${r.dataPreparo ? ` · ${r.dataPreparo}` : ''}`);

    // ---- Visão geral: KPIs + formação do caixa juntos ----
    const blocosVisaoGeral = [];
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
      blocosVisaoGeral.push(`<div class="rel-kpis">${kpiItens.map(([label, valor, neg]) =>
        `<div class="rel-kpi"><strong class="${neg ? 'neg' : ''}">${valor}</strong><span>${escapeHtml(label)}</span></div>`
      ).join('')}</div>`);
    }
    if (r.formacaoCaixa?.itens?.length) {
      blocosVisaoGeral.push(cartao('Formação do caixa', comTabela(
        graficoBarras(r.formacaoCaixa.itens),
        ['Item', 'Valor'],
        r.formacaoCaixa.itens.map((i) => [i.label, fmtBRL(i.valor)]),
      )));
    }
    if (blocosVisaoGeral.length) {
      nav.push(['visao-geral', 'Visão geral']);
      secoes.push(secao('visao-geral', 'Resumo', 'Visão geral', '', blocosVisaoGeral.join('')));
    }

    // ---- Receita & despesas: grade de gráficos lado a lado ----
    const blocosReceitaDespesas = [];
    if (r.receitaPorServico?.length) {
      blocosReceitaDespesas.push(cartao('Receita por serviço', comTabela(
        graficoBarras(r.receitaPorServico, { percentual: true }),
        ['Serviço', 'Valor'], r.receitaPorServico.map((i) => [i.label, fmtBRL(i.valor)]),
      )));
    }
    if (r.despesasPorGrupo?.length) {
      blocosReceitaDespesas.push(cartao('Despesas por grupo', comTabela(
        graficoBarras(r.despesasPorGrupo, { negativo: true, percentual: true }),
        ['Grupo', 'Valor'], r.despesasPorGrupo.map((i) => [i.label, fmtBRL(i.valor)]),
      )));
    }
    if (r.despesasPorSubcategoria?.length) {
      blocosReceitaDespesas.push(cartao('Despesas por subcategoria', comTabela(
        graficoBarras(r.despesasPorSubcategoria, { negativo: true, percentual: true }),
        ['Subcategoria', 'Valor'], r.despesasPorSubcategoria.map((i) => [i.label, fmtBRL(i.valor)]),
      )));
    }
    if (blocosReceitaDespesas.length) {
      nav.push(['receita-despesas', 'Receita & despesas']);
      secoes.push(secao('receita-despesas', 'De onde veio, pra onde foi', 'Receita & despesas', '',
        `<div class="rel-grid">${blocosReceitaDespesas.join('')}</div>`));
    }

    // ---- Equipe ----
    if (r.producaoPorProfissional?.length) {
      const totalSessoes = r.producaoPorProfissional.reduce((s, p) => s + Number(p.sessoes || 0), 0);
      const totalProd = r.producaoPorProfissional.reduce((s, p) => s + Number(p.produzido || 0), 0);
      const totalReceb = r.producaoPorProfissional.reduce((s, p) => s + Number(p.recebido || 0), 0);
      nav.push(['equipe', 'Equipe']);
      secoes.push(secao('equipe', 'Equipe', 'Produção e recebimento por profissional', 'Clique no cabeçalho pra ordenar.', `
        <table class="rel-tabela" data-sortable>
          <thead><tr>
            <th data-sort="texto">Profissional</th>
            <th data-sort="num">Sessões</th>
            <th data-sort="num">Produzido</th>
            <th data-sort="num">Recebido</th>
            <th data-sort="num">% recebido</th>
          </tr></thead>
          <tbody>
            ${r.producaoPorProfissional.map((p) => `
              <tr>
                <td>${escapeHtml(p.profissional)}</td>
                <td class="num" data-v="${p.sessoes}">${p.sessoes}</td>
                <td class="num" data-v="${p.produzido}">${fmtBRL(p.produzido)}</td>
                <td class="num" data-v="${p.recebido}">${fmtBRL(p.recebido)}</td>
                <td class="num" data-v="${p.produzido ? p.recebido / p.produzido : -1}">${p.produzido ? fmtPct(p.recebido / p.produzido) : '—'}</td>
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

    // ---- Contas: caixa por conta + contas a pagar juntos ----
    const blocosContas = [];
    if (r.caixaPorConta?.length) {
      blocosContas.push(`
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
        </div>`);
    }
    if (r.contasAPagarPorMes?.length || r.contasAPagarPorCategoria?.length) {
      const blocosAPagar = [];
      if (r.contasAPagarPorMes?.length) {
        blocosAPagar.push(cartao('Contas a pagar por mês', comTabela(
          graficoBarras(r.contasAPagarPorMes.map((m) => ({ label: m.mes, valor: m.valor })), { negativo: true }),
          ['Mês', 'Valor'], r.contasAPagarPorMes.map((m) => [m.mes, fmtBRL(m.valor)]),
        )));
      }
      if (r.contasAPagarPorCategoria?.length) {
        blocosAPagar.push(cartao('Contas a pagar por categoria', comTabela(
          graficoBarras(r.contasAPagarPorCategoria.map((c) => ({ label: c.label, valor: c.valor })), { negativo: true, percentual: true }),
          ['Categoria', 'Valor'], r.contasAPagarPorCategoria.map((c) => [c.label, fmtBRL(c.valor)]),
        )));
      }
      blocosContas.push(`<div class="rel-grid">${blocosAPagar.join('')}</div>`);
    }
    if (blocosContas.length) {
      nav.push(['contas', 'Contas']);
      secoes.push(secao('contas', 'Contas', 'Caixa por conta e contas a pagar', '', blocosContas.join('')));
    }

    // ---- Estoque ----
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

    // ---- Pendências ----
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

    const fontesHtml = r.fontes ? `<p class="rel-fonte">${escapeHtml(r.fontes)}</p>` : '';
    finalizar(cabecalhoHtml, fontesHtml, secoes, nav);
  }

  // ---------- Acompanhamento orçamentário ----------

  function renderizarOrcamento(r) {
    const secoes = [];
    const nav = [];

    const cabecalhoHtml = cabecalho('Acompanhamento orçamentário', r.cliente, r.periodo,
      `Preparado por ${r.preparadoPor || 'CM Soluções Financeiras'}${r.dataPreparo ? ` · ${r.dataPreparo}` : ''}`);

    if (r.categorias?.length) {
      const totalOrcado = r.categorias.reduce((s, c) => s + Number(c.orcado || 0), 0);
      const totalRealizado = r.categorias.reduce((s, c) => s + Number(c.realizado || 0), 0);
      const totalDesvio = totalRealizado - totalOrcado;
      nav.push(['categorias', 'Orçado vs. Realizado']);
      secoes.push(secao('categorias', 'Por categoria', 'Orçado vs. Realizado', 'O ponto cinza é o orçado, o colorido é o realizado — vermelho quando ficou fora do orçado.',
        cartao('Orçado vs. realizado', graficoDumbbell(r.categorias)) + cartao('Desvio por categoria', `
        <table class="rel-tabela" data-sortable>
          <thead><tr>
            <th data-sort="texto">Categoria</th>
            <th data-sort="texto">Tipo</th>
            <th data-sort="num">Orçado</th>
            <th data-sort="num">Realizado</th>
            <th data-sort="num">Desvio</th>
            <th data-sort="num">Desvio %</th>
          </tr></thead>
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
                  <td class="num" data-v="${orcado}">${fmtBRL(orcado)}</td>
                  <td class="num" data-v="${realizado}">${fmtBRL(realizado)}</td>
                  <td class="num ${desvio < 0 ? 'neg' : ''}" data-v="${desvio}">${fmtBRL(desvio)}</td>
                  <td class="num ${desvio < 0 ? 'neg' : ''}" data-v="${desvioPct ?? 0}">${desvioPct != null ? fmtPct(desvioPct) : '—'}</td>
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
        </table>`)));
    }

    const fontesHtml = r.fontes ? `<p class="rel-fonte">${escapeHtml(r.fontes)}</p>` : '';
    finalizar(cabecalhoHtml, fontesHtml, secoes, nav);
  }

  // ---------- Demonstrativo de comissões ----------

  function renderizarComissoes(r) {
    const secoes = [];
    const nav = [];

    const cabecalhoHtml = cabecalho(
      `Demonstrativo de comissões${r.ramo ? ` · ${r.ramo}` : ''}`,
      r.cliente, r.periodo,
      `Preparado por ${r.preparadoPor || 'CM Soluções Financeiras'}${r.dataPreparo ? ` · ${r.dataPreparo}` : ''}`,
    );

    if (r.comissoes?.length) {
      const totalServico = r.comissoes.reduce((s, c) => s + Number(c.valorServico || 0), 0);
      const totalComissao = r.comissoes.reduce((s, c) => s + Number(c.valorComissao || 0), 0);
      const totalDescontos = r.comissoes.reduce((s, c) => s + Number(c.descontos || 0), 0);
      const totalLiquido = r.comissoes.reduce((s, c) => s + Number(c.valorLiquido || 0), 0);
      const porPrestador = Object.values(r.comissoes.reduce((acc, c) => {
        const chave = c.prestador || '—';
        if (!acc[chave]) acc[chave] = { prestador: chave, valor: 0 };
        acc[chave].valor += Number(c.valorLiquido || 0);
        return acc;
      }, {}));
      const resumoPrestador = porPrestador.length > 1 ? cartao('Comissão líquida por prestador', comTabela(
        graficoBarras(porPrestador.map((p) => ({ label: p.prestador, valor: p.valor })), { percentual: true }),
        ['Prestador', 'Comissão líquida'],
        porPrestador.map((p) => [p.prestador, fmtBRL(p.valor)]),
      )) : '';

      nav.push(['comissoes', 'Comissões']);
      secoes.push(secao('comissoes', 'Detalhe', 'Comissões por serviço', 'Clique no cabeçalho pra ordenar.', `
        <table class="rel-tabela" data-sortable>
          <thead><tr>
            <th data-sort="texto">Prestador</th>
            <th data-sort="texto">Serviço</th>
            <th data-sort="num">Valor do serviço</th>
            <th data-sort="num">% comissão</th>
            <th data-sort="num">Comissão</th>
            <th data-sort="num">Descontos</th>
            <th data-sort="num">Líquido</th>
          </tr></thead>
          <tbody>
            ${r.comissoes.map((c) => `
              <tr>
                <td>${escapeHtml(c.prestador)}</td>
                <td>${escapeHtml(c.servico)}</td>
                <td class="num" data-v="${c.valorServico}">${fmtBRL(c.valorServico)}</td>
                <td class="num" data-v="${c.percComissao ?? 0}">${c.percComissao != null ? fmtPct(c.percComissao / 100) : '—'}</td>
                <td class="num" data-v="${c.valorComissao}">${fmtBRL(c.valorComissao)}</td>
                <td class="num ${c.descontos ? 'neg' : ''}" data-v="${c.descontos || 0}">${c.descontos ? fmtBRL(-Math.abs(c.descontos)) : fmtBRL(0)}</td>
                <td class="num" data-v="${c.valorLiquido}">${fmtBRL(c.valorLiquido)}</td>
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
        </table>${resumoPrestador}`));
    }

    const fontesHtml = r.fontes ? `<p class="rel-fonte">${escapeHtml(r.fontes)}</p>` : '';
    finalizar(cabecalhoHtml, fontesHtml, secoes, nav);
  }

  // Se já tem sessão ativa nesta aba, entra direto
  if (authHeader) {
    loginScreen.hidden = true;
    iniciar();
  }
})();
