import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SantaMap from './comp/SantaMap';
import santaData from './santaData.json';
import './css/App.css';

type ToastKind = 'info' | 'success' | 'warning';
type Toast = { id: number; text: string; kind: ToastKind };

const MAX_TOASTS = 3;

type ZoneKey =
  | 'Newfoundland Time Zone'
  | 'Atlantic Time Zone'
  | 'Eastern Time Zone'
  | 'Central Time Zone'
  | 'Mountain Time Zone'
  | 'Pacific Time Zone';

type UserStop = {
  id: string;
  zoneKey: ZoneKey;
  city: string;
  coordinates: { lat: number; lng: number };
  msg?: string;
  arrival_time_utc: string; // ISO
  createdAt: number;
};

const LS_KEY = 'santa_userStops_v2'; // bump key to avoid old broken shape repeatedly loading

function normalizeUserStop(raw: any): UserStop | null {
  if (!raw || typeof raw !== 'object') return null;

  const zoneKey = raw.zoneKey as ZoneKey;
  const city = typeof raw.city === 'string' ? raw.city : '';
  const msg = typeof raw.msg === 'string' ? raw.msg : undefined;

  // Support BOTH shapes:
  // 1) new: coordinates {lat,lng}
  // 2) old: lat,lng at top-level
  let lat: number | null = null;
  let lng: number | null = null;

  if (raw.coordinates && typeof raw.coordinates === 'object') {
    const la = Number(raw.coordinates.lat);
    const ln = Number(raw.coordinates.lng);
    if (Number.isFinite(la) && Number.isFinite(ln)) {
      lat = la;
      lng = ln;
    }
  } else {
    const la = Number(raw.lat);
    const ln = Number(raw.lng);
    if (Number.isFinite(la) && Number.isFinite(ln)) {
      lat = la;
      lng = ln;
    }
  }

  const arrival = typeof raw.arrival_time_utc === 'string' ? raw.arrival_time_utc : '';
  const createdAt = Number(raw.createdAt);

  if (!city.trim()) return null;
  if (!arrival) return null;
  if (lat === null || lng === null) return null;
  if (!Number.isFinite(createdAt)) return null;

  // basic bounds
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return {
    id: typeof raw.id === 'string' ? raw.id : `${Date.now()}_${Math.floor(Math.random() * 100000)}`,
    zoneKey,
    city: city.trim(),
    coordinates: { lat, lng },
    msg,
    arrival_time_utc: arrival,
    createdAt
  };
}

function loadUserStops(): UserStop[] {
  // Try new key first
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeUserStop).filter(Boolean) as UserStop[];
      }
    }
  } catch {
    // ignore
  }

  // Try old key (v1) and migrate it
  try {
    const oldRaw = localStorage.getItem('santa_userStops_v1');
    if (!oldRaw) return [];
    const parsed = JSON.parse(oldRaw);
    if (!Array.isArray(parsed)) return [];
    const migrated = parsed.map(normalizeUserStop).filter(Boolean) as UserStop[];
    localStorage.setItem(LS_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return [];
  }
}

function saveUserStops(stops: UserStop[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(stops));
}

