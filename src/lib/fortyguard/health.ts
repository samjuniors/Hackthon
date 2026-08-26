import type { FortyGuardHealthResponse } from '@/types/provider';
import type { DataSourceMode } from '@/types/provenance';

export interface TestConnectionOptions {
  mode?: DataSourceMode;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * Tests connection to FortyGuard API server-side without exposing secrets.
 */
export async function testFortyGuardConnection(
  options?: TestConnectionOptions
): Promise<FortyGuardHealthResponse> {
  const mode: DataSourceMode =
    options?.mode ?? (process.env.FORTYGUARD_DATA_SOURCE === 'LIVE' ? 'LIVE' : 'FIXTURE');
  const apiKey = options?.apiKey ?? process.env.FORTYGUARD_API_KEY ?? '';
  const baseUrl = (
    options?.baseUrl ||
    process.env.FORTYGUARD_API_BASE_URL ||
    'https://api.fortyguard.com'
  ).replace(/\/+$/, '');
  const timeoutMs = options?.timeoutMs ?? 5000;
  const checkedAt = new Date().toISOString();

  if (mode === 'FIXTURE') {
    return {
      configured: true,
      connected: true,
      mode: 'FIXTURE',
      latencyMs: 1,
      checkedAt,
    };
  }

  // LIVE mode requires a configured API key
  if (!apiKey) {
    return {
      configured: false,
      connected: false,
      mode: 'LIVE',
      errorCode: 'FORTYGUARD_NOT_CONFIGURED',
      errorMessage: 'FORTYGUARD_API_KEY environment variable is not configured on the server.',
      checkedAt,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();

  try {
    const res = await fetch(`${baseUrl}/v1/system/fetch-api-key-usage`, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ api_key: apiKey }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (res.status === 401 || res.status === 403) {
      return {
        configured: true,
        connected: false,
        mode: 'LIVE',
        latencyMs,
        errorCode: 'FORTYGUARD_AUTH_ERROR',
        errorMessage: 'Authentication failed. Please verify the server-side FORTYGUARD_API_KEY.',
        checkedAt,
      };
    }

    if (!res.ok) {
      return {
        configured: true,
        connected: false,
        mode: 'LIVE',
        latencyMs,
        errorCode: 'FORTYGUARD_PROVIDER_ERROR',
        errorMessage: `FortyGuard API returned HTTP ${res.status}.`,
        checkedAt,
      };
    }

    return {
      configured: true,
      connected: true,
      mode: 'LIVE',
      latencyMs,
      checkedAt,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    const isTimeout = err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort'));

    if (isTimeout) {
      return {
        configured: true,
        connected: false,
        mode: 'LIVE',
        latencyMs,
        errorCode: 'FORTYGUARD_TIMEOUT',
        errorMessage: `FortyGuard connection timed out after ${timeoutMs}ms.`,
        checkedAt,
      };
    }

    return {
      configured: true,
      connected: false,
      mode: 'LIVE',
      latencyMs,
      errorCode: 'FORTYGUARD_PROVIDER_ERROR',
      errorMessage: `Failed to connect to FortyGuard API: ${err instanceof Error ? err.message : String(err)}`,
      checkedAt,
    };
  }
}
