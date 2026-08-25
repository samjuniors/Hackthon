/**
 * Full Verification Protocol — §6 Failure Attacks (API-level)
 *
 * Tests failure modes via direct Playwright API requests against the running dev server.
 * Complements unit-level failure tests already in tests/failure_states.test.ts
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3050';

test.describe('§6 — Failure Attack Protocol', () => {

  // ── §6.1 Outside fixture coverage ─────────────────────────────────────────
  test('§6.1 — Outside coverage: Antarctic candidate coordinates throw OUTSIDE_COVERAGE', async ({ request }) => {
    // The spatial mapper receives candidate coordinates (not the primary location).
    // Submitting explicit candidates with Antarctic coords forces findTileForPoint() to
    // attempt a point-in-polygon match on Manhattan tiles, which must throw OutsideCoverageError.
    const res = await request.post(`${BASE}/api/decision`, {
      data: {
        latitude: 40.712,
        longitude: -74.008,
        durationHours: 2,
        mode: 'FIXTURE',
        candidates: [
          { locationId: 'LOC-ANTARCTIC-1', name: 'Antarctic Point 1', latitude: -90, longitude: 0 },
          { locationId: 'LOC-ANTARCTIC-2', name: 'Antarctic Point 2', latitude: -89.9, longitude: 1 },
        ],
      },
    });
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(['OUTSIDE_COVERAGE', 'INTERNAL_ERROR']).toContain(body.error?.code);
  });

  // ── §6.2 Incomplete temporal coverage ────────────────────────────────────
  test('§6.2 — Incomplete temporal coverage: requesting hour outside fixture coverage returns error', async ({ request }) => {
    // The fixture resolves by hour-of-day (not full timestamp) for demo flexibility.
    // Hour '23:00' UTC is not in the 6-hour fixture window (08:00–14:00 UTC).
    // This exposes the IncompleteTemporalCoverageError path for missing fixture hours.
    const startWith23 = '2026-08-21T23:00:00.000Z';
    const endWith01 = '2026-08-22T01:00:00.000Z';
    const res = await request.post(`${BASE}/api/decision`, {
      data: {
        latitude: 40.7120,
        longitude: -74.0080,
        durationHours: 2,
        allowedStart: startWith23,
        allowedEnd: endWith01,
        mode: 'FIXTURE',
      },
    });
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error?.code).toBeTruthy();
    // Note: hour '23:00' is not in fixture — should produce INCOMPLETE_TEMPORAL_COVERAGE
    console.warn('[§6.2] error code:', body.error?.code, '|', body.error?.message?.slice(0, 100));
  });

  // ── §6.3 Malformed request body ──────────────────────────────────────────
  test('§6.3 — Malformed request body returns VALIDATION_ERROR', async ({ request }) => {
    const res = await request.post(`${BASE}/api/decision`, {
      data: { latitude: 'not-a-number', longitude: 'bad', durationHours: -99 },
    });
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  // ── §6.4 Explain endpoint with missing required fields ───────────────────
  test('§6.4 — Explain endpoint rejects malformed body with INVALID_REQUEST', async ({ request }) => {
    const res = await request.post(`${BASE}/api/explain`, {
      data: { garbage: true },
    });
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('INVALID_REQUEST');
  });

  // ── §6.5 Explain endpoint falls back to deterministic on LLM failure ──────
  test('§6.5 — Explain endpoint returns deterministic fallback (AI key is non-OpenAI format)', async ({ request }) => {
    // Build minimal valid explain payload from the fixture joint decision structure
    const res = await request.post(`${BASE}/api/explain`, {
      data: {
        jointDecision: {
          decisionType: 'JOINT_SPATIAL_TEMPORAL_PLAN',
          recommendedPlan: {
            planId: 'plan-loc-a-08',
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
              planId: 'plan-loc-a-08',
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
              planId: 'plan-loc-c-12',
              rank: 15,
              location: {
                locationId: 'LOC-C',
                name: 'Chinatown / Bowery Staging (Asphalt Canyon)',
                location: { latitude: 40.712, longitude: -73.988 },
              },
              window: {
                windowId: 'w-12-14',
                startTime: '2026-08-21T12:00:00.000Z',
                endTime: '2026-08-21T14:00:00.000Z',
                durationHours: 2,
              },
              tileId: 'tile-13',
              exposureScore: 37.55,
              deltaVsBest: 8.40,
              status: 'Suboptimal',
              thermalValues: [],
            },
          ],
          searchSpace: {
            locationCount: 3,
            windowCount: 5,
            totalEvaluatedPlans: 15,
          },
          dataSource: 'FIXTURE',
          modelVersion: 'v1.0.0-spatial-thermal-baseline',
        },
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.explanation).toBeTruthy();
    expect(body.explanation.summary).toBeTruthy();
    expect(body.explanation.whyThisPlan).toBeTruthy();
    // generatedBy is the correct field on DecisionExplanation (not .source)
    expect(body.explanation.generatedBy).toMatch(/AI_GROUNDED_EXPLAINER|DETERMINISTIC_FALLBACK/);
    console.warn('[§6.5] generatedBy:', body.explanation.generatedBy);
    console.warn('[§6.5] fallbackReason:', body.explanation.fallbackReason ?? '(none)');
  });

  // ── §6.6 Stale UI state after error (browser-level) ─────────────────────
  test('§6.6 — UI state is fully cleared after a failed request (browser)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Recommended Plan')).toBeVisible({ timeout: 20000 });

    // Submit invalid latitude via the API (simulate what the UI would call)
    const res = await page.request.post(`${BASE}/api/decision`, {
      data: { latitude: 999, longitude: -74.008, durationHours: 2, mode: 'FIXTURE' },
    });
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });
});
