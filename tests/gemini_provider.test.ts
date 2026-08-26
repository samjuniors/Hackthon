import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectAIProvider,
  invokeAIProvider,
  testAIConnection,
} from '@/lib/explanation/ai-provider';
import { explainDecision } from '@/lib/explanation/ai-explainer';
import type { ExplainableDecisionInput } from '@/types/explanation';

const mockDecisionInput: ExplainableDecisionInput = {
  jointDecision: {
    decisionType: 'JOINT_SPATIAL_TEMPORAL_PLAN',
    recommendedPlan: {
      planId: 'plan-1',
      rank: 1,
      location: {
        locationId: 'LOC-A',
        name: 'Battery Park Greenway (Waterfront)',
        location: { latitude: 40.712, longitude: -74.008 },
      },
      window: {
        windowId: 'w-08-10',
        startTime: '2026-08-21T08:00:00.000Z',
        endTime: '2026-08-21T10:00:00.000Z',
        durationHours: 2,
      },
      tileId: 'tile-11',
      exposureScore: 29.15,
      deltaVsBest: 0.0,
      status: 'Optimal',
      thermalValues: [],
    },
    rankedPlans: [
      {
        planId: 'plan-1',
        rank: 1,
        location: {
          locationId: 'LOC-A',
          name: 'Battery Park Greenway (Waterfront)',
          location: { latitude: 40.712, longitude: -74.008 },
        },
        window: {
          windowId: 'w-08-10',
          startTime: '2026-08-21T08:00:00.000Z',
          endTime: '2026-08-21T10:00:00.000Z',
          durationHours: 2,
        },
        tileId: 'tile-11',
        exposureScore: 29.15,
        deltaVsBest: 0.0,
        status: 'Optimal',
        thermalValues: [],
      },
      {
        planId: 'plan-2',
        rank: 2,
        location: {
          locationId: 'LOC-B',
          name: 'City Hall Civic Center',
          location: { latitude: 40.712, longitude: -73.998 },
        },
        window: {
          windowId: 'w-10-12',
          startTime: '2026-08-21T10:00:00.000Z',
          endTime: '2026-08-21T12:00:00.000Z',
          durationHours: 2,
        },
        tileId: 'tile-12',
        exposureScore: 33.40,
        deltaVsBest: 4.25,
        status: 'Feasible',
        thermalValues: [],
      },
    ],
    searchSpace: {
      locationCount: 2,
      windowCount: 2,
      totalEvaluatedPlans: 4,
    },
    dataSource: 'FIXTURE',
    modelVersion: 'v1.0.0-spatial-thermal-baseline',
    evidenceBundle: {
      candidateCount: 2,
      windowCount: 2,
      sourceEndpoint: '/v1/heatmap',
      dataSource: 'FIXTURE',
      provenance: 'DERIVED',
    },
    spatialFieldMetadata: {
      baseTimestamp: '2026-08-21T08:00:00.000Z',
      coverageType: 'BASE_TIMESTAMP_SNAPSHOT',
      totalEvaluatedHours: 2,
      description: 'Snapshot',
    },
  },
};

describe('Gemini & AI Provider Abstraction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Detects Gemini when GEMINI_API_KEY is provided or key starts with AIzaSy', () => {
    const detected = detectAIProvider({ provider: 'gemini', apiKey: 'AIzaSyTestKey123' });
    expect(detected.provider).toBe('gemini');
    expect(detected.providerName).toBe('GEMINI');
    expect(detected.model).toContain('gemini');
  });

  it('2. Detects OpenAI when OPENAI_API_KEY is provided', () => {
    const detected = detectAIProvider({ provider: 'openai', apiKey: 'sk-proj-testKey123' });
    expect(detected.provider).toBe('openai');
    expect(detected.providerName).toBe('OPENAI');
  });

  it('3. Detects Deterministic when no key is provided', () => {
    const detected = detectAIProvider({ provider: 'deterministic' });
    expect(detected.provider).toBe('deterministic');
    expect(detected.providerName).toBe('NONE');
  });

  it('4. Gemini invocation sends Google Gemini REST schema', async () => {
    let capturedUrl = '';
    const captured: {
      body: {
        systemInstruction?: { parts?: Array<{ text?: string }> };
        generationConfig?: { responseMimeType?: string };
      } | null;
    } = { body: null };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      captured.body = JSON.parse(String(init?.body || '{}'));
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      summary: 'Recommended Battery Park Greenway at 29.15°C',
                      whyThisPlan: 'Optimal plan with 4.25°C lower temperature than City Hall.',
                      epistemicNotice: 'Deterministic baseline.',
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });

    const result = await invokeAIProvider('system prompt', 'user prompt', {
      providerConfig: { provider: 'gemini', apiKey: 'test-gemini-key' },
    });

    expect(capturedUrl).toContain('generativelanguage.googleapis.com');
    expect(capturedUrl).toContain('key=test-gemini-key');
    expect(captured.body).not.toBeNull();
    if (captured.body) {
      expect(captured.body.systemInstruction).toBeDefined();
      expect(captured.body.generationConfig?.responseMimeType).toBe('application/json');
    }
    expect(result.providerName).toBe('GEMINI');
  });

  it('5. AI Connection Test returns CONNECTED on valid response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ status: 'ok' }) }],
              },
            },
          ],
        }),
        { status: 200 }
      )
    );

    const health = await testAIConnection({
      providerConfig: { provider: 'gemini', apiKey: 'test-gemini-key' },
    });

    expect(health.configured).toBe(true);
    expect(health.connected).toBe(true);
    expect(health.provider).toBe('GEMINI');
    expect(typeof health.latencyMs).toBe('number');
  });

  it('6. AI Connection Test returns NOT_CONFIGURED when no key is present', async () => {
    const health = await testAIConnection({
      providerConfig: { provider: 'deterministic' },
    });

    expect(health.configured).toBe(false);
    expect(health.connected).toBe(false);
    expect(health.provider).toBe('NONE');
    expect(health.errorCode).toBe('AI_NOT_CONFIGURED');
  });

  it('7. AI explanation falls back deterministically on HTTP failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429 })
    );

    const explanation = await explainDecision(mockDecisionInput, {
      provider: 'gemini',
      apiKey: 'test-key',
    });

    expect(explanation.generatedBy).toBe('DETERMINISTIC_FALLBACK');
    expect(explanation.summary).toBeTruthy();
    expect(explanation.whyThisPlan).toBeTruthy();
  });
});
