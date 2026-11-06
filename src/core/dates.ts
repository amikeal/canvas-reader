// Canvas CC exports write datetimes as UTC without a zone suffix
// (e.g. course start_at "2026-08-24T05:00:00" == midnight US Central).
// Assignments carry <time_zone_edited> with a Rails zone name; we use that to
// render in the instructor's zone rather than the viewer's.

const RAILS_ZONES: Record<string, string> = {
  'Eastern Time (US & Canada)': 'America/New_York',
  'Central Time (US & Canada)': 'America/Chicago',
  'Mountain Time (US & Canada)': 'America/Denver',
  'Pacific Time (US & Canada)': 'America/Los_Angeles',
  Arizona: 'America/Phoenix',
  Alaska: 'America/Juneau',
  Hawaii: 'Pacific/Honolulu',
  'Atlantic Time (Canada)': 'America/Halifax',
  Newfoundland: 'America/St_Johns',
  'Indiana (East)': 'America/Indiana/Indianapolis',
  'Puerto Rico': 'America/Puerto_Rico',
  'Mexico City': 'America/Mexico_City',
  London: 'Europe/London',
  Dublin: 'Europe/Dublin',
  Amsterdam: 'Europe/Amsterdam',
  Berlin: 'Europe/Berlin',
  Paris: 'Europe/Paris',
  Madrid: 'Europe/Madrid',
  Sydney: 'Australia/Sydney',
  Melbourne: 'Australia/Melbourne',
  Auckland: 'Pacific/Auckland',
  Tokyo: 'Asia/Tokyo',
  Singapore: 'Asia/Singapore',
  UTC: 'UTC',
};

export function ianaZone(name: string | undefined): string | undefined {
  if (!name) return undefined;
  if (RAILS_ZONES[name]) return RAILS_ZONES[name];
  if (name.includes('/')) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: name });
      return name;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Parse a Canvas export timestamp (UTC, suffix optional). */
export function parseCanvasDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function formatDate(s: string | undefined, timeZone: string, opts: { dateOnly?: boolean } = {}): string {
  const d = parseCanvasDate(s);
  if (!d) return '';
  const base: Intl.DateTimeFormatOptions = { timeZone, month: 'short', day: 'numeric', year: 'numeric' };
  if (opts.dateOnly) return new Intl.DateTimeFormat('en-US', base).format(d);
  return new Intl.DateTimeFormat('en-US', {
    ...base,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(d);
}

/** ISO string for <time datetime>. */
export function isoDate(s: string | undefined): string {
  return parseCanvasDate(s)?.toISOString() ?? '';
}
