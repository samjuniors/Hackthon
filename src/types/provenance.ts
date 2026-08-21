/**
 * Data Lineage and Provenance Classification
 */
export type DataProvenance =
  | 'OBSERVED'                  // Direct raw API payload readings (e.g. point telemetry)
  | 'DERIVED'                   // Aggregated or computed metrics (e.g. tile average_temperature)
  | 'PREDICTED'                 // Verified FortyGuard forecast intervals
  | 'ASSUMED'                   // User-specified scenario parameters (duration, bounds)
  | 'AI_GENERATED_EXPLANATION'; // Grounded LLM narrative outputs

export type DataSourceMode = 'LIVE' | 'FIXTURE';

