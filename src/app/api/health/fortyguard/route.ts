import { NextResponse } from 'next/server';
import { testFortyGuardConnection } from '@/lib/fortyguard/health';
import { probeProviderCapability } from '@/lib/fortyguard/capability';
import type { DataSourceMode } from '@/types/provenance';
import { z } from 'zod';

const HealthRequestSchema = z.object({
  mode: z.enum(['LIVE', 'FIXTURE']).optional(),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const modeParam = searchParams.get('mode');
  const mode: DataSourceMode | undefined =
    modeParam === 'LIVE' || modeParam === 'FIXTURE' ? modeParam : undefined;

  const result = await testFortyGuardConnection({ mode });

  // For LIVE mode, also probe the provider capability (plan, credits, billing).
  // This surfaces honest access metadata — never fabricates a coverage region.
  const capability =
    mode === 'LIVE' || (!mode && process.env.FORTYGUARD_DATA_SOURCE === 'LIVE')
      ? await probeProviderCapability()
      : null;

  return NextResponse.json({
    success: true,
    health: result,
    capability,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parseResult = HealthRequestSchema.safeParse(body);
    const mode = parseResult.success ? parseResult.data.mode : undefined;

    const result = await testFortyGuardConnection({ mode });

    // For LIVE mode, also probe the provider capability (plan, credits, billing).
  // This surfaces honest access metadata — never fabricates a coverage region.
  const capability =
    mode === 'LIVE' || (!mode && process.env.FORTYGUARD_DATA_SOURCE === 'LIVE')
      ? await probeProviderCapability()
      : null;

    return NextResponse.json({
      success: true,
      health: result,
      capability,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'HEALTH_CHECK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown health check failure',
        },
      },
      { status: 500 }
    );
  }
}
