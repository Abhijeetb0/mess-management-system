import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { getTodayToken, ANIM_COMPONENT_MAP } from '../utils/tokenUtils';

/* ─────────────────────────────────────────────────────────
   TokenOverlay — Full-screen meal pass
   • Burn-on-Tap: mess worker taps the token area → turns dark
     gray with "MEAL REDEEMED" banner + haptic pulse
   • localStorage persistence: redeemed state survives refresh
     until the meal window expires
───────────────────────────────────────────────────────── */

function useLiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

/* Returns the current meal key: 'breakfast' | 'lunch' | 'snacks' | 'dinner' | null */
function getCurrentMealKey() {
  const h = new Date().getHours();
  if (h >= 8  && h < 10) return 'breakfast';
  if (h >= 13 && h < 15) return 'lunch';
  if (h >= 18 && h < 19) return 'snacks';
  if (h >= 20 && h < 22) return 'dinner';
  return null; // between meals
}

/* Returns the expiry hour for a meal window */
const MEAL_END_HOUR = { breakfast: 10, lunch: 15, snacks: 19, dinner: 22 };

const LS_KEY = (mealKey, date) => `gecmess_redeemed_${mealKey}_${date}`;

export default function TokenOverlay({ onClose }) {
  const { user }                 = useAuth();
  const time                     = useLiveClock();
  const { asset, animationType } = getTodayToken();

  const timeStr  = format(time, 'h:mm:ss aa');
  const dateStr  = format(time, 'EEE, dd MMM yyyy');
  const dateKey  = format(time, 'yyyy-MM-dd');
  const AnimComp = ANIM_COMPONENT_MAP[animationType] ?? ANIM_COMPONENT_MAP['marquee-rtl'];

  const mealKey = getCurrentMealKey();

  /* ── Redemption state ───────────────────────────────── */
  const [redeemed,  setRedeemed]  = useState(false);
  const [animating, setAnimating] = useState(false); // burn flash in progress

  // On mount, restore redeemed state from localStorage if still within meal window
  useEffect(() => {
    if (!mealKey) return;
    const stored = localStorage.getItem(LS_KEY(mealKey, dateKey));
    if (stored) {
      const endHour = MEAL_END_HOUR[mealKey];
      if (new Date().getHours() < endHour) {
        setRedeemed(true); // still within window — keep locked
      } else {
        localStorage.removeItem(LS_KEY(mealKey, dateKey)); // window passed, clean up
      }
    }
  }, [mealKey, dateKey]);

  // Expire check every minute
  useEffect(() => {
    if (!redeemed || !mealKey) return;
    const id = setInterval(() => {
      const endHour = MEAL_END_HOUR[mealKey];
      if (new Date().getHours() >= endHour) {
        setRedeemed(false);
        localStorage.removeItem(LS_KEY(mealKey, dateKey));
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [redeemed, mealKey, dateKey]);

  /* ── Burn tap handler ───────────────────────────────── */
  const handleBurn = useCallback(() => {
    if (redeemed || animating || !mealKey) return;
    setAnimating(true);

    // Haptic pulse if available
    if (navigator.vibrate) navigator.vibrate([40, 30, 40]);

    setTimeout(() => {
      setRedeemed(true);
      setAnimating(false);
      localStorage.setItem(LS_KEY(mealKey, dateKey), '1');
    }, 600);
  }, [redeemed, animating, mealKey, dateKey]);

  const canBurn = !!mealKey && !redeemed;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-5"
      style={{ background: 'rgba(30,24,16,0.65)', backdropFilter: 'blur(4px)' }}
    >
      {/* Token card */}
      <motion.div
        initial={{ scale: 0.82, opacity: 0, y: 48 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.82, opacity: 0, y: 48 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        onClick={handleBurn}
        className={`
          relative w-full max-w-[340px] rounded-[24px] border-2 shadow-brutal-lg
          flex flex-col overflow-hidden
          transition-colors duration-500
          ${redeemed
            ? 'bg-gray-400 border-gray-600'
            : `${asset.bg} border-brand-dark`}
          ${canBurn ? 'cursor-pointer active:scale-[0.98]' : ''}
        `}
        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
        onContextMenu={e => e.preventDefault()}
      >
        {/* ── Burn flash overlay ── */}
        <AnimatePresence>
          {animating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.7, 0] }}
              transition={{ duration: 0.6, times: [0, 0.3, 1] }}
              className="absolute inset-0 bg-gray-700 z-20 rounded-[22px]"
            />
          )}
        </AnimatePresence>

        {/* ── MEAL REDEEMED banner ── */}
        <AnimatePresence>
          {redeemed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[22px] bg-gray-500/80"
            >
              <motion.div
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="text-5xl"
              >
                ✅
              </motion.div>
              <div className="bg-gray-800 border-2 border-gray-600 rounded-brutal px-6 py-3 text-center shadow-brutal">
                <p className="font-serif font-bold text-2xl text-white tracking-wide">MEAL REDEEMED</p>
                <p className="font-sans text-xs text-gray-300 mt-1 capitalize">{mealKey} · {dateStr}</p>
              </div>
              <p className="font-sans text-xs text-gray-200/70 mt-1">
                Token locked until meal window closes
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden select-none">
          <span
            className="font-serif font-bold whitespace-nowrap"
            style={{
              fontSize: 'clamp(2rem, 18vw, 5.5rem)',
              transform: 'rotate(-22deg)',
              color: redeemed ? 'rgba(0,0,0,0.08)' : 'rgba(30,24,16,0.07)',
            }}
          >
            {user?.rollNumber ?? '00CS000'}
          </span>
        </div>

        <div className="relative z-10 flex flex-col items-center w-full pt-7 pb-6 gap-4">

          {/* Date badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/50 border border-brand-dark/20 rounded-pill">
            <span className="font-sans font-semibold text-xs text-brand-dark">📅 {dateStr}</span>
          </div>

          {/* Clock */}
          <motion.p
            key={timeStr}
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 1 }}
            className={`font-mono font-bold text-4xl tracking-widest leading-none ${redeemed ? 'text-gray-700' : 'text-brand-dark'}`}
          >
            {timeStr}
          </motion.p>

          {/* Animation zone */}
          <div
            style={{ width: '100%', overflowX: 'hidden', overflowY: 'visible', minHeight: 120, paddingTop: 12, paddingBottom: 12 }}
            className={redeemed ? 'opacity-20 grayscale' : ''}
          >
            <AnimComp emoji={asset.emoji} size="text-6xl" />
          </div>

          {/* Label */}
          <p className={`font-serif italic text-base -mt-2 ${redeemed ? 'text-gray-600' : 'text-brand-dark/55'}`}>
            {redeemed ? 'Meal Pass Used' : 'Active Meal Pass'}
          </p>

          {/* Name + Roll strip */}
          <div
            className="w-full mx-5 bg-white border-2 border-brand-dark rounded-brutal px-4 py-3.5 text-center shadow-brutal-sm"
            style={{ width: 'calc(100% - 40px)' }}
          >
            <p className="font-sans font-bold text-xl text-brand-dark leading-tight">
              {user?.displayName ?? 'Student Name'}
            </p>
            <p className="font-mono text-sm text-brand-light mt-0.5">
              {user?.rollNumber ?? '00CS000'}
            </p>
          </div>

          {/* Tap hint — only when a meal is active and not yet redeemed */}
          {canBurn && (
            <motion.p
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="font-sans text-[11px] text-brand-dark/50 -mt-2"
            >
              Worker: tap token to redeem
            </motion.p>
          )}

        </div>
      </motion.div>

      {/* Close button */}
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
