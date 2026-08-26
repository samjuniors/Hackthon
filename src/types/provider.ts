import type { DataSourceMode } from './provenance';

export type ProviderStatus = 'UNKNOWN' | 'CHECKING' | 'CONNECTED' | 'ERROR';

export type AIProviderName = 'GEMINI' | 'OPENAI' | 'NONE';

export interface FortyGuardHealthResponse {
  configured: boolean;
  connected: boolean;
  mode: DataSourceMode;
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
  checkedAt: string;
}

export interface AIHealthResponse {
  configured: boolean;
  provider: AIProviderName;
  connected: boolean;
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
  checkedAt: string;
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
}

export interface ProductionErrorDetails {
  code: string;
  message: string;
  recoverySuggestion: string;
  category: 'PROVIDER' | 'DATA' | 'VALIDATION' | 'AI';
}
