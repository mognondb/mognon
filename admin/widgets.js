/**
 * Motor de widgets do construtor de dashboards — compartilhado entre o construtor
 * (admin/construtor.js, onde o admin monta o dashboard) e a apresentação
 * (admin/relatorio.js, onde o cliente vê o resultado pronto). Mantém as duas telas
 * visualmente idênticas (o que se monta é o que se vê) sem duplicar a lógica de
 * desenho de cada tipo de gráfico.
 *
 * Cada aba de um relatório "personalizado" é uma lista de widgets com posição numa
 * grade de 12 colunas (x, y, w, h em "unidades de grade"); cada widget guarda seu
 * tipo e os dados no formato daquele tipo (ver DADOS_EXEMPLO mais abaixo).
 */
window.CMWidgets = (function () {
  'use strict';

  const COLS = 12;
  const ROW_H = 32;
  const GAP = 10;

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

  const TITULOS = {
    barras: 'Gráfico de barras',
    linha: 'Gráfico de linha',
    pizza: 'Gráfico de pizza',
    tabela: 'Tabela',
    kpi: 'Indicador (KPI)',
    texto: 'Bloco de texto',
    segmentacao: 'Segmentação por período',
  };

  const DEFAULT_SIZE = {
    barras: { w: 6, h: 7 },
    linha: { w: 6, h: 7 },
    pizza: { w: 4, h: 7 },
    tabela: { w: 12, h: 6 },
    kpi: { w: 3, h: 3 },
    texto: { w: 6, h: 4 },
    segmentacao: { w: 12, h: 2 },
  };

  function dadosVazios(tipo) {
    switch (tipo) {
      case 'barras': return { itens: [], negativo: false, percentual: false };
      case 'linha': return { itens: [] };
      case 'pizza': return { itens: [] };
      case 'tabela': return { colunas: ['Coluna 1', 'Coluna 2'], linhas: [] };
      case 'kpi': return { valor: 0, rotulo: '', formato: 'moeda', comparacao: '' };
      case 'texto': return { texto: '' };
      case 'segmentacao': return { segmentos: [] };
      default: return {};
    }
  }

  // Resolve os dados "ativos" de um widget — se ele tiver dados por segmento
  // (porSegmento), usa o segmento selecionado no momento (ou o padrão).
  function dadosAtivos(widget) {
    const dados = widget.dados || {};
    if (dados.porSegmento && Object.keys(dados.porSegmento).length) {
      const ativo = widget._segmentoAtivo || dados.segmentoPadrao || Object.keys(dados.porSegmento)[0];
      return dados.porSegmento[ativo] || dadosVazios(widget.tipo);
    }
    return dados;
  }

  // ---------- Tooltip compartilhado ----------

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
  function ativarTooltips(raiz) {
    raiz.querySelectorAll('[data-tt-label]').forEach((el) => {
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

  // ---------- Tabelas ordenáveis ----------

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

  // ---------- Helpers de marcação (mesmo visual das barras já usadas no relatório) ----------

  function comTabela(graficoHtml, colunas, linhas) {
    const tabela = `
      <table class="rel-tabela">
        <thead><tr>${colunas.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
        <tbody>${linhas.map((linha) => `<tr>${linha.map((v, i) => `<td class="${i === 0 ? '' : 'num'}">${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
    return `${graficoHtml}<details class="rel-ver-tabela"><summary>Ver como tabela</summary>${tabela}</details>`;
  }

  // ---------- Tipos de widget ----------

  function renderBarras(d) {
    const itens = d.itens || [];
    if (!itens.length) return '<p class="cw-vazio">Sem dados ainda.</p>';
    const max = Math.max(...itens.map((i) => Math.abs(Number(i.valor) || 0)), 1);
    const total = itens.reduce((s, i) => s + Math.abs(Number(i.valor) || 0), 0);
    const grafico = `<div class="rel-barras">${itens.map((i) => {
      const valor = Number(i.valor) || 0;
      const pct = Math.round((Math.abs(valor) / max) * 100);
      const classe = d.negativo || valor < 0 ? 'saida' : '';
      const participacao = d.percentual && total ? Math.abs(valor) / total : null;
      return `
        <div class="rel-barra-linha" tabindex="0" data-tt-label="${escapeHtml(i.label)}" data-tt-valor="${escapeHtml(fmtBRL(valor))}" ${participacao != null ? `data-tt-extra="${escapeHtml(`${fmtPct(participacao)} do total`)}"` : ''}>
          <span class="rel-barra-label">${escapeHtml(i.label)}</span>
          <span class="rel-barra-trilha"><span class="rel-barra-preenchimento ${classe}" style="width:${pct}%"></span></span>
          <span class="rel-barra-valor ${valor < 0 ? 'neg' : ''}">${fmtBRL(valor)}</span>
        </div>`;
    }).join('')}</div>`;
    return comTabela(grafico, ['Item', 'Valor'], itens.map((i) => [i.label, fmtBRL(i.valor)]));
  }

  function renderLinha(d) {
    const itens = d.itens || [];
    if (!itens.length) return '<p class="cw-vazio">Sem dados ainda.</p>';
    const w = 600, h = 220, padL = 44, padR = 16, padT = 16, padB = 32;
    const vals = itens.map((i) => Number(i.valor) || 0);
    const min = Math.min(0, ...vals);
    const max = Math.max(...vals, min + 1);
    const x = (i) => padL + (i * (w - padL - padR)) / Math.max(itens.length - 1, 1);
    const y = (v) => padT + (h - padT - padB) * (1 - (v - min) / (max - min || 1));
    const pontos = itens.map((it, i) => `${x(i)},${y(Number(it.valor) || 0)}`).join(' ');
    const circulos = itens.map((it, i) => `<circle class="cw-linha-ponto" tabindex="0" cx="${x(i)}" cy="${y(Number(it.valor) || 0)}" r="4" data-tt-label="${escapeHtml(it.label)}" data-tt-valor="${escapeHtml(fmtBRL(it.valor))}"></circle>`).join('');
    const labels = itens.map((it, i) => `<text class="cw-linha-rotulo" x="${x(i)}" y="${h - 10}" text-anchor="middle">${escapeHtml(String(it.label).slice(0, 10))}</text>`).join('');
    const zeroY = y(0);
    const linhaZero = min < 0 ? `<line x1="${padL}" y1="${zeroY}" x2="${w - padR}" y2="${zeroY}" class="cw-linha-eixo-zero"/>` : '';
    const grafico = `<svg class="cw-linha-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img">
        ${linhaZero}
        <polyline points="${pontos}" class="cw-linha-caminho"></polyline>
        ${circulos}
        ${labels}
      </svg>`;
    return comTabela(grafico, ['Período', 'Valor'], itens.map((it) => [it.label, fmtBRL(it.valor)]));
  }

  const PALETA_CATEGORICA = ['#6b7a4a', '#c9a227', '#b3734a', '#4a7a8c', '#8c5a8c', '#4a8c6b', '#8a4a4a', '#7a6b4a'];

  function renderPizza(d) {
    const itens = (d.itens || []).filter((i) => Number(i.valor) > 0);
    if (!itens.length) return '<p class="cw-vazio">Sem dados ainda.</p>';
    const total = itens.reduce((s, i) => s + (Number(i.valor) || 0), 0) || 1;
    let acc = 0;
    const partes = itens.map((it, i) => {
      const pct = (Number(it.valor) || 0) / total;
      const de = acc * 360;
      acc += pct;
      const ate = acc * 360;
      return `${PALETA_CATEGORICA[i % PALETA_CATEGORICA.length]} ${de}deg ${ate}deg`;
    });
    const donut = `<div class="cw-pizza-donut" style="background:conic-gradient(${partes.join(',')})"></div>`;
    const legenda = `<ul class="cw-pizza-legenda">${itens.map((it, i) => {
      const pct = (Number(it.valor) || 0) / total;
      return `
      <li tabindex="0" data-tt-label="${escapeHtml(it.label)}" data-tt-valor="${escapeHtml(fmtBRL(it.valor))}" data-tt-extra="${escapeHtml(`${fmtPct(pct)} do total`)}">
        <i style="background:${PALETA_CATEGORICA[i % PALETA_CATEGORICA.length]}"></i>${escapeHtml(it.label)} <span>${fmtPct(pct)}</span>
      </li>`;
    }).join('')}</ul>`;
    const grafico = `<div class="cw-pizza-wrap">${donut}${legenda}</div>`;
    return comTabela(grafico, ['Item', 'Valor', '%'], itens.map((it) => [it.label, fmtBRL(it.valor), fmtPct((Number(it.valor) || 0) / total)]));
  }

  function renderTabela(d) {
    const colunas = d.colunas || [];
    const linhas = d.linhas || [];
    if (!colunas.length) return '<p class="cw-vazio">Sem colunas ainda.</p>';
    const numericas = colunas.map((_, ci) => linhas.length > 0 && linhas.every((l) => l[ci] === '' || l[ci] == null || !isNaN(Number(l[ci]))));
    return `<table class="rel-tabela" data-sortable>
      <thead><tr>${colunas.map((c, i) => `<th data-sort="${numericas[i] ? 'num' : 'texto'}">${escapeHtml(c)}</th>`).join('')}</tr></thead>
      <tbody>${linhas.map((l) => `<tr>${colunas.map((_, i) => `<td class="${numericas[i] ? 'num' : ''}" data-v="${escapeHtml(l[i] ?? '')}">${escapeHtml(l[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
  }

  function renderKpi(d) {
    let valorFmt;
    if (d.formato === 'percentual') valorFmt = `${(Number(d.valor) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
    else if (d.formato === 'numero') valorFmt = (Number(d.valor) || 0).toLocaleString('pt-BR');
    else valorFmt = fmtBRL(d.valor);
    return `<div class="cw-kpi-grande">
      <strong>${escapeHtml(valorFmt)}</strong>
      ${d.rotulo ? `<span>${escapeHtml(d.rotulo)}</span>` : ''}
      ${d.comparacao ? `<small>${escapeHtml(d.comparacao)}</small>` : ''}
    </div>`;
  }

  function renderTexto(d) {
    const texto = (d.texto || '').trim();
    if (!texto) return '<p class="cw-vazio">Sem texto ainda.</p>';
    return texto.split('\n').filter((p) => p.trim()).map((p) => `<p class="cw-texto-paragrafo">${escapeHtml(p)}</p>`).join('');
  }

  function renderSegmentacao(widget, d) {
    const segmentos = d.segmentos || [];
    if (!segmentos.length) return '<p class="cw-vazio">Edite este bloco para definir os períodos (ex: Jan/2026, Fev/2026).</p>';
    const ativo = widget._segmentoAtivo || segmentos[0];
    return `<div class="cw-seg-botoes">${segmentos.map((s) => `<button type="button" class="cw-seg-btn ${s === ativo ? 'ativo' : ''}" data-seg="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')}</div>`;
  }

  function renderConteudo(widget) {
    const d = dadosAtivos(widget);
    switch (widget.tipo) {
      case 'barras': return renderBarras(d);
      case 'linha': return renderLinha(d);
      case 'pizza': return renderPizza(d);
      case 'tabela': return renderTabela(d);
      case 'kpi': return renderKpi(d);
      case 'texto': return renderTexto(d);
      case 'segmentacao': return renderSegmentacao(widget, d);
      default: return '';
    }
  }

  // ---------- Grade de widgets ----------

  function renderWidgetCard(widget, opts) {
    opts = opts || {};
    const titulo = widget.titulo || TITULOS[widget.tipo] || '';
    return `<div class="cw-widget" data-widget-id="${escapeHtml(widget.id)}" data-tipo="${escapeHtml(widget.tipo)}" style="grid-column:${widget.x + 1} / span ${widget.w}; grid-row:${widget.y + 1} / span ${widget.h};">
      <div class="cw-widget-head">
        ${opts.editable ? '<span class="cw-drag" title="Arrastar para mover">⠿⠿</span>' : ''}
        <h4>${escapeHtml(titulo)}</h4>
        ${opts.editable ? `<div class="cw-widget-actions">
          <button type="button" class="cw-icon-btn cw-btn-editar" title="Editar dados">✎</button>
          <button type="button" class="cw-icon-btn cw-btn-remover" title="Remover bloco">✕</button>
        </div>` : ''}
      </div>
      <div class="cw-widget-body">${renderConteudo(widget)}</div>
      ${opts.editable ? '<span class="cw-resize" title="Arrastar para redimensionar"></span>' : ''}
    </div>`;
  }

  function renderGrid(widgets, opts) {
    if (!widgets || !widgets.length) {
      return `<div class="cw-grid cw-grid-vazia">${opts && opts.editable ? '<p class="cw-vazio-grid">Esta aba ainda não tem nenhum bloco — use os botões acima para adicionar.</p>' : '<p class="cw-vazio-grid">Esta aba ainda não tem conteúdo.</p>'}</div>`;
    }
    return `<div class="cw-grid">${widgets.map((w) => renderWidgetCard(w, opts)).join('')}</div>`;
  }

  // Liga os botões de segmentação de uma grade: ao clicar num período, troca os
  // dados de todos os widgets daquela MESMA grade que tiverem dados por segmento.
  function ativarSegmentacao(gridEl, widgets) {
    const porId = {};
    (widgets || []).forEach((w) => { porId[w.id] = w; });
    gridEl.querySelectorAll('.cw-seg-btn').forEach((btn) => {
      if (btn.dataset.segBound) return;
      btn.dataset.segBound = '1';
      btn.addEventListener('click', () => {
        const seg = btn.dataset.seg;
        const grupoWidget = btn.closest('.cw-widget');
        if (grupoWidget) {
          const segWidget = porId[grupoWidget.dataset.widgetId];
          if (segWidget) segWidget._segmentoAtivo = seg;
        }
        btn.parentElement.querySelectorAll('.cw-seg-btn').forEach((b) => b.classList.toggle('ativo', b === btn));
        gridEl.querySelectorAll('.cw-widget').forEach((card) => {
          const w = porId[card.dataset.widgetId];
          if (w && w.dados && w.dados.porSegmento && w.dados.porSegmento[seg]) {
            w._segmentoAtivo = seg;
            const corpo = card.querySelector('.cw-widget-body');
            corpo.innerHTML = renderConteudo(w);
            ativarTooltips(corpo);
            ativarOrdenacao(corpo);
          }
        });
      });
    });
  }

  function novoWidget(tipo) {
    const tam = DEFAULT_SIZE[tipo] || { w: 6, h: 6 };
    return {
      id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tipo,
      titulo: TITULOS[tipo] || '',
      x: 0,
      y: 0,
      w: tam.w,
      h: tam.h,
      dados: dadosVazios(tipo),
    };
  }

  return {
    COLS, ROW_H, GAP,
    TITULOS, DEFAULT_SIZE,
    escapeHtml, fmtBRL, fmtPct,
    dadosVazios, dadosAtivos,
    renderConteudo, renderWidgetCard, renderGrid,
    ativarTooltips, ativarOrdenacao, ativarSegmentacao,
    novoWidget,
  };
})();
