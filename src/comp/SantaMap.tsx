import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface CityData {
  arrival_time_utc: string;
  coordinates: { lat: number; lng: number };
  msg?: string;
}
interface TimeZoneData { [city: string]: CityData; }
interface SantaData { [timeZone: string]: TimeZoneData; }

interface SantaMapProps {
  santaData: SantaData;
  bedtimeHourLocal?: number;      // 22 => 10pm
  bedtimeMinuteLocal?: number;    // 0
  onStatus?: (text: string) => void;
}

type Stop = {
  city: string;
  coords: { lat: number; lng: number };
  arrival: number; // ms UTC
  msg?: string;
};

const santaIcon = new L.Icon({
  iconUrl: '/santa-icon.svg',
  iconSize: [56, 56],
  iconAnchor: [28, 28],
  className: 'santa-icon'
});

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function interpolate(start: { lat: number; lng: number }, end: { lat: number; lng: number }, t: number) {
  const u = clamp01(t);
  return { lat: lerp(start.lat, end.lat, u), lng: lerp(start.lng, end.lng, u) };
}

function formatETA(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return 'now';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ss = s % 60;
  if (h > 0) return `${h}h ${mm}m`;
  if (m > 0) return `${m}m ${ss}s`;
  return `${ss}s`;
}

function prettyLocalTime(ms: number) {
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(ms));
}
function prettyTZ() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
}

function nextLocalBedtimeMs(bedHour: number, bedMin: number) {
  const d = new Date(); // local
  d.setHours(bedHour, bedMin, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function shiftTimelineToLocalBedtime(stops: Stop[], bedHour: number, bedMin: number): Stop[] {
  const sorted = [...stops].sort((a, b) => a.arrival - b.arrival);
  if (sorted.length === 0) return sorted;

  const first = sorted[0].arrival;
  const desired = nextLocalBedtimeMs(bedHour, bedMin);
  const delta = desired - first;

  return sorted.map(s => ({ ...s, arrival: s.arrival + delta }));
}

function estimateSantaPositionNow(timeline: Stop[]): { lat: number; lng: number } {
  if (timeline.length === 0) return { lat: 90, lng: 0 };

  const now = Date.now();

  if (now <= timeline[0].arrival) return timeline[0].coords;
  if (now >= timeline[timeline.length - 1].arrival) return timeline[timeline.length - 1].coords;

  let i = 0;
  while (i + 1 < timeline.length && now >= timeline[i + 1].arrival) i++;

  const cur = timeline[i];
  const nxt = timeline[i + 1];
  const span = nxt.arrival - cur.arrival;
  const t = span <= 0 ? 1 : (now - cur.arrival) / span;

  return interpolate(cur.coords, nxt.coords, t);
}

const SantaMap: React.FC<SantaMapProps> = ({
  santaData,
  bedtimeHourLocal = 22,
  bedtimeMinuteLocal = 0,
  onStatus
}) => {
  const [pos, setPos] = useState<[number, number]>([90, 0]);
  const [hudTitle, setHudTitle] = useState('Preparing sleigh…');
  const [hudSub, setHudSub] = useState('Loading route');

  const mapRef = useRef<LeafletMap | null>(null);
  const rafRef = useRef<number | null>(null);
  const idxRef = useRef(0);
  const lastAnnouncedRef = useRef<string>('');
  const initialCenteredRef = useRef(false);

  const timeline = useMemo<Stop[]>(() => {
    const out: Stop[] = [];

    for (const zone of Object.keys(santaData)) {
      for (const city of Object.keys(santaData[zone])) {
        const { coordinates, arrival_time_utc, msg } = santaData[zone][city];
        const arrival = new Date(arrival_time_utc).getTime();
        if (!Number.isFinite(arrival)) continue;
        out.push({ city, coords: coordinates, arrival, msg });
      }
    }

    return shiftTimelineToLocalBedtime(out, bedtimeHourLocal, bedtimeMinuteLocal);
  }, [santaData, bedtimeHourLocal, bedtimeMinuteLocal]);

  const routeLine = useMemo<[number, number][]>(() => timeline.map(s => [s.coords.lat, s.coords.lng]), [timeline]);

  // initial marker position (so first view is “near Santa”)
  useEffect(() => {
    if (timeline.length === 0) return;
    const p = estimateSantaPositionNow(timeline);
    setPos([p.lat, p.lng]);
  }, [timeline]);

  // center map once on load (no constant auto-follow)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (initialCenteredRef.current) return;

    map.setView(pos, 4, { animate: false });
    initialCenteredRef.current = true;
  }, [pos]);

  // animation loop
  useEffect(() => {
    if (timeline.length === 0) return;

    idxRef.current = 0;
    lastAnnouncedRef.current = '';

    const tz = prettyTZ();
    const startLocal = prettyLocalTime(timeline[0].arrival);

    const tick = () => {
      const now = Date.now();

      if (now < timeline[0].arrival) {
        const first = timeline[0].coords;
        setPos([first.lat, first.lng]);
        setHudTitle('Waiting to launch…');
        setHudSub(`Starts at ${startLocal} (${tz}) • in ${formatETA(timeline[0].arrival - now)}`);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      let i = idxRef.current;
      while (i + 1 < timeline.length && now >= timeline[i + 1].arrival) i++;
      idxRef.current = i;

      const cur = timeline[i];
      const nxt = timeline[Math.min(i + 1, timeline.length - 1)];

      if (i === timeline.length - 1) {
        setPos([cur.coords.lat, cur.coords.lng]);
        setHudTitle(cur.city);
        setHudSub(cur.msg ?? 'Final stop reached');

        if (lastAnnouncedRef.current !== cur.city) {
          lastAnnouncedRef.current = cur.city;
          onStatus?.(cur.msg ?? `Santa is now at ${cur.city}`);
        }

        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const span = nxt.arrival - cur.arrival;
      const t = span <= 0 ? 1 : (now - cur.arrival) / span;
      const p = interpolate(cur.coords, nxt.coords, t);

      setPos([p.lat, p.lng]);

      const eta = nxt.arrival - now;
      setHudTitle('En route');
      setHudSub(`Next: ${nxt.city} • ETA ${formatETA(eta)} • ${prettyLocalTime(nxt.arrival)} (${tz})`);

      if (t >= 0.999 && lastAnnouncedRef.current !== nxt.city) {
        lastAnnouncedRef.current = nxt.city;
        onStatus?.(nxt.msg ?? `Santa arrived at ${nxt.city}`);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [timeline, onStatus]);

  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo(pos, Math.max(map.getZoom(), 4), { duration: 0.8 });
  };

  return (
    <div className="map-shell">
      <div className="map-hud">
        <div className="map-hud-title">{hudTitle}</div>
        <div className="map-hud-sub">{hudSub}</div>
      </div>

      <button className="recenter-btn" onClick={recenter} type="button" aria-label="Re-center on Santa">
        ⟳ Re-center
      </button>

      <MapContainer
        ref={mapRef as unknown as React.Ref<LeafletMap>}
        center={pos}
        zoom={4}
        minZoom={2}
        worldCopyJump
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors &copy; CARTO"
        />

        {routeLine.length > 1 && (
          <Polyline
            positions={routeLine}
            pathOptions={{ weight: 2, opacity: 0.45, dashArray: '6 10' }}
            className="route-line"
          />
        )}

        <Marker position={pos} icon={santaIcon} />
      </MapContainer>
    </div>
  );
};

export default SantaMap;
