import { NextResponse } from 'next/server';
import { explainDecision } from '@/lib/explanation/ai-explainer';
import type { ExplainableDecisionInput } from '@/types/explanation';
import { AppError } from '@/types/errors';
import { z } from 'zod';

const ExplainRequestSchema = z.object({
  jointDecision: z.object({
    decisionType: z.literal('JOINT_SPATIAL_TEMPORAL_PLAN'),
    recommendedPlan: z.any(),
    rankedPlans: z.array(z.any()),
    searchSpace: z.object({
      locationCount: z.number(),
      windowCount: z.number(),
      totalEvaluatedPlans: z.number(),
    }),
    dataSource: z.enum(['LIVE', 'FIXTURE']),
    modelVersion: z.literal('v1.0.0-spatial-thermal-baseline'),
  }),
  activeScenario: z.any().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parseResult = ExplainRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: `Invalid explanation request schema: ${parseResult.error.message}`,
          },
        },
        { status: 400 }
      );
    }

    const input: ExplainableDecisionInput = {
      jointDecision: parseResult.data.jointDecision as unknown as ExplainableDecisionInput['jointDecision'],
      activeScenario: parseResult.data.activeScenario as unknown as ExplainableDecisionInput['activeScenario'],
    };


    const explanation = await explainDecision(input);

    return NextResponse.json({
      success: true,
      explanation,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: error.code, message: error.message },
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'EXPLANATION_PIPELINE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to generate explanation',
        },
      },
      { status: 500 }
    );
  }
}
