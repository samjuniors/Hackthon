/**
 * Application & Domain Error Hierarchy
 */
import type { ProductionErrorDetails } from './provider';

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'FortyGuard API key authentication failed') {
    super(message, 'AUTHENTICATION_FAILED', 401);
  }
}

export class FortyGuardApiError extends AppError {
  constructor(message: string, public readonly originalStatusCode?: number) {
    super(message, 'FORTYGUARD_API_ERROR', 502);
  }
}

export class FortyGuardProcessingError extends AppError {
  constructor(public readonly activityId: string, message = 'FortyGuard activity processing failed') {
    super(message, 'FORTYGUARD_PROCESSING_FAILED', 502);
  }
}

export class FortyGuardTimeoutError extends AppError {
  constructor(public readonly activityId: string, message = 'FortyGuard asynchronous thermal tile computation timed out') {
    super(message, 'FORTYGUARD_TIMEOUT', 504);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class IncompleteTemporalCoverageError extends AppError {
  constructor(message = 'Requested time window exceeds available FortyGuard temporal range') {
    super(message, 'INCOMPLETE_TEMPORAL_COVERAGE', 400);
  }
}

export class InfeasibleConstraintsError extends AppError {
  constructor(message = 'No candidate operating windows satisfy the specified constraints') {
    super(message, 'INFEASIBLE_CONSTRAINTS', 422);
  }
}

export class OutsideCoverageError extends AppError {
  constructor(message = 'Target location point lies outside FortyGuard spatial tile coverage') {
    super(message, 'OUTSIDE_COVERAGE', 404);
  }
}

/**
 * A tile was located for the requested point, but it carries no usable thermal value.
 *
 * This exists so that a missing temperature can NEVER be silently coerced to a number.
 * A defaulted 0 °C would be the coldest possible reading and would therefore win every
 * minimisation the decision engine performs — turning absent data into a recommendation.
 */
export class MissingThermalValueError extends AppError {
  constructor(message = 'FortyGuard tile contains no usable temperature value') {
    super(message, 'MISSING_THERMAL_VALUE', 502);
  }
}

/**
 * An empty tile surface was returned for a requested timestamp.
 *
 * `/v1/heatmap` returns HTTP 200 with `Completed` status and an EMPTY FeatureCollection
 * for timestamps it has no model run for (verified: future hours and roughly the most
 * recent 12-24 hours). That is a data-absence condition, not a transport success.
 */
export class EmptyThermalFieldError extends AppError {
  constructor(message = 'FortyGuard returned an empty tile surface for the requested timestamp') {
    super(message, 'EMPTY_THERMAL_FIELD', 502);
  }
}

/**
 * Maps raw system errors to sanitized, user-safe production error details.
 */
export function mapErrorToProductionDetails(error: unknown): ProductionErrorDetails {
  if (error instanceof AuthenticationError) {
    return {
      code: 'FORTYGUARD_AUTH_ERROR',
      message: 'Authentication failed with the FortyGuard API.',
      recoverySuggestion: 'Verify the FORTYGUARD_API_KEY secret in your server environment.',
      category: 'PROVIDER',
    };
  }

  if (error instanceof OutsideCoverageError) {
    return {
      code: 'FORTYGUARD_OUTSIDE_COVERAGE',
      message: 'Thermal analysis unavailable for this location. FortyGuard returned no active thermal tiles for these coordinates.',
      recoverySuggestion: 'Select another metropolitan area covered by FortyGuard or use DEMO mode for Manhattan analysis.',
      category: 'DATA',
    };
  }

  if (error instanceof EmptyThermalFieldError) {
    return {
      code: 'FORTYGUARD_EMPTY_TILES',
      message: 'FortyGuard returned 0 thermal cells for this specific date and hour.',
      recoverySuggestion: 'FortyGuard models cover daylight hours (e.g. 10:00–18:00) on active historical dates. Adjust the WHEN time/date parameters, or switch to DEMO mode for Manhattan analysis.',
      category: 'DATA',
    };
  }

  if (error instanceof IncompleteTemporalCoverageError) {
    return {
      code: 'FORTYGUARD_INCOMPLETE_COVERAGE',
      message: 'Thermal data is incomplete or unavailable for the requested operating time window.',
      recoverySuggestion: 'Adjust the allowed operating window or duration to fall within available FortyGuard lead times.',
      category: 'DATA',
    };
  }

  if (error instanceof FortyGuardTimeoutError || (error instanceof FortyGuardProcessingError && error.message.includes('timed out'))) {
    return {
      code: 'FORTYGUARD_TIMEOUT',
      message: 'FortyGuard asynchronous thermal tile computation timed out.',
      recoverySuggestion: 'The external provider is temporarily unavailable due to heavy load. Retry Live, or continue with Demo mode as an explicitly labelled offline verification path.',
      category: 'PROVIDER',
    };
  }

  if (error instanceof FortyGuardProcessingError) {
    return {
      code: 'FORTYGUARD_PROCESSING_FAILED',
      message: 'FortyGuard thermal computation failed on provider servers.',
      recoverySuggestion: 'The external provider is temporarily unavailable for this request. Retry Live, or continue with Demo mode as an explicitly labelled offline verification path.',
      category: 'PROVIDER',
    };
  }

  if (error instanceof FortyGuardApiError) {
    // DISTINCT actionable states per provider HTTP status (audit §6):
    // 400 = provider-side validation rejection (never charged)
    // 402 = insufficient credits (retrying CANNOT help)
    // 429 = rate limited (retry only after waiting)
    // 5xx / network = transient outage (retry is reasonable)
    if (error.originalStatusCode === 402) {
      return {
        code: 'FORTYGUARD_CREDITS_EXHAUSTED',
        message: 'FortyGuard rejected the request: insufficient credits on this API key (HTTP 402).',
        recoverySuggestion:
          'This API key has no remaining credits — the request was NOT completed and no thermal data was produced (retrying cannot help). DEMO mode replays the captured field without credits.',
        category: 'PROVIDER',
      };
    }
    if (error.originalStatusCode === 429) {
      return {
        code: 'FORTYGUARD_RATE_LIMITED',
        message: 'FortyGuard rate limit reached for this API key (HTTP 429).',
        recoverySuggestion:
          'Wait a moment before retrying LIVE analysis. DEMO mode remains available without provider requests.',
        category: 'PROVIDER',
      };
    }
    if (error.originalStatusCode === 400) {
      return {
        code: 'FORTYGUARD_REJECTED_REQUEST',
        message: 'FortyGuard rejected the request as invalid (HTTP 400 — constraint violations are never charged).',
        recoverySuggestion:
          'Adjust the analysis area, date/time, or location to satisfy the documented FortyGuard constraints, then retry.',
        category: 'VALIDATION',
      };
    }
    return {
      code: 'FORTYGUARD_PROVIDER_ERROR',
      message: 'FortyGuard API returned an unexpected error or outage.',
      recoverySuggestion: 'The external provider is temporarily unavailable. Retry Live, or continue with Demo mode as an explicitly labelled offline verification path.',
      category: 'PROVIDER',
    };
  }

  if (error instanceof ValidationError) {
    return {
      code: 'VALIDATION_ERROR',
      message: error.message || 'Request parameters failed validation constraints.',
      recoverySuggestion: 'Check that coordinates and duration are within valid operational bounds.',
      category: 'VALIDATION',
    };
  }

  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes('FORTYGUARD_NOT_CONFIGURED') || msg.includes('missing') && msg.includes('API_KEY')) {
    return {
      code: 'FORTYGUARD_NOT_CONFIGURED',
      message: 'FortyGuard credentials are not configured on this server.',
      recoverySuggestion: 'Add FORTYGUARD_API_KEY to .env.local to enable live API calls, or use DEMO mode.',
      category: 'PROVIDER',
    };
  }

  return {
    code: 'SYSTEM_ERROR',
    message: msg || 'An unexpected operational error occurred.',
    recoverySuggestion: 'Please verify server logs or retry the request.',
    category: 'PROVIDER',
  };
}
