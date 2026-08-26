import { type LocationPoint, type PolygonAOI, type NormalizedThermalObservation } from './domain';

export interface FortyGuardHeatmapRequest {
  polygon_aoi: PolygonAOI;
  date_time: {
    start_date: string; // YYYY-MM-DD
    start_time?: string; // HH:MM
    end_time?: string; // HH:MM
    end_date?: string; // YYYY-MM-DD
    filter_type: 1 | 2 | 3 | 4;
  };
  granularity: 60 | 80 | 100;
  analytic_type?: 'tcm' | 'time_of_measure' | 'exceedance' | 'persistence';
  threshold?: number;
  direction?: 'above' | 'below';
}

export interface FortyGuardEnvParamsRequest {
  latitude: number;
  longitude: number;
  temperature: number; // Required by API contract
  date_time: {
    start_date: string;
    start_time?: string;
    end_time?: string;
    end_date?: string;
    filter_type: 1 | 2 | 3;
  };
  analysis?: string[];
}

export interface FortyGuardStatusResponse {
  error: boolean;
  status_code: number;
  message: string;
  data: {
    activity_id: string;
    status: 'Processing' | 'Completed' | 'Failed';
    result?: Record<string, unknown>;
  };
}

export interface FortyGuardClient {
  getHeatmap(request: FortyGuardHeatmapRequest): Promise<{ activityId: string }>;
  getEnvironment(request: FortyGuardEnvParamsRequest): Promise<{ activityId: string }>;
  getStatus(activityId: string): Promise<FortyGuardStatusResponse>;
  normalizeTelemetry(response: FortyGuardStatusResponse, location: LocationPoint): NormalizedThermalObservation[];
}
