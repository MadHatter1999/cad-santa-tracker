export type ZoneKey =
  | 'Newfoundland Time Zone'
  | 'Atlantic Time Zone'
  | 'Eastern Time Zone'
  | 'Central Time Zone'
  | 'Mountain Time Zone'
  | 'Pacific Time Zone'
  | 'Custom Time Zone';

export const ZONE_ORDER: ZoneKey[] = [
  'Newfoundland Time Zone',
  'Atlantic Time Zone',
  'Eastern Time Zone',
  'Central Time Zone',
  'Mountain Time Zone',
  'Pacific Time Zone',
  'Custom Time Zone'
];

export interface CityData {
  arrival_time_utc: string;
  coordinates: { lat: number; lng: number };
  msg?: string;
}
export interface TimeZoneData {
  [city: string]: CityData;
}
export interface SantaData {
  [timeZone: string]: TimeZoneData;
}

export type Stop = {
  zoneKey: ZoneKey;
  city: string;
  coords: { lat: number; lng: number };
  arrival: number; // ms UTC
  msg?: string;
};

export type UserStop = {
  id: string;
  zoneKey: ZoneKey;
  city: string;
  coordinates: { lat: number; lng: number };
  arrival_time_utc: string; // ISO string
  msg?: string;
  createdAt: number;
};

export function parseArrivalMs(s: string): number {
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : NaN;
}

export function flattenSantaData(data: SantaData): Stop[] {
  const out: Stop[] = [];
  for (const zoneRaw of Object.keys(data)) {
    const zoneKey = (zoneRaw as ZoneKey) ?? 'Custom Time Zone';
    for (const city of Object.keys(data[zoneRaw])) {
      const { coordinates, arrival_time_utc, msg } = data[zoneRaw][city];
      const arrival = parseArrivalMs(arrival_time_utc);
      if (!Number.isFinite(arrival)) continue;
      out.push({ zoneKey, city, coords: coordinates, arrival, msg });
    }
  }
  out.sort((a, b) => a.arrival - b.arrival);
  return out;
}

export function userStopsToStops(userStops: UserStop[]): Stop[] {
  const out: Stop[] = [];
  for (const s of userStops) {
    const arrival = parseArrivalMs(s.arrival_time_utc);
    if (!Number.isFinite(arrival)) continue;
    out.push({
      zoneKey: s.zoneKey,
      city: s.city,
      coords: s.coordinates,
      arrival,
      msg: s.msg
    });
  }
  out.sort((a, b) => a.arrival - b.arrival);
  return out;
}

/** Next bedtime in the viewer's LOCAL time, returned as UTC ms. */
export function nextLocalBedtimeMs(bedHour: number, bedMin: number): number {
  const d = new Date(); // local
  d.setHours(bedHour, bedMin, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Shift whole schedule so the earliest stop happens at next local bedtime. */
export function shiftToLocalBedtime(stops: Stop[], bedHour: number, bedMin: number): Stop[] {
  if (stops.length === 0) return [];
  const sorted = [...stops].sort((a, b) => a.arrival - b.arrival);
  const first = sorted[0].arrival;
  const desired = nextLocalBedtimeMs(bedHour, bedMin);
  const delta = desired - first;
  return sorted.map(s => ({ ...s, arrival: s.arrival + delta }));
}

/** Determine which of your zone keys matches the viewer's current UTC offset. */
export function zoneKeyFromBrowserOffset(): ZoneKey {
  // getTimezoneOffset(): minutes you add to LOCAL to get UTC
  // Newfoundland Standard Time in winter ~ 210, Atlantic ~ 240, Eastern ~ 300, etc.
  const off = new Date().getTimezoneOffset();

  const candidates: Array<{ off: number; key: ZoneKey }> = [
    { off: 210, key: 'Newfoundland Time Zone' },
    { off: 240, key: 'Atlantic Time Zone' },
    { off: 300, key: 'Eastern Time Zone' },
    { off: 360, key: 'Central Time Zone' },
    { off: 420, key: 'Mountain Time Zone' },
    { off: 480, key: 'Pacific Time Zone' }
  ];

  // choose closest offset (handles odd cases)
  let best = candidates[0];
  let bestDist = Math.abs(off - best.off);
  for (const c of candidates) {
    const d = Math.abs(off - c.off);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best.key;
}

export function maxArrivalForZone(stops: Stop[], zoneKey: ZoneKey): number | null {
  let max: number | null = null;
  for (const s of stops) {
    if (s.zoneKey !== zoneKey) continue;
    if (max === null || s.arrival > max) max = s.arrival;
  }
  return max;
}

/** Base-time (unshifted) max arrival for a zone, from Stops. */
export function maxBaseArrivalForZone(stops: Stop[], zoneKey: ZoneKey): number | null {
  return maxArrivalForZone(stops, zoneKey);
}

/** Create a base (unshifted) arrival time for a new stop in the zone. */
export function computeNewStopBaseArrival(allBaseStops: Stop[], zoneKey: ZoneKey): number {
  const zoneMax = maxBaseArrivalForZone(allBaseStops, zoneKey);

  // Find next zone's minimum arrival to avoid overlapping too badly
  const zoneIdx = ZONE_ORDER.indexOf(zoneKey);
  const nextZone = zoneIdx >= 0 ? ZONE_ORDER[zoneIdx + 1] : null;

  const nextMin =
    nextZone
      ? (() => {
          let min: number | null = null;
          for (const s of allBaseStops) {
            if (s.zoneKey !== nextZone) continue;
            if (min === null || s.arrival < min) min = s.arrival;
          }
          return min;
        })()
      : null;

  // Default increment: 2 minutes after last in-zone
  const baseCandidate = (zoneMax ?? allBaseStops[0]?.arrival ?? Date.now()) + 2 * 60 * 1000;

  if (nextMin === null) return baseCandidate;

  // Try to fit before the next zone starts (leave 60s safety)
  const latestAllowed = nextMin - 60 * 1000;
  if (baseCandidate <= latestAllowed) return baseCandidate;

  // If there's no room, still return something strictly after zoneMax (won't crash; interpolation handles equal times)
  return (zoneMax ?? baseCandidate) + 60 * 1000;
}
