import type { AIHealthResponse, AIProviderName, ProviderChainEntry, PreferredAIProvider } from '@/types/provider';

/**
 * AI Provider Abstraction — Thermal Decision Engine
 * ===========================================================================
 *
 * Fallback chain order: Gemini → Claude → Z.ai → deterministic.
 *
 * EPISTEMIC INVARIANTS (non-negotiable):
 *  - Every provider receives the SAME immutable ExplainableDecisionInput.
 *  - No provider may calculate WHERE/WHEN, alter ranking, alter What-If cost,
 *    or write back decision data. Providers ONLY narrate verified evidence.
 *  - Every provider's raw output passes through the SAME grounding validator
 *    (±0.01°C numeric allow-list, forbidden medical/physical-semantic claims).
 *    The validator is NEVER weakened for a new provider.
 *  - If a provider times out, returns 429/5xx, emits malformed JSON, or fails
 *    grounding, the chain advances to the next provider.
 *  - The deterministic engine remains the only decision authority.
 *
 * SERVER-SIDE SECRETS:
 *  - GEMINI_API_KEY, ANTHROPIC_API_KEY read from process.env only.
 *  - Z.ai uses z-ai-web-dev-sdk (credentials configured server-side; no key in code).
 *  - No API key is ever returned to the browser.
 */

export type ProviderKind = 'gemini' | 'claude' | 'zai' | 'deterministic';

export interface ProviderInvocationOptions {
  timeoutMs?: number;
}

export interface ProviderInvocationResult {
  text: string;
  providerName: AIProviderName;
}

interface ProviderConfig {
  configured: boolean;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface ConfiguredProviders {
  gemini: ProviderConfig;
  claude: ProviderConfig;
  zai: { configured: boolean; model: string };
}

/** Natural fallback order (user preference may reorder the head). */
const NATURAL_CHAIN: ProviderKind[] = ['gemini', 'claude', 'zai'];

const GEMINI_DEFAULT_MODEL = 'gemini-flash-lite-latest';
const CLAUDE_DEFAULT_MODEL = 'claude-3-5-haiku-20241022';
const ZAI_DEFAULT_MODEL = 'glm-4.6'; // Z.ai in-house model id (informational)

/**
 * Detect which explanation providers are configured using server-side env only.
 * Never throws; returns configured:false for any provider missing credentials.
 */
export function getConfiguredProviders(): ConfiguredProviders {
  const geminiKey = process.env.GEMINI_API_KEY || (process.env.AI_PROVIDER?.toLowerCase() === 'gemini' ? process.env.AI_API_KEY : '') || '';
  const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || (process.env.AI_PROVIDER?.toLowerCase() === 'claude' ? process.env.AI_API_KEY : '') || '';

  // Generic AI_API_KEY fallback: classify by format heuristics.
  const genericKey = process.env.AI_API_KEY || '';
  const genericIsGemini = genericKey.startsWith('AIzaSy');

  const gemini: ProviderConfig = {
    configured: !!geminiKey,
    apiKey: geminiKey,
    model: process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL,
  };

  const claude: ProviderConfig = {
    configured: !!anthropicKey,
    apiKey: anthropicKey,
    model: process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || CLAUDE_DEFAULT_MODEL,
    baseUrl: process.env.ANTHROPIC_BASE_URL,
  };

  // Z.ai provider is "configured" when the SDK can be initialised server-side.
  // The SDK reads its own credentials from the environment — no key lives in code.
  const zaiConfigured = isZaiSdkAvailable();

  return {
    gemini,
    claude,
    zai: { configured: zaiConfigured, model: process.env.ZAI_MODEL || ZAI_DEFAULT_MODEL },
  };
}

/**
 * Build the ordered fallback chain given a user preference.
 * - 'auto' uses NATURAL_CHAIN order, filtered to configured providers.
 * - A specific preferred provider is placed first (if configured); the rest
 *   follow in natural order.
 * Returns only providers that are actually configured.
 */
export function buildProviderChain(preferred: PreferredAIProvider = 'auto'): ProviderKind[] {
  const cfg = getConfiguredProviders();
  const isConfigured = (p: ProviderKind): boolean => {
    if (p === 'gemini') return cfg.gemini.configured;
    if (p === 'claude') return cfg.claude.configured;
    if (p === 'zai') return cfg.zai.configured;
    return false;
  };

  if (preferred !== 'auto' && isConfigured(preferred)) {
    const rest = NATURAL_CHAIN.filter((p) => p !== preferred && isConfigured(p));
    return [preferred, ...rest];
  }

  return NATURAL_CHAIN.filter(isConfigured);
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-provider invocation (each throws on failure so the caller can fall back)
// ─────────────────────────────────────────────────────────────────────────────

async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, provider: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn();
  } finally {
    clearTimeout(timeoutId);
  }
}

