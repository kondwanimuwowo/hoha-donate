import { AMOUNTS, NETWORKS, POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from './config.js';

const el = (id) => document.getElementById(id);

const form = el('donate-form');
const amountsEl = el('amounts');
const networksEl = el('networks');
const otherField = el('other-field');
const otherInput = el('other-amount');
const phoneInput = el('phone');
const submitButton = el('donate-button');
const formError = el('form-error');
const statusPanel = el('status-panel');
const statusTitle = el('status-title');
const statusBody = el('status-body');
const statusReference = el('status-reference');
const statusAction = el('status-action');
const statusIndicator = el('status-indicator');
const intro = el('donate-intro');

const formatKwacha = (amount) => {
  const value = Number(amount);
  const decimals = Number.isInteger(value) ? 0 : 2;
  return `K${value.toLocaleString('en-ZM', { minimumFractionDigits: decimals, maximumFractionDigits: 2 })}`;
};

function optionMarkup(name, value, label, checked) {
  return `<label class="option">
    <input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''} />
    <span>${label}</span>
  </label>`;
}

amountsEl.innerHTML =
  AMOUNTS.map((amount, i) => optionMarkup('amount', amount, formatKwacha(amount), i === 0)).join('') +
  optionMarkup('amount', 'other', 'Other', false);

networksEl.innerHTML = NETWORKS.map(({ value, label }) =>
  optionMarkup('operator', value, label, false),
).join('');

function selectedAmount() {
  const choice = form.elements.amount.value;
  return choice === 'other' ? Number(otherInput.value) : Number(choice);
}

function syncAmount() {
  const isOther = form.elements.amount.value === 'other';
  otherField.hidden = !isOther;
  otherInput.required = isOther;
  const amount = selectedAmount();
  submitButton.textContent = amount > 0 ? `Donate ${formatKwacha(amount)}` : 'Donate';
}

function showFormError(message) {
  formError.textContent = message;
  formError.hidden = !message;
}

function showStatus({ title, body, reference, action, waiting = false }) {
  form.hidden = true;
  intro.hidden = true;
  statusPanel.hidden = false;
  statusTitle.textContent = title;
  statusBody.textContent = body;
  statusIndicator.hidden = !waiting;
  statusReference.hidden = !reference;
  statusReference.textContent = reference ? `Reference: ${reference}` : '';
  statusAction.hidden = !action;
  statusAction.textContent = action || '';
  statusTitle.focus();
}

function resetToForm() {
  statusPanel.hidden = true;
  form.hidden = false;
  intro.hidden = false;
  showFormError('');
  submitButton.disabled = false;
  syncAmount();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function checkStatus(reference) {
  try {
    const response = await fetch(`/api/payments/verify?reference=${encodeURIComponent(reference)}`);
    return response.ok ? await response.json() : { status: 'pending' };
  } catch {
    return { status: 'pending' };
  }
}

// Network errors count as pending: a dropped connection says nothing about the payment.
async function waitForResult(reference) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const result = await checkStatus(reference);
    if (result.status !== 'pending' || Date.now() >= deadline) return result;
    await sleep(POLL_INTERVAL_MS);
  }
}

function showResult(result, amount, reference) {
  if (result.status === 'successful') {
    showStatus({
      title: 'Thank you',
      body: `Your donation of ${formatKwacha(amount)} has been received. Together, we can do more.`,
      reference,
      action: 'Make another donation',
    });
  } else if (result.status === 'failed') {
    showStatus({
      title: 'Your donation did not go through',
      body: `${result.reason ? `${result.reason}. ` : ''}Please try again.`,
      action: 'Try again',
    });
  } else {
    showStatus({
      title: 'Still waiting for confirmation',
      body: 'If you approved the prompt, your donation may still go through, so please do not pay again yet. Check your mobile money messages, or contact us with the reference below.',
      reference,
      action: 'Back to donation form',
    });
  }
}

form.addEventListener('change', syncAmount);
otherInput.addEventListener('input', syncAmount);
statusAction.addEventListener('click', resetToForm);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showFormError('');

  const amount = selectedAmount();
  const operator = form.elements.operator.value;
  if (!(amount > 0)) return showFormError('Enter the amount you would like to give.');
  if (!operator) return showFormError('Choose your mobile money network.');

  submitButton.disabled = true;
  submitButton.textContent = 'Sending prompt…';

  let started;
  try {
    const response = await fetch('/api/payments/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, operator, phone: phoneInput.value }),
    });
    started = await response.json();
    if (!response.ok) throw new Error(started.error);
  } catch (error) {
    submitButton.disabled = false;
    syncAmount();
    return showFormError(error.message || 'We could not start your donation. Please try again.');
  }

  if (started.status !== 'pending') return showResult(started, amount, started.reference);

  showStatus({
    title: 'Check your phone',
    body: `Approve the ${formatKwacha(amount)} prompt on ${phoneInput.value} by entering your mobile money PIN. Keep this page open.`,
    waiting: true,
  });
  showResult(await waitForResult(started.reference), amount, started.reference);
});

syncAmount();
