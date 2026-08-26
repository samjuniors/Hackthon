import type { DataSourceMode } from './provenance';

export type ProviderStatus = 'UNKNOWN' | 'CHECKING' | 'CONNECTED' | 'ERROR';

/**
 * AI explanation providers in the fallback chain.
 * Order: Gemini → Claude → Z.ai → deterministic fallback.
 * NONE is reserved for the deterministic explainer (no AI provider used).
 */
export type AIProviderName = 'GEMINI' | 'CLAUDE' | 'ZAI' | 'NONE';

/**
 * The user/system preferred provider preference (persisted client-side, sent
 * to the explain endpoint). 'auto' = respect the natural chain order.
 */
export type PreferredAIProvider = 'auto' | 'gemini' | 'claude' | 'zai';

export interface FortyGuardHealthResponse {
  configured: boolean;
  connected: boolean;
  mode: DataSourceMode;
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
  checkedAt: string;
}

/**
 * Status of a single provider in the fallback chain (used by the health
 * endpoint to report which providers are configured + reachable).
 */
export interface ProviderChainEntry {
  provider: AIProviderName;
  configured: boolean;
  connected: boolean | null; // null = not tested (e.g. not configured)
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface AIHealthResponse {
  configured: boolean;
  provider: AIProviderName; // active provider (first configured + connected in chain)
  connected: boolean;
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
  checkedAt: string;
  /** Ordered status of every provider in the chain. */
  providerChain?: ProviderChainEntry[];
  /** The user/system preferred provider (affects chain ordering). */
  preferredProvider?: PreferredAIProvider;
}

export interface NamedLocation {
  id: string;
  name: string;
  displayName: string;
  category: 'Metropolitan Area' | 'Demo Site' | 'Custom Location' | 'GPS Location';
  latitude: number;
  longitude: number;
  city?: string;
  state?: string;
  country?: string;
  zipCode?: string;
  timezone?: string;
  isDemoOnly?: boolean;
  description?: string;
  /**
   * Result type from real geocoding — drives camera behavior:
   * state → fit region; city/neighborhood → fit local; street/address/poi → zoom to point.
   */
  resultType?: 'state' | 'city' | 'neighborhood' | 'street' | 'address' | 'poi' | 'zip' | 'region';
}

export interface ProductionErrorDetails {
  code: string;
  message: string;
  recoverySuggestion: string;
  category: 'PROVIDER' | 'DATA' | 'VALIDATION' | 'AI' | 'COVERAGE';
}
