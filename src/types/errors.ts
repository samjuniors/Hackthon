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
