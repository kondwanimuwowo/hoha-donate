import { type Env, getCollectionByReference, json, toDonationStatus } from '../../_lib/lenco';

const REFERENCE_PATTERN = /^HOHA_\d+_[a-f0-9-]+$/;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const reference = new URL(request.url).searchParams.get('reference');
  if (!reference || !REFERENCE_PATTERN.test(reference)) {
    return json({ error: 'Invalid reference.' }, 400);
  }

  try {
    const collection = await getCollectionByReference(env, reference);
    return json({
      status: toDonationStatus(collection.status),
      amount: collection.amount,
      currency: collection.currency,
      reason: collection.reasonForFailure,
    });
  } catch (error) {
    console.error('Lenco status check failed:', error);
    return json({ error: 'Could not check the payment status.' }, 502);
  }
};
