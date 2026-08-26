import { NextResponse } from 'next/server';
import { testAIConnection } from '@/lib/explanation/ai-provider';
import type { PreferredAIProvider } from '@/types/provider';
import { z } from 'zod';

const HealthRequestSchema = z.object({
  preferredProvider: z.enum(['auto', 'gemini', 'claude', 'zai']).optional(),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const pp = searchParams.get('preferredProvider');
  const preferredProvider: PreferredAIProvider | undefined =
    pp === 'auto' || pp === 'gemini' || pp === 'claude' || pp === 'zai' ? pp : undefined;

  const result = await testAIConnection({ preferredProvider });
  return NextResponse.json({
    success: true,
    health: result,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parseResult = HealthRequestSchema.safeParse(body);
    const preferredProvider = parseResult.success ? parseResult.data.preferredProvider : undefined;

    const result = await testAIConnection({ preferredProvider });
    return NextResponse.json({
      success: true,
      health: result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'AI_HEALTH_CHECK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown AI health check failure',
        },
      },
      { status: 500 }
    );
  }
}
