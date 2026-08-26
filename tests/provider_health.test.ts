import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testFortyGuardConnection } from '@/lib/fortyguard/health';

describe('FortyGuard Provider Health & Connection Testing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. FIXTURE mode returns connected without requiring an API key', async () => {
    const res = await testFortyGuardConnection({ mode: 'FIXTURE' });
    expect(res.configured).toBe(true);
    expect(res.connected).toBe(true);
    expect(res.mode).toBe('FIXTURE');
    expect(res.errorCode).toBeUndefined();
  });

  it('2. LIVE mode without API key returns NOT_CONFIGURED', async () => {
    const res = await testFortyGuardConnection({ mode: 'LIVE', apiKey: '' });
    expect(res.configured).toBe(false);
    expect(res.connected).toBe(false);
    expect(res.mode).toBe('LIVE');
    expect(res.errorCode).toBe('FORTYGUARD_NOT_CONFIGURED');
    expect(res.errorMessage).toMatch(/not configured/i);
  });

  it('3. LIVE mode with valid API key returns CONNECTED on HTTP 200', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { credits_used: 50000, credits_remaining: 1950000 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const res = await testFortyGuardConnection({ mode: 'LIVE', apiKey: 'valid-test-key' });
    expect(res.configured).toBe(true);
    expect(res.connected).toBe(true);
    expect(res.mode).toBe('LIVE');
    expect(typeof res.latencyMs).toBe('number');
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('4. LIVE mode with invalid API key (HTTP 401) returns AUTH_ERROR', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    );

    const res = await testFortyGuardConnection({ mode: 'LIVE', apiKey: 'bad-key' });
    expect(res.configured).toBe(true);
    expect(res.connected).toBe(false);
    expect(res.errorCode).toBe('FORTYGUARD_AUTH_ERROR');
    expect(res.errorMessage).toMatch(/Authentication failed/i);
  });

  it('5. LIVE mode network/timeout failure returns TIMEOUT or PROVIDER_ERROR', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network connection refused'));

    const res = await testFortyGuardConnection({ mode: 'LIVE', apiKey: 'any-key' });
    expect(res.configured).toBe(true);
    expect(res.connected).toBe(false);
    expect(res.errorCode).toBe('FORTYGUARD_PROVIDER_ERROR');
  });

  it('6. Health response NEVER exposes the raw API key', async () => {
    const secretKey = 'super-secret-fortyguard-key-12345';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), { status: 200 })
    );

    const res = await testFortyGuardConnection({ mode: 'LIVE', apiKey: secretKey });
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain(secretKey);
  });
});
