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

  useEffect(() => {
    if (intervalRef.current !== null) return;

    intervalRef.current = window.setInterval(() => {
    const msgs = [
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
        {/* Top-middle toasts */}
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
          bedtimeHourLocal={22}
          bedtimeMinuteLocal={0}
          onStatus={(text) => pushToast(text, 'info')}
        />
      </main>

      <footer className="footer">Tony’s Santa Tracker © {year}</footer>
    </div>
  );
};

export default App;
