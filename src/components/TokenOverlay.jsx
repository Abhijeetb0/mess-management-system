import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';

/* ─────────────────────────────────────────────────────────
   TokenOverlay — Student QR meal pass
   • Shows a unique QR that changes every meal period
   • QR content: "GECMESS|{uid}|{yyyy-MM-dd}|{mealKey}"
   • If outside a meal window: shows "No Active Meal"
   • The worker scans this QR to verify entry
───────────────────────────────────────────────────────── */

const MEAL_WINDOWS = [
  { key: 'breakfast', label: 'Breakfast',  emoji: '☀️',  start: 8,  end: 10, color: '#fef3c7', border: '#d97706' },
  { key: 'lunch',     label: 'Lunch',      emoji: '🌤️', start: 13, end: 15, color: '#fce7f3', border: '#db2777' },
  { key: 'snacks',    label: 'Snacks',     emoji: '🫖',  start: 18, end: 19, color: '#ede9fe', border: '#7c3aed' },
  { key: 'dinner',    label: 'Dinner',     emoji: '🌙',  start: 20, end: 22, color: '#d1fae5', border: '#059669' },
];

function getActiveMeal(hour) {
  return MEAL_WINDOWS.find(m => hour >= m.start && hour < m.end) ?? null;
}

function useLiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export default function TokenOverlay({ onClose }) {
  const { user } = useAuth();
  const time     = useLiveClock();

  const hour    = time.getHours();
  const meal    = getActiveMeal(hour);
  const dateStr = format(time, 'yyyy-MM-dd');
  const timeStr = format(time, 'h:mm:ss aa');
  const dayStr  = format(time, 'EEE, dd MMM yyyy');

  // QR payload — changes per meal per day per student
  const qrPayload = meal
    ? `GECMESS|${user?.uid}|${dateStr}|${meal.key}`
    : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-5"
      style={{ background: 'rgba(20,16,10,0.72)', backdropFilter: 'blur(6px)' }}
    >
      <motion.div
        initial={{ scale: 0.82, opacity: 0, y: 48 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.82, opacity: 0, y: 48 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        className="relative w-full max-w-[320px] rounded-[24px] border-2 border-brand-dark shadow-brutal-lg flex flex-col overflow-hidden bg-white"
        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
        onContextMenu={e => e.preventDefault()}
      >
        {/* ── Header strip (meal-coloured) ── */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ background: meal ? meal.color : '#f3f4f6', borderBottom: `2px solid ${meal ? meal.border : '#d1d5db'}` }}
        >
          <div>
            <p className="font-sans font-bold text-xs uppercase tracking-widest text-brand-dark/60">
              {meal ? `${meal.emoji} ${meal.label} Pass` : '⏳ Between Meals'}
            </p>
            <p className="font-mono font-bold text-2xl text-brand-dark leading-none mt-0.5">{timeStr}</p>
            <p className="font-sans text-[10px] text-brand-dark/50 mt-0.5">{dayStr}</p>
          </div>
          <div className="text-right">
            <p className="font-sans text-[10px] text-brand-dark/40 uppercase tracking-wider">GEC Mess</p>
            {meal && (
              <p className="font-sans text-[10px] text-brand-dark/50">
                Valid {meal.start}:00 – {meal.end}:00
              </p>
            )}
          </div>
        </div>

        {/* ── QR Code area ── */}
        <div className="flex flex-col items-center px-5 py-5">
          {qrPayload ? (
            <>
              <div className="rounded-brutal border-2 border-brand-dark p-3 bg-white shadow-brutal-sm mb-3">
                <QRCodeSVG
                  value={qrPayload}
                  size={200}
                  level="M"
                  includeMargin={false}
                  fgColor="#1a1209"
                />
              </div>
              <motion.p
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="font-sans text-[10px] text-brand-dark/40 mb-1"
              >
                Show this to the mess worker
              </motion.p>
            </>
          ) : (
            <div className="w-[200px] h-[200px] rounded-brutal border-2 border-brand-dark/20 bg-brand-bg flex flex-col items-center justify-center gap-2 mb-3">
              <span className="text-4xl">⏳</span>
              <p className="font-sans text-xs text-brand-dark/50 text-center px-4">
                No active meal right now.<br />QR will appear during meal windows.
              </p>
            </div>
          )}

          {/* Name + roll strip */}
          <div className="w-full border-2 border-brand-dark rounded-brutal px-4 py-3 text-center bg-brand-bg shadow-brutal-sm">
            <p className="font-sans font-bold text-lg text-brand-dark leading-tight">
              {user?.displayName ?? 'Student'}
            </p>
            <p className="font-mono text-sm text-brand-light mt-0.5">
              {user?.rollNumber ?? '—'}
            </p>
          </div>
        </div>

        {/* ── Perforated divider ── */}
        <div className="w-full border-t-2 border-dashed border-brand-dark/15" />

        {/* ── Footer ── */}
        <div className="px-5 py-3 flex items-center justify-between">
          <p className="font-sans text-[9px] text-brand-dark/30 uppercase tracking-widest">GEC Sheikhpura</p>
          <p className="font-mono text-[9px] text-brand-dark/30">{dateStr}</p>
        </div>
      </motion.div>

      {/* Close */}
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.18 }}
        onClick={onClose}
        className="mt-6 w-[52px] h-[52px] rounded-full bg-brand-bg border-2 border-brand-dark shadow-brutal flex items-center justify-center"
        aria-label="Close token"
      >
        <X size={22} className="text-brand-dark" />
      </motion.button>
    </div>
  );
}
