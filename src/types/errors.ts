/**
 * Application & Domain Error Hierarchy
 */

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