function zoneKeyFromBrowserOffset(): ZoneKey {
  const off = new Date().getTimezoneOffset();
  const candidates: Array<{ off: number; key: ZoneKey }> = [
    { off: 210, key: 'Newfoundland Time Zone' },
    { off: 240, key: 'Atlantic Time Zone' },
    { off: 300, key: 'Eastern Time Zone' },
    { off: 360, key: 'Central Time Zone' },
    { off: 420, key: 'Mountain Time Zone' },
    { off: 480, key: 'Pacific Time Zone' }
  ];

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

function nextLocalBedtimeMs(hour: number, minute: number): number {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

type FlatStop = { zoneKey: ZoneKey; arrivalBaseMs: number };

function flattenBaseStops(data: any): FlatStop[] {
  const out: FlatStop[] = [];
  for (const zone of Object.keys(data)) {
    const zoneKey = zone as ZoneKey;
    const zoneObj = data[zone] || {};
    for (const city of Object.keys(zoneObj)) {
      const t = new Date(zoneObj[city]?.arrival_time_utc).getTime();
      if (!Number.isFinite(t)) continue;
      out.push({ zoneKey, arrivalBaseMs: t });
    }
  }
  out.sort((a, b) => a.arrivalBaseMs - b.arrivalBaseMs);
  return out;
}

function shiftDeltaFromBedtime(baseStops: FlatStop[], bedHour: number, bedMin: number): number {
  if (baseStops.length === 0) return 0;
  const first = baseStops[0].arrivalBaseMs;
  const desired = nextLocalBedtimeMs(bedHour, bedMin);
  return desired - first;
}

function maxShiftedArrivalForZone(baseStops: FlatStop[], zoneKey: ZoneKey, delta: number): number | null {
  let max: number | null = null;
  for (const s of baseStops) {
    if (s.zoneKey !== zoneKey) continue;
    const shifted = s.arrivalBaseMs + delta;
    if (max === null || shifted > max) max = shifted;
  }
  return max;
}

function computeNewStopBaseArrival(baseStops: FlatStop[], zoneKey: ZoneKey): number {
  let maxInZone: number | null = null;
  for (const s of baseStops) {
    if (s.zoneKey !== zoneKey) continue;
    if (maxInZone === null || s.arrivalBaseMs > maxInZone) maxInZone = s.arrivalBaseMs;
  }
  const base = maxInZone ?? (baseStops[0]?.arrivalBaseMs ?? Date.now());
  return base + 2 * 60 * 1000;
}

function uniqueCityKey(existing: Record<string, any>, desired: string): string {
  const base = desired.trim();
  if (!existing[base]) return base;
  let i = 2;
  while (existing[`${base} (${i})`]) i++;
  return `${base} (${i})`;
}

const App: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const intervalRef = useRef<number | null>(null);

  const [userStops, setUserStops] = useState<UserStop[]>(() => loadUserStops());

  // modal UI
  const [modalOpen, setModalOpen] = useState(false);
  const [city, setCity] = useState('');
  const [latInput, setLatInput] = useState('');
  const [lngInput, setLngInput] = useState('');
  const [msg, setMsg] = useState('');
  const [locating, setLocating] = useState(false);

  const bedtimeHourLocal = 22;
  const bedtimeMinuteLocal = 0;

  const pushToast = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);

    setToasts(prev => {
      const next = [...prev, { id, text, kind }];
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
    });

    window.setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4200);
  }, []);

  useEffect(() => {
    saveUserStops(userStops);
  }, [userStops]);

  const msgs = useMemo(
    () => [
      "Merry Christmas!",
      "Sleigh signal: strong",
      "Nice list verified",
      "Tracking Santa live",

      "Early Christians did not universally celebrate Jesus’ birth from the very beginning.",
      "December 25 became a widely used Christmas date in the Roman Empire by the 4th century.",
      "Some early Christian communities celebrated Jesus’ birth on other dates, including January 6.",
      "January 6 remains a major feast day (Epiphany/Theophany) in several Christian traditions.",
      "The phrase “Christ Mass” refers to a church service (Mass) celebrating Christ.",
      "The Twelve Days of Christmas are traditionally counted from December 25 to January 5.",
      "In the Middle Ages, Christmas was often celebrated with feasting, music, and community events.",
      "Medieval European celebrations sometimes included “Lord of Misrule” style festival roles.",
      "Caroling has roots in older wintertime house-to-house singing and greeting customs.",
      "Wreaths and greenery echo long-standing winter decoration practices using evergreens.",
      "Evergreens were used in winter celebrations long before modern Christmas.",
      "Holly and ivy were common winter decorations in parts of Europe for centuries.",

      "St. Nicholas was a 4th-century bishop associated with gift-giving legends.",
      "St. Nicholas traditions influenced later Santa Claus traditions in parts of Europe.",
      "The Dutch name “Sinterklaas” helped shape the later English “Santa Claus.”",
      "Some Santa traditions also draw from broader European winter folklore figures.",
      "Reindeer and sleigh imagery became popular through 19th-century poems and stories.",
      "The North Pole became a common Santa home in popular culture in the 1800s.",
      "Rudolph the Red-Nosed Reindeer was created in 1939 for a department-store story.",
      "Santa’s red suit became strongly standardized through 20th-century advertising.",

      "The first commercial Christmas cards are often dated to 1843 in England.",
      "Christmas crackers became popular in Victorian-era Britain.",
      "Tinsel was once made from real silver before modern synthetic versions.",
      "Early electric Christmas lights appeared in the late 1800s.",

      "Christmas trees became especially popular in Germany before spreading elsewhere.",
      "Christmas trees spread widely in Britain and North America during the 1800s.",
      "Prince Albert is often credited with helping popularize the Christmas tree in Victorian Britain.",
      "Ornaments and candles on trees were common before electric lights existed.",
      "Gingerbread houses grew in popularity in Europe in the 1800s.",
      "The poinsettia became a popular Christmas plant in the 1800s.",

      "“Silent Night” was first performed in 1818 in Austria.",
      "“Jingle Bells” was originally written for Thanksgiving, not Christmas.",
      "Many familiar Christmas carols were published or popularized in the 1800s.",
      "The word “Noel” is linked to older French terms for “birth” or “news.”",
      "The term “Yule” comes from older Germanic winter festival language and traditions.",
      "“Xmas” comes from the Greek letter Chi (X), used as an abbreviation for “Christ.”",

      "In some countries, gifts are traditionally opened on Christmas Eve.",
      "In parts of Spain and Latin America, gifts may arrive on Epiphany (January 6).",
      "Boxing Day is December 26 and is a holiday in several countries.",
      "Christmas markets have a long history in parts of Europe.",
      "Advent calendars are used to count down the days to Christmas.",
      "Advent itself is a season of preparation leading up to Christmas.",

      "The Nativity story is told in the Gospels of Matthew and Luke.",
      "Nativity scenes became widely popular in Europe over time, especially from the medieval period onward.",
      "Many modern traditions blend religious observances with seasonal winter customs.",
      "Mistletoe traditions connect to older European winter folklore.",
      "Winter feasts in the Roman world, like Saturnalia, are sometimes discussed as part of the broader cultural background.",
      "Some regions historically restricted Christmas celebrations at various times, then later revived public festivities.",

      "In the early modern period, Christmas celebrations varied a lot by region and church practice.",
      "In colonial North America, Christmas was celebrated differently depending on local customs and denominations.",
      "By the 19th century, family-focused Christmas celebrations became more common in many places.",
      "Modern Christmas imagery was shaped heavily by 19th-century literature, illustrations, and popular press.",
      "Many “classic” Christmas traditions are newer than they seem and grew rapidly in the 1800s.",
      "Christmas is celebrated worldwide, but traditions and dates can differ by culture and church calendar."
    ],
    []
  );

  useEffect(() => {
    if (intervalRef.current !== null) return;

    intervalRef.current = window.setInterval(() => {
      pushToast(msgs[Math.floor(Math.random() * msgs.length)], 'success');
    }, 9000) as unknown as number;

    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [pushToast, msgs]);

  const viewerZoneKey = useMemo<ZoneKey>(() => {
    const guess = zoneKeyFromBrowserOffset();
    const keys = Object.keys(santaData as any);
    return keys.includes(guess) ? guess : 'Eastern Time Zone';
  }, []);

  const mergedSantaData = useMemo(() => {
    const copy: any = JSON.parse(JSON.stringify(santaData));

    for (const s of userStops) {
      if (!copy[s.zoneKey]) copy[s.zoneKey] = {};
      const zoneObj: Record<string, any> = copy[s.zoneKey];

      const cityKey = uniqueCityKey(zoneObj, s.city);
      zoneObj[cityKey] = {
        arrival_time_utc: s.arrival_time_utc,
        coordinates: { lat: s.coordinates.lat, lng: s.coordinates.lng },
        ...(s.msg ? { msg: s.msg } : {})
      };
    }

    return copy;
  }, [userStops]);

  const santaPassedViewerZone = useMemo(() => {
    const baseStops = flattenBaseStops(mergedSantaData);
    const delta = shiftDeltaFromBedtime(baseStops, bedtimeHourLocal, bedtimeMinuteLocal);
    const maxShifted = maxShiftedArrivalForZone(baseStops, viewerZoneKey, delta);
    if (maxShifted === null) return false;
    return Date.now() >= maxShifted;
  }, [mergedSantaData, viewerZoneKey]);

  const closeModal = () => {
    setModalOpen(false);
    setCity('');
    setLatInput('');
    setLngInput('');
    setMsg('');
    setLocating(false);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      pushToast('Geolocation is not supported in this browser.', 'warning');
      return;
    }

    // NOTE: geolocation works on localhost, and works on HTTPS.
    // It usually does NOT work on http://LAN-IP:3000 on a phone.
    if (!window.isSecureContext) {
      pushToast('Location requires HTTPS (or localhost). For phone demos, use an HTTPS tunnel (ngrok).', 'warning');
      return;
    }

    setLocating(true);
    pushToast('Requesting your location…', 'info');

    navigator.geolocation.getCurrentPosition(
      (p) => {
        const { latitude, longitude } = p.coords;
        setLatInput(latitude.toFixed(6));
        setLngInput(longitude.toFixed(6));
        setCity(prev => (prev.trim().length ? prev : 'My Location'));
        setLocating(false);
        pushToast('Location filled in.', 'success');
      },
      (err) => {
        setLocating(false);
        console.error('Geolocation error:', err);
        pushToast(err?.message ? `Location failed: ${err.message}` : 'Could not get location.', 'warning');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const submitNewStop = () => {
    const name = city.trim();
    if (name.length < 2) {
      pushToast('Please enter a location name.', 'warning');
      return;
    }

    const latNum = Number(latInput);
    const lngNum = Number(lngInput);

    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      pushToast('Latitude/longitude must be numbers (use Current location).', 'warning');
      return;
    }
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      pushToast('Latitude must be -90..90 and longitude -180..180.', 'warning');
      return;
    }

    if (santaPassedViewerZone) {
      pushToast('Sorry, Santa has passed already, but Merry Christmas.', 'warning');
      return;
    }

    const baseStops = flattenBaseStops(mergedSantaData);
    const baseArrival = computeNewStopBaseArrival(baseStops, viewerZoneKey);

    const newStop: UserStop = {
      id: `${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      zoneKey: viewerZoneKey,
      city: name,
      coordinates: { lat: latNum, lng: lngNum },
      msg: msg.trim() ? msg.trim() : undefined,
      arrival_time_utc: new Date(baseArrival).toISOString(),
      createdAt: Date.now()
    };

    setUserStops(prev => [...prev, newStop]);
    pushToast('Added your location to the route.', 'success');
    closeModal();
  };

  const year = new Date().getFullYear();

  // keep compatibility no matter what SantaMap props are
  const SantaMapAny = SantaMap as unknown as React.FC<any>;

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-left">
          <span className="brand-dot" aria-hidden="true" />
          <div className="brand-text">
            <h1>Santa Tracker</h1>
            <p>Live sleigh telemetry • your timezone ({viewerZoneKey})</p>
          </div>
        </div>

        <div className="header-right">
          <button className="btn btn-ghost" onClick={() => setModalOpen(true)} type="button">
            Add location
          </button>
          <span className="pill pill-live">Live</span>
        </div>
      </header>

      <main className="main-content">
        <div className="toast-stack" aria-live="polite">
          {toasts.map(t => (
            <div key={t.id} className={`toast toast--${t.kind}`} role="status">
              <span className="toast-dot" aria-hidden="true" />
              <span className="toast-text">{t.text}</span>
              <button
                className="toast-x"
                aria-label="Dismiss"
                onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <SantaMapAny
          santaData={mergedSantaData}
          userStops={userStops}
          bedtimeHourLocal={bedtimeHourLocal}
          bedtimeMinuteLocal={bedtimeMinuteLocal}
          onStatus={(text: string) => pushToast(text, 'info')}
        />

        {modalOpen && (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal">
              <div className="modal-head">
                <div>
                  <div className="modal-title">Add a location</div>
                  <div className="modal-sub">
                    Your zone: <strong>{viewerZoneKey}</strong>.{' '}
                    {santaPassedViewerZone ? 'Santa already passed your zone.' : 'Santa has not passed yet.'}
                  </div>
                </div>
                <button className="modal-x" onClick={closeModal} aria-label="Close" type="button">
                  ×
                </button>
              </div>

              <div className="modal-body">
                <label className="field">
                  <span>Location name</span>
                  <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g., My House" />
                </label>

                <div className="row">
                  <label className="field">
                    <span>Latitude</span>
                    <input value={latInput} onChange={(e) => setLatInput(e.target.value)} placeholder="e.g., 44.650000" />
                  </label>
                  <label className="field">
                    <span>Longitude</span>
                    <input value={lngInput} onChange={(e) => setLngInput(e.target.value)} placeholder="e.g., -63.570000" />
                  </label>
                </div>

                <label className="field">
                  <span>Message (optional)</span>
                  <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Merry Christmas ..." />
                </label>

                <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
                  <button className="btn btn-ghost" onClick={useCurrentLocation} type="button" disabled={locating}>
                    {locating ? 'Getting location…' : 'Use current location'}
                  </button>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn" onClick={submitNewStop} type="button">Add</button>
                    <button className="btn btn-ghost" onClick={closeModal} type="button">Cancel</button>
                  </div>
                </div>

                <div className="modal-sub">
                  Location works on localhost and HTTPS. For phone demos on Wi-Fi using http://PC-IP:3000, use an HTTPS tunnel.
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="footer">Tony’s Santa Tracker © {year}</footer>
    </div>
  );
};

export default App;
