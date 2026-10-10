document.getElementById('ano').textContent = new Date().getFullYear();

// Mobile nav toggle
const header = document.querySelector('.site-header');
const navToggle = document.getElementById('navToggle');
navToggle.addEventListener('click', () => {
  const isOpen = header.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});
document.getElementById('nav').addEventListener('click', (e) => {
  if (e.target.tagName === 'A') header.classList.remove('open');
});

// "Quero esse produto/serviço" (cards) e CTAs avulsos -> scroll ao form e preselect do interesse
function preencherInteresse(interesse) {
  const select = document.getElementById('interesse');
  if (interesse && select) {
    const option = Array.from(select.options).find((o) => o.value === interesse);
    if (option) select.value = interesse;
  }
  document.getElementById('contato').scrollIntoView({ behavior: 'smooth' });
  document.getElementById('nome')?.focus({ preventScroll: true });
}

function ativarInteresseCards() {
  document.querySelectorAll('.card-btn:not(.btn-comprar)').forEach((btn) => {
    if (btn.tagName !== 'BUTTON') return;
    if (btn.dataset.interesseBound) return;
    btn.dataset.interesseBound = 'true';
    btn.addEventListener('click', () => {
      const card = btn.closest('.card');
      preencherInteresse(card?.dataset.interesse);
    });
  });
}

document.querySelectorAll('[data-interesse]:not(.card)').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    preencherInteresse(el.dataset.interesse);
  });
});

ativarInteresseCards();

// Escapa texto vindo dos arquivos de dados antes de inserir via innerHTML
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// Infoprodutos: carregados de assets/data/infoprodutos.json (cadastrados pelo painel /admin/)
async function carregarInfoprodutos() {
  const grid = document.getElementById('infoprodutosGrid');
  if (!grid) return;
  try {
    const res = await fetch('assets/data/infoprodutos.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Falha ao buscar infoprodutos.json');
    const itens = (await res.json()).filter((item) => item.ativo !== false);

    if (itens.length === 0) {
      grid.innerHTML = '<p class="loading-placeholder">Nenhum produto disponível no momento.</p>';
      return;
    }

    grid.innerHTML = itens.map((item) => {
      const gratis = item.tipo === 'gratis';
      const badgeClass = gratis ? 'badge-free' : 'badge-paid';
      const badgeTexto = gratis ? 'Grátis' : escapeHtml(item.precoLabel || '');
      const botao = gratis
        ? `<a href="${escapeHtml(item.link)}" class="btn btn-outline card-btn" download>Baixar grátis</a>`
        : `<a href="${escapeHtml(item.link)}" class="btn btn-primary card-btn" target="_blank" rel="noopener">Comprar agora</a>`;

      return `
        <div class="card card-info">
          <span class="badge ${badgeClass}">${badgeTexto}</span>
          <div class="card-icon">${escapeHtml(item.icone || '📦')}</div>
          <h3>${escapeHtml(item.nome)}</h3>
          <p>${escapeHtml(item.descricao)}</p>
          ${botao}
        </div>`;
    }).join('');
  } catch (err) {
    grid.innerHTML = '<p class="loading-placeholder">Não foi possível carregar os produtos agora.</p>';
  }
}

// Portfólio de dashboards: carregado de assets/data/dashboards.json (cadastrados pelo painel /admin/)
async function carregarDashboards() {
  const grid = document.getElementById('portfolioGrid');
  if (!grid) return;
  try {
    const res = await fetch('assets/data/dashboards.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Falha ao buscar dashboards.json');
    const itens = (await res.json()).filter((item) => item.ativo !== false);

    if (itens.length === 0) {
      grid.innerHTML = '<p class="loading-placeholder">Nenhum dashboard no portfólio ainda.</p>';
      return;
    }

    const coresLegenda = ['var(--color-olive)', 'var(--color-gold)', 'var(--color-beige)'];

    grid.innerHTML = itens.map((item) => {
      let previewHtml;
      if (item.preview === 'donut') {
        const p1 = item.donut?.p1 ?? 50;
        const p2 = item.donut?.p2 ?? 75;
        const legendas = (item.legendas || []).map((legenda, i) =>
          `<span><i style="background:${coresLegenda[i] || coresLegenda[2]}"></i>${escapeHtml(legenda)}</span>`
        ).join('');
        previewHtml = `
          <div class="mini-donut" style="--p1:${p1}%; --p2:${p2}%;"></div>
          <div class="mini-legend">${legendas}</div>`;
      } else {
        const kpis = (item.kpis || []).map((kpi) =>
          `<span class="mini-kpi"><strong>${escapeHtml(kpi.valor)}</strong>${escapeHtml(kpi.label)}</span>`
        ).join('');
        const barras = (item.barras || []).map((altura) => `<span style="--h:${altura}%"></span>`).join('');
        previewHtml = `
          <div class="mini-kpis">${kpis}</div>
          <div class="mini-chart">${barras}</div>`;
      }

      return `
        <article class="portfolio-card">
          <div class="portfolio-preview">${previewHtml}</div>
          <div class="portfolio-info">
            <h3>${escapeHtml(item.titulo)}</h3>
            <p>${escapeHtml(item.descricao)}</p>
          </div>
        </article>`;
    }).join('');
  } catch (err) {
    grid.innerHTML = '<p class="loading-placeholder">Não foi possível carregar o portfólio agora.</p>';
  }
}

carregarInfoprodutos();
carregarDashboards();

// Formulário de contato/relatório via Formspree (ou similar)
const form = document.getElementById('formRelatorio');
const feedback = document.getElementById('formFeedback');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  feedback.textContent = '';
  feedback.className = 'form-feedback';

  const actionUrl = form.getAttribute('action');
  if (!actionUrl || actionUrl.includes('SEU_FORM_ID')) {
    feedback.textContent = 'Formulário ainda não configurado: defina o endpoint de envio (ex.: Formspree) no atributo action do form.';
    feedback.classList.add('error');
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Enviando...';

  try {
    const response = await fetch(actionUrl, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' },
    });

    if (response.ok) {
      feedback.textContent = 'Solicitação enviada com sucesso! Em breve entraremos em contato.';
      feedback.classList.add('success');
      form.reset();
    } else {
      throw new Error('Falha no envio');
    }
  } catch (err) {
    feedback.textContent = 'Não foi possível enviar agora. Tente novamente em instantes.';
    feedback.classList.add('error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Enviar solicitação';
  }
});
