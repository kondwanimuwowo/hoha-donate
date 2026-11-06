import {
  type Env,
  type Operator,
  LencoError,
  json,
  requestMobileMoneyCollection,
  toDonationStatus,
} from '../../_lib/lenco';

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 100_000;
const OPERATORS: readonly Operator[] = ['airtel', 'mtn'];

function toLocalPhone(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  const local = digits.startsWith('260') ? `0${digits.slice(3)}` : digits;
  return /^0[79]\d{8}$/.test(local) ? local : null;
}

function isValidAmount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_AMOUNT &&
    value <= MAX_AMOUNT &&
    Math.round(value * 100) / 100 === value
  );
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await request
    .json<{ amount?: unknown; phone?: unknown; operator?: unknown }>()
    .catch(() => null);
  if (!body) return json({ error: 'Invalid request.' }, 400);

  if (!isValidAmount(body.amount)) {
    return json({ error: `Enter an amount between K${MIN_AMOUNT} and K${MAX_AMOUNT.toLocaleString('en-ZM')}.` }, 400);
  }
  if (!OPERATORS.includes(body.operator as Operator)) {
    return json({ error: 'Choose Airtel Money or MTN Money.' }, 400);
  }
  const phone = toLocalPhone(body.phone);
  if (!phone) {
    return json({ error: 'Enter a valid Zambian mobile number, like 0971234567.' }, 400);
  }

  const reference = `HOHA_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  try {
    const collection = await requestMobileMoneyCollection(env, {
      amount: body.amount,
      phone,
      operator: body.operator as Operator,
      reference,
    });
    return json({
      reference,
      amount: body.amount,
      status: toDonationStatus(collection.status),
      reason: collection.reasonForFailure,
    });
  } catch (error) {
    console.error('Lenco collection request failed:', error);
    if (error instanceof LencoError && error.isInvalidPhone) {
      return json({ error: 'That mobile number was not accepted. Check it and try again.' }, 400);
    }
    return json({ error: 'We could not start your donation. Please try again.' }, 502);
  }
};
