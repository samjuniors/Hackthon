/**
 * Dashboard formatting helpers — Thermal Decision Engine.
 *
 * Pure presentation utilities shared by the dashboard sub-components so that
 * page.tsx does not need to pass pre-formatted strings everywhere.
 */

/** Format an ISO start/end time window as "HH:MM – HH:MM TZ" in the given timezone. */
export function fmtTimeWindow(start: string, end: string, tz?: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: tz || 'UTC',
    });
  const endFmt = new Date(end).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz || 'UTC',
    timeZoneName: 'short',
  });
  return `${fmt(start)} – ${endFmt}`;
}

/** Replace any ISO-8601 UTC timestamps embedded in explainer text with friendly times. */
export function formatIsoTimesInText(text: string, tz?: string): string {
  if (!text) return text;
  const isoRegex = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g;
  return text.replace(isoRegex, (match) => {
    try {
      return new Date(match).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: tz || 'UTC',
        timeZoneName: 'short',
      });
    } catch {
      return match;
    }
  });
}

/** Shorten a location name by stripping parenthetical suffixes, e.g. "Battery Park (Waterfront)" → "Battery Park". */
export function shortLocationName(name: string): string {
  return name.split(' (')[0];
}
