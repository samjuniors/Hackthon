/**
 * Client-safe constants mirroring server-side fixture metadata.
 *
 * The heavy fixture JSON lives server-side only (adapter + route); the client
 * needs just the display-facing facts. If the fixture capture changes, update
 * fixture-metadata.ts (server) AND this mirror (client display).
 */
import type { CandidateLocation } from '@/types/domain';

/**
 * Granularity the captured fixture was ACTUALLY recorded at. In DEMO mode the
 * UI displays THIS value — never a user-selected resolution the fixture does
 * not contain (Section 2).
 */
export const FIXTURE_DISPLAY_GRANULARITY = 60 as const;

/**
 * The three ACTUAL sites captured in the Manhattan fixture (Section 8).
 * Displayed read-only in DEMO mode. LIVE mode never uses these — LIVE
 * candidates come exclusively from the user.
 */
export const CAPTURED_DEMO_SITES: CandidateLocation[] = [
  {
    locationId: 'LOC-A',
    name: 'Battery Park Greenway (Waterfront)',
    location: { latitude: 40.7120, longitude: -74.0080 },
  },
  {
    locationId: 'LOC-B',
    name: 'City Hall Civic Center (Mid-Density)',
    location: { latitude: 40.7120, longitude: -73.9980 },
  },
  {
    locationId: 'LOC-C',
    name: 'Chinatown / Bowery Staging (Asphalt Canyon)',
    location: { latitude: 40.7120, longitude: -73.9880 },
  },
];