function classifyInvocationError(err: unknown, provider: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  const isTimeout = err instanceof Error && (err.name === 'AbortError' || msg.includes('abort') || msg.includes('timeout'));
  if (isTimeout) return `${provider.toUpperCase()}_TIMEOUT`;
  if (/\b429\b/.test(msg)) return `${provider.toUpperCase()}_RATE_LIMITED`;
  if (/\b5\d\d\b/.test(msg)) return `${provider.toUpperCase()}_SERVER_ERROR`;
  if (msg.includes('EMPTY_RESPONSE') || msg.includes('MALFORMED')) return `${provider.toUpperCase()}_MALFORMED`;
  return `${provider.toUpperCase()}_ERROR: ${msg.slice(0, 120)}`;
}

/** Invoke Google Gemini via the generativelanguage REST API. */
async function invokeGemini(systemPrompt: string, userPrompt: string, cfg: ProviderConfig, timeoutMs: number): Promise<string> {
  if (!cfg.apiKey) throw new Error('GEMINI_NOT_CONFIGURED');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;
  const res = await withTimeout(() => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
    }),
  }), timeoutMs, 'gemini');

  if (res.status === 429) throw new Error('GEMINI_HTTP_ERROR_429');
  if (res.status >= 500) throw new Error(`GEMINI_HTTP_ERROR_${res.status}`);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GEMINI_HTTP_ERROR_${res.status}: ${t.slice(0, 160)}`);
  }

  const data = await res.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('GEMINI_EMPTY_RESPONSE');
  return content as string;
}

/** Invoke Anthropic Claude via the Messages API. */
async function invokeClaude(systemPrompt: string, userPrompt: string, cfg: ProviderConfig, timeoutMs: number): Promise<string> {
  if (!cfg.apiKey) throw new Error('CLAUDE_NOT_CONFIGURED');

  const endpoint = cfg.baseUrl || 'https://api.anthropic.com/v1/messages';
  const res = await withTimeout(() => fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.1,
    }),
  }), timeoutMs, 'claude');

  if (res.status === 429) throw new Error('CLAUDE_HTTP_ERROR_429');
  if (res.status >= 500) throw new Error(`CLAUDE_HTTP_ERROR_${res.status}`);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`CLAUDE_HTTP_ERROR_${res.status}: ${t.slice(0, 160)}`);
  }

  const data = await res.json();
  // Anthropic returns { content: [{ type:'text', text }] }
  const block = Array.isArray(data?.content) ? data.content.find((b: { type: string }) => b?.type === 'text') : null;
  const text = block?.text;
  if (!text) throw new Error('CLAUDE_EMPTY_RESPONSE');
  return text as string;
}

/**
 * Invoke Z.ai via z-ai-web-dev-sdk (backend-only; credentials configured
 * server-side by the runtime — no key in code).
 */
async function invokeZai(systemPrompt: string, userPrompt: string, timeoutMs: number): Promise<string> {
  const ZAIModule = await safeImportZai();
  if (!ZAIModule) throw new Error('ZAI_SDK_UNAVAILABLE');

  const zai = await withTimeout(() => ZAIModule.create(), timeoutMs, 'zai');

  const completion = await withTimeout(() => zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    thinking: { type: 'disabled' },
  }), timeoutMs, 'zai');

  const text = completion?.choices?.[0]?.message?.content;
  if (!text) throw new Error('ZAI_EMPTY_RESPONSE');
  return text as string;
}

/**
 * Invoke a specific provider. Throws on any failure (caller catches & advances chain).
 */
export async function invokeSpecificProvider(
  provider: ProviderKind,
  systemPrompt: string,
  userPrompt: string,
  options?: ProviderInvocationOptions,
): Promise<ProviderInvocationResult> {
  const timeoutMs = options?.timeoutMs ?? 10000;
  const cfg = getConfiguredProviders();
  const providerName: AIProviderName = provider === 'gemini' ? 'GEMINI' : provider === 'claude' ? 'CLAUDE' : 'ZAI';

  let text: string;
  if (provider === 'gemini') text = await invokeGemini(systemPrompt, userPrompt, cfg.gemini, timeoutMs);
  else if (provider === 'claude') text = await invokeClaude(systemPrompt, userPrompt, cfg.claude, timeoutMs);
  else if (provider === 'zai') text = await invokeZai(systemPrompt, userPrompt, timeoutMs);
  else throw new Error(`UNSUPPORTED_PROVIDER: ${provider}`);

  return { text, providerName };
}

/** Re-export the error classifier so the explainer can build a fallback trace. */
export { classifyInvocationError };

// ─────────────────────────────────────────────────────────────────────────────
// Z.ai SDK availability probe (lazy + cached)
// ─────────────────────────────────────────────────────────────────────────────

let zaiModuleCache: { create: () => Promise<ZaiClient> } | null | undefined;
let zaiProbed = false;

interface ZaiClient {
  chat: {
    completions: {
      create: (req: { messages: Array<{ role: string; content: string }>; thinking?: { type: string } }) => Promise<{ choices?: Array<{ message?: { content?: string } }> }>;
    };
  };
}

async function safeImportZai(): Promise<{ create: () => Promise<ZaiClient> } | null> {
  if (zaiProbed) return zaiModuleCache ?? null;
  zaiProbed = true;
  try {
    // z-ai-web-dev-sdk MUST be backend-only. This module is only imported by
    // server API routes, so the import is safe here.
    const mod = await import('z-ai-web-dev-sdk');
    const ZAI = (mod as { default?: { create: () => Promise<ZaiClient> } }).default ?? (mod as unknown as { create: () => Promise<ZaiClient> });
    zaiModuleCache = ZAI ?? null;
    return zaiModuleCache;
  } catch {
    zaiModuleCache = null;
    return null;
  }
}

function isZaiSdkAvailable(): boolean {
  // Synchronous check used by getConfiguredProviders. We optimistically treat
  // the SDK as configured (it is pre-installed); actual availability is
  // confirmed at invocation / health-test time via safeImportZai().
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection testing (for the health endpoint)
// ─────────────────────────────────────────────────────────────────────────────

const HEALTH_TEST_SYSTEM = 'Return a JSON object with a single property "status" with value "ok".';
const HEALTH_TEST_USER = 'Respond with {"status": "ok"}';

/** Test a single provider with a tiny fixed prompt (never customer data). */
export async function testSpecificProvider(
  provider: ProviderKind,
  options?: { timeoutMs?: number },
): Promise<ProviderChainEntry> {
  const cfg = getConfiguredProviders();
  const timeoutMs = options?.timeoutMs ?? 8000;

  const baseEntry = (configured: boolean): ProviderChainEntry => ({
    provider: (provider === 'gemini' ? 'GEMINI' : provider === 'claude' ? 'CLAUDE' : 'ZAI') as AIProviderName,
    configured,
    connected: configured ? null : false,
  });

  const isConfigured =
    provider === 'gemini' ? cfg.gemini.configured
    : provider === 'claude' ? cfg.claude.configured
    : provider === 'zai' ? cfg.zai.configured
    : false;

  if (!isConfigured) return { ...baseEntry(false), connected: false };

  const start = Date.now();
  try {
    const result = await invokeSpecificProvider(provider, HEALTH_TEST_SYSTEM, HEALTH_TEST_USER, { timeoutMs });
    const latencyMs = Date.now() - start;
    // A non-empty text response counts as connected for the health probe.
    if (!result.text || !result.text.trim()) {
      return { ...baseEntry(true), connected: false, latencyMs, errorCode: `${result.providerName}_EMPTY_RESPONSE`, errorMessage: 'Provider returned an empty response.' };
    }
    return { ...baseEntry(true), connected: true, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const reason = classifyInvocationError(err, provider);
    return { ...baseEntry(true), connected: false, latencyMs, errorCode: reason.split(':')[0], errorMessage: reason };
  }
}

/**
 * Server-side AI health check across the whole fallback chain.
 * Reports which providers are configured + connected, and which is active.
 */
export async function testAIConnection(
  options?: { timeoutMs?: number; preferredProvider?: PreferredAIProvider; providerConfig?: { provider?: string; apiKey?: string } },
): Promise<AIHealthResponse> {
  const checkedAt = new Date().toISOString();
  const preferred = options?.preferredProvider ?? 'auto';
  const chain = buildProviderChain(preferred);

  if (chain.length === 0) {
    return {
      configured: false,
      provider: 'NONE',
      connected: false,
      errorCode: 'AI_NOT_CONFIGURED',
      errorMessage: 'No LLM provider is configured (set GEMINI_API_KEY / ANTHROPIC_API_KEY or enable the Z.ai SDK).',
      checkedAt,
      preferredProvider: preferred,
      providerChain: [],
    };
  }

  // Probe every provider in the chain (bounded; tiny fixed prompt).
  const providerChain: ProviderChainEntry[] = [];
  for (const provider of chain) {
    const entry = await testSpecificProvider(provider, { timeoutMs: options?.timeoutMs ?? 8000 });
    providerChain.push(entry);
  }

  // Active provider = first connected in chain order.
  const active = providerChain.find((e) => e.connected) ?? providerChain[0];
  const connected = !!active?.connected;
  const latencyMs = active?.latencyMs;

  return {
    configured: true,
    provider: active?.provider ?? 'NONE',
    connected,
    latencyMs,
    errorCode: connected ? undefined : (active?.errorCode ?? 'AI_UNAVAILABLE'),
    errorMessage: connected ? undefined : (active?.errorMessage ?? 'All configured AI providers are currently unavailable.'),
    checkedAt,
    preferredProvider: preferred,
    providerChain,
  };
}

/** Compatibility export for detectAIProvider */
export function detectAIProvider(config?: { provider?: string; apiKey?: string }): {
  provider: string;
  providerName: AIProviderName;
  model: string;
} {
  const provider = config?.provider?.toLowerCase();
  if (provider === 'gemini' || (config?.apiKey && config.apiKey.startsWith('AIzaSy'))) {
    return {
      provider: 'gemini',
      providerName: 'GEMINI',
      model: GEMINI_DEFAULT_MODEL,
    };
  }
  if (provider === 'claude' || (config?.apiKey && config.apiKey.startsWith('sk-ant-'))) {
    return {
      provider: 'claude',
      providerName: 'CLAUDE',
      model: CLAUDE_DEFAULT_MODEL,
    };
  }
  if (provider === 'openai' || (config?.apiKey && config.apiKey.startsWith('sk-proj-'))) {
    return {
      provider: 'openai',
      providerName: 'NONE',
      model: 'gpt-4o-mini',
    };
  }
  return {
    provider: 'deterministic',
    providerName: 'NONE',
    model: 'deterministic-rules',
  };
}

/** Compatibility export for invokeAIProvider */
export async function invokeAIProvider(
  systemPrompt: string,
  userPrompt: string,
  options?: { providerConfig?: { provider?: string; apiKey?: string; model?: string }; timeoutMs?: number }
): Promise<ProviderInvocationResult> {
  const provider = (options?.providerConfig?.provider?.toLowerCase() as ProviderKind) || 'gemini';
  return invokeSpecificProvider(provider, systemPrompt, userPrompt, { timeoutMs: options?.timeoutMs });
}

