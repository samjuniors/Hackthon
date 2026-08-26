import { NextResponse } from 'next/server';
import { testAIConnection } from '@/lib/explanation/ai-provider';

export async function GET() {
  const result = await testAIConnection();
  return NextResponse.json({
    success: true,
    health: result,
  });
}

export async function POST() {
  try {
    const result = await testAIConnection();
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
