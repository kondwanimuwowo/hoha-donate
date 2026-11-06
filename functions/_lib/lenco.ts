const LIVE_BASE_URL = 'https://api.lenco.co/access/v2';
const INVALID_MOBILE_NUMBER = '12';

export interface Env {
  LENCO_API_SECRET_KEY: string;
  LENCO_BASE_URL?: string;
}

export type Operator = 'airtel' | 'mtn';

export interface Collection {
  reference: string;
  amount: string;
  currency: string;
  status: string;
  reasonForFailure: string | null;
}

interface LencoResponse {
  message?: string;
  errorCode?: string;
  data?: Collection;
}

export class LencoError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly errorCode?: string,
  ) {
    super(message);
  }

  get isInvalidPhone(): boolean {
    return this.errorCode === INVALID_MOBILE_NUMBER;
  }
}

async function request(env: Env, path: string, init: RequestInit = {}): Promise<Collection> {
  if (!env.LENCO_API_SECRET_KEY) {
    throw new LencoError('LENCO_API_SECRET_KEY is not configured', 500);
  }

  const response = await fetch(`${env.LENCO_BASE_URL || LIVE_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.LENCO_API_SECRET_KEY}`,
    },
  });

  const body = await response.json<LencoResponse>().catch((): LencoResponse => ({}));
  if (!response.ok || !body.data) {
    throw new LencoError(
      body.message || `Lenco responded with ${response.status}`,
      response.status,
      body.errorCode,
    );
  }
  return body.data;
}

export const requestMobileMoneyCollection = (
  env: Env,
  input: { amount: number; phone: string; operator: Operator; reference: string },
) =>
  request(env, '/collections/mobile-money', {
    method: 'POST',
    body: JSON.stringify({ ...input, country: 'zm', bearer: 'merchant' }),
  });

export const getCollectionByReference = (env: Env, reference: string) =>
  request(env, `/collections/status/${encodeURIComponent(reference)}`);

// Only an explicit "failed" is final. Treating an unknown status as failed could
// prompt someone to pay twice while the first payment is still going through.
export function toDonationStatus(status: string): 'successful' | 'failed' | 'pending' {
  if (status === 'successful' || status === 'failed') return status;
  return 'pending';
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
