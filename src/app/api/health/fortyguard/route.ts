import { NextResponse } from 'next/server';
import { testFortyGuardConnection } from '@/lib/fortyguard/health';
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
  return NextResponse.json({
    success: true,
    health: result,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parseResult = HealthRequestSchema.safeParse(body);
    const mode = parseResult.success ? parseResult.data.mode : undefined;

    const result = await testFortyGuardConnection({ mode });
    return NextResponse.json({
      success: true,
      health: result,
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
