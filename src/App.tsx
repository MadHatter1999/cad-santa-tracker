import React, { useCallback, useEffect, useRef, useState } from 'react';
import SantaMap from './comp/SantaMap';
import santaData from './santaData.json';
import './css/App.css';

type ToastKind = 'info' | 'success' | 'warning';
type Toast = { id: number; text: string; kind: ToastKind };

const MAX_TOASTS = 3;

const App: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const intervalRef = useRef<number | null>(null);

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

  // One interval, forever. (Your old code created a new interval every render.)
  useEffect(() => {
    if (intervalRef.current !== null) return;

    intervalRef.current = window.setInterval(() => {
      const msgs = [
        'Merry Christmas! 🎄',
        'Sleigh signal: strong ✨',
        'Nice list verified ✅',
        'Tracking Santa live 🎅',
      ];
      pushToast(msgs[Math.floor(Math.random() * msgs.length)], 'success');
    }, 9000) as unknown as number;

    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [pushToast]);

  const year = new Date().getFullYear();

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-left">
          <span className="brand-dot" aria-hidden="true" />
          <div className="brand-text">
            <h1>Santa Tracker</h1>
            <p>Live sleigh telemetry • your timezone</p>
          </div>
        </div>

        <div className="header-right">
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

        <SantaMap
          santaData={santaData as any}
          bedtimeHourLocal={22}      // 👈 change bedtime here (22 = 10pm)
          bedtimeMinuteLocal={0}
          onStatus={(text) => pushToast(text, 'info')}
        />
      </main>

      <footer className="footer">Tony’s Santa Tracker © {year}</footer>
    </div>
  );
};

export default App;
