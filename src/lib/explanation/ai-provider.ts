import type { AIHealthResponse, AIProviderName } from '@/types/provider';

export interface AIProviderConfig {
  provider: 'gemini' | 'openai' | 'deterministic';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export function detectAIProvider(override?: AIProviderConfig): {
  provider: 'gemini' | 'openai' | 'deterministic';
  providerName: AIProviderName;
  apiKey: string;
  model: string;
  baseUrl?: string;
} {
  if (override?.provider === 'deterministic') {
    return { provider: 'deterministic', providerName: 'NONE', apiKey: '', model: '' };
  }

  // Explicit override
  if (override?.provider === 'gemini' && override.apiKey) {
    return {
      provider: 'gemini',
      providerName: 'GEMINI',
      apiKey: override.apiKey,
      model: override.model || process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    };
  }

  if (override?.provider === 'openai' && override.apiKey) {
    return {
      provider: 'openai',
      providerName: 'OPENAI',
      apiKey: override.apiKey,
      model: override.model || process.env.EXPLAINER_MODEL || 'gpt-4o-mini',
      baseUrl: override.baseUrl || process.env.OPENAI_BASE_URL,
    };
  }

  // Environment detection
  const envProvider = process.env.AI_PROVIDER?.toLowerCase();

  // 1. Google Gemini
  if (process.env.GEMINI_API_KEY || (envProvider === 'gemini' && process.env.AI_API_KEY)) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '';
    return {
      provider: 'gemini',
      providerName: 'GEMINI',
      apiKey,
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    };
  }

  // 2. OpenAI
  if (process.env.OPENAI_API_KEY || (envProvider === 'openai' && process.env.AI_API_KEY)) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY || '';
    return {
      provider: 'openai',
      providerName: 'OPENAI',
      apiKey,
      model: process.env.EXPLAINER_MODEL || 'gpt-4o-mini',
      baseUrl: process.env.OPENAI_BASE_URL,
    };
  }

  // 3. Fallback generic AI_API_KEY — default to OpenAI or Gemini based on format
  if (process.env.AI_API_KEY) {
    const key = process.env.AI_API_KEY;
    if (key.startsWith('AIzaSy')) {
      return {
        provider: 'gemini',
        providerName: 'GEMINI',
        apiKey: key,
        model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
      };
    }
    return {
      provider: 'openai',
      providerName: 'OPENAI',
      apiKey: key,
      model: process.env.EXPLAINER_MODEL || 'gpt-4o-mini',
      baseUrl: process.env.OPENAI_BASE_URL,
    };
  }

  return {
    provider: 'deterministic',
    providerName: 'NONE',
    apiKey: '',
    model: '',
  };
}

/**
 * Executes a structured JSON prompt against the configured AI provider.
 */
export async function invokeAIProvider(
  systemPrompt: string,
  userPrompt: string,
  options?: {
    timeoutMs?: number;
    providerConfig?: AIProviderConfig;
  }
): Promise<{ text: string; providerName: AIProviderName }> {
  const detected = detectAIProvider(options?.providerConfig);

  if (detected.provider === 'deterministic' || !detected.apiKey) {
    throw new Error('NO_AI_KEY_CONFIGURED');
  }

  const timeoutMs = options?.timeoutMs ?? 5000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (detected.provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${detected.model}:generateContent?key=${detected.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`GEMINI_HTTP_ERROR_${res.status}: ${errorText.slice(0, 200)}`);
      }

      const data = await res.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        throw new Error('GEMINI_EMPTY_RESPONSE');
      }

      return { text: content, providerName: 'GEMINI' };
    }

    // OpenAI provider
    const endpoint = detected.baseUrl || 'https://api.openai.com/v1/chat/completions';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${detected.apiKey}`,
      },
      body: JSON.stringify({
        model: detected.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`OPENAI_HTTP_ERROR_${res.status}: ${errorText.slice(0, 200)}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OPENAI_EMPTY_RESPONSE');
    }

    return { text: content, providerName: 'OPENAI' };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Server-side AI health check.
 * Sends a tiny, fixed test prompt (never customer decision data) to verify connectivity.
 */
export async function testAIConnection(
  options?: {
    timeoutMs?: number;
    providerConfig?: AIProviderConfig;
  }
): Promise<AIHealthResponse> {
  const detected = detectAIProvider(options?.providerConfig);
  const checkedAt = new Date().toISOString();

  if (detected.provider === 'deterministic' || !detected.apiKey) {
    return {
      configured: false,
      provider: 'NONE',
      connected: false,
      errorCode: 'AI_NOT_CONFIGURED',
      errorMessage: 'No LLM API key (GEMINI_API_KEY or OPENAI_API_KEY) is configured.',
      checkedAt,
    };
  }

  const startTime = Date.now();
  try {
    const testSystem = 'Return a JSON object with a single property "status" with value "ok".';
    const testUser = 'Respond with {"status": "ok"}';
    const result = await invokeAIProvider(testSystem, testUser, {
      timeoutMs: options?.timeoutMs ?? 8000,
      providerConfig: options?.providerConfig,
    });

    const latencyMs = Date.now() - startTime;
    return {
      configured: true,
      provider: result.providerName,
      connected: true,
      latencyMs,
      checkedAt,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof Error && (err.name === 'AbortError' || msg.includes('abort') || msg.includes('timeout'));

    if (isTimeout) {
      return {
        configured: true,
        provider: detected.providerName,
        connected: false,
        latencyMs,
        errorCode: 'AI_TIMEOUT',
        errorMessage: 'AI provider request timed out.',
        checkedAt,
      };
    }

    if (msg.includes('401') || msg.includes('403') || msg.includes('API_KEY_INVALID') || msg.includes('UNAUTHENTICATED')) {
      return {
        configured: true,
        provider: detected.providerName,
        connected: false,
        latencyMs,
        errorCode: 'AI_AUTH_ERROR',
        errorMessage: `Authentication failed with ${detected.providerName}. Please check your API key.`,
        checkedAt,
      };
    }

    return {
      configured: true,
      provider: detected.providerName,
      connected: false,
      latencyMs,
      errorCode: 'AI_PROVIDER_ERROR',
      errorMessage: `Failed to connect to ${detected.providerName}: ${msg.slice(0, 150)}`,
      checkedAt,
    };
  }
}
