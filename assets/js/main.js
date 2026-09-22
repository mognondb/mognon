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

// "Quero esse produto" (cards) e CTAs do portfólio -> scroll ao form e preselect do interesse
function preencherInteresse(interesse) {
  const select = document.getElementById('interesse');
  if (interesse && select) {
    const option = Array.from(select.options).find((o) => o.value === interesse);
    if (option) select.value = interesse;
  }
  document.getElementById('contato').scrollIntoView({ behavior: 'smooth' });
  document.getElementById('nome')?.focus({ preventScroll: true });
}

document.querySelectorAll('.card-btn:not(.btn-comprar)').forEach((btn) => {
  if (btn.tagName !== 'BUTTON') return;
  btn.addEventListener('click', () => {
    const card = btn.closest('.card');
    preencherInteresse(card?.dataset.interesse);
  });
});

document.querySelectorAll('[data-interesse]:not(.card)').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    preencherInteresse(el.dataset.interesse);
  });
});

// Infoprodutos pagos: placeholder de checkout (substituir pelo link real da plataforma de pagamento)
document.querySelectorAll('.btn-comprar').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const produto = btn.dataset.produto || 'produto';
    alert(
      `Checkout para "${produto}" ainda não configurado.\n\n` +
      'Configure o link de pagamento (Hotmart, Eduzz, Kiwify, Stripe etc.) ' +
      'no atributo href deste botão em index.html.'
    );
  });
});

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
