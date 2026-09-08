import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { getTodayToken, ANIM_COMPONENT_MAP } from '../utils/tokenUtils';
import { saveTokenRedemption, getTokenRedemption } from '../lib/firestoreService';

/* ────────────────────────────────────────────────────────
   TokenOverlay — Full-screen meal pass
   • Tap the name/roll box to redeem
   • Overlay can be closed & reopened during 20-min window
     to view redeemed state again
   • After 20 min: onClose(true) fires, parent disables button
──────────────────────────────────────────────────────── */

const REDEEM_WINDOW_MS = 20 * 60 * 1000; // 20 minutes in ms
const LS_KEY = (date) => `gecmess_redeemed_${date}`;

function useLiveClock(frozen) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    if (frozen) return; // stop ticking when redeemed
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, [frozen]);
  return time;
}

export default function TokenOverlay({ onClose }) {
  const { user } = useAuth();
  const { asset, animationType } = getTodayToken();
  const AnimComp = ANIM_COMPONENT_MAP[animationType] ?? ANIM_COMPONENT_MAP['marquee-rtl'];

  const dateKey = format(new Date(), 'yyyy-MM-dd');

  // Store onClose in a ref so the expiry timer never captures a stale closure
  // and never gets restarted just because the parent re-rendered.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // ── Redemption state ─────────────────────────────────────
  const [redeemedAt, setRedeemedAt] = useState(null);  // timestamp ms
  const [animating, setAnimating] = useState(false);
  const [expired, setExpired] = useState(false);
  const expireTimerRef = useRef(null);

  const redeemed = redeemedAt !== null;

  // Frozen time display: when redeemed the clock shows the exact moment of tap
  const frozenTime = redeemedAt ? new Date(redeemedAt) : null;
  const liveClock = useLiveClock(redeemed);
  const displayTime = frozenTime ?? liveClock;

  const timeStr = format(displayTime, 'h:mm:ss aa');
  const dateStr = format(displayTime, 'EEE, dd MMM yyyy');

  // ── Restore redemption state on mount ──────────────────
  // Priority: localStorage (fast, offline-capable) → Firestore (cross-device sync)
  useEffect(() => {
    const tryRestore = async () => {
      // 1. Check localStorage first
      const stored = localStorage.getItem(LS_KEY(dateKey));
      let ts = stored ? Number(stored) : 0;

      // 2. If not in localStorage, fetch from Firestore (different device / cleared storage)
      if (!ts && user?.uid) {
        try {
          const remote = await getTokenRedemption(user.uid);
          if (remote?.date === dateKey && remote?.redeemedAt) {
            ts = remote.redeemedAt;
            // Sync back to localStorage so subsequent checks are instant
            localStorage.setItem(LS_KEY(dateKey), String(ts));
          }
        } catch { /* offline — skip */ }
      }

      if (!ts) return; // not redeemed today

      const elapsed = Date.now() - ts;
      if (elapsed >= REDEEM_WINDOW_MS) {
        // Already expired — close immediately; parent will show 'Token Used'
        localStorage.removeItem(LS_KEY(dateKey));
        setExpired(true);
        onCloseRef.current?.();
      } else {
        setRedeemedAt(ts);
        scheduleExpiry(REDEEM_WINDOW_MS - elapsed);
      }
    };
    tryRestore();
  }, []); // eslint-disable-line

  // ── Schedule the 20-min expiry timer ────────────────────
  // No external deps — uses onCloseRef so the timer is created once
  // and never restarted by parent re-renders (e.g. clock ticks).
  const scheduleExpiry = useCallback((ms) => {
    clearTimeout(expireTimerRef.current);
    expireTimerRef.current = setTimeout(() => {
      localStorage.removeItem(LS_KEY(dateKey));
      setExpired(true);
      onCloseRef.current?.(true); // true = expired flag for parent
    }, ms);
  }, [dateKey]); // dateKey is stable (formatted once) — safe dep

  useEffect(() => () => clearTimeout(expireTimerRef.current), []);

  // ── Tap-to-redeem (on the name/roll box) ────────────────
  const handleRedeem = useCallback(() => {
    if (redeemed || animating) return;
    setAnimating(true);

    // Haptic on supported devices
    if (navigator.vibrate) navigator.vibrate([40, 30, 40]);

    setTimeout(() => {
      const now = Date.now();
      setRedeemedAt(now);
      setAnimating(false);
      // 1. Save to localStorage (instant, offline-capable)
      localStorage.setItem(LS_KEY(dateKey), String(now));
      // 2. Push to Firestore (cross-device sync) — fire-and-forget
      if (user?.uid) {
        saveTokenRedemption(user.uid, now, dateKey).catch(
          (err) => console.warn('[Token] Firestore sync failed:', err)
        );
      }
      scheduleExpiry(REDEEM_WINDOW_MS);
    }, 500);
  }, [redeemed, animating, dateKey, scheduleExpiry, user]);

  // Remaining time display
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    if (!redeemed || !redeemedAt) return;
    const tick = () => {
      const left = REDEEM_WINDOW_MS - (Date.now() - redeemedAt);
      if (left <= 0) { setRemaining('Expired'); return; }
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      setRemaining(`Expires in ${m}m ${String(s).padStart(2, '0')}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [redeemed, redeemedAt]);

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
        className={`
          relative w-full max-w-[340px] rounded-[24px] border-2 shadow-brutal-lg
          flex flex-col overflow-hidden
          transition-colors duration-500
          ${redeemed
            ? 'bg-gray-400 border-gray-600'
            : `${asset.bg} border-brand-dark`}
        `}
        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
        onContextMenu={e => e.preventDefault()}
      >
        {/* ── Burn flash overlay ── */}
        <AnimatePresence>
          {animating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.75, 0] }}
              transition={{ duration: 0.5, times: [0, 0.3, 1] }}
              className="absolute inset-0 bg-gray-700 z-20 rounded-[22px]"
            />
          )}
        </AnimatePresence>

        {/* ── MEAL REDEEMED overlay ── */}
        <AnimatePresence>
          {redeemed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[22px] bg-gray-600/80"
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
                <p className="font-sans text-xs text-gray-300 mt-0.5">
                  Redeemed at {timeStr}
                </p>
              </div>
              <p className="font-sans text-xs text-gray-200/70">{remaining}</p>
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

          {/* Clock — frozen at redemption moment */}
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
            {redeemed ? '' : 'Active Meal Pass'}
          </p>

          {/* ── Tappable name + roll box (tap = redeem) ── */}
          <motion.div
            onClick={handleRedeem}
            whileTap={!redeemed ? { scale: 0.96 } : {}}
            className={`
              w-full mx-5 bg-white border-2 rounded-brutal px-4 py-3.5 text-center shadow-brutal-sm
              transition-colors
              ${!redeemed
                ? 'border-brand-dark cursor-pointer hover:bg-brand-primary/20 active:bg-brand-primary/30'
                : 'border-gray-400 cursor-default bg-gray-100'}
            `}
            style={{ width: 'calc(100% - 40px)' }}
          >
            <p className={`font-sans font-bold text-xl leading-tight ${redeemed ? 'text-gray-500' : 'text-brand-dark'}`}>
              {user?.displayName ?? 'Student Name'}
            </p>
            <p className={`font-mono text-sm mt-0.5 ${redeemed ? 'text-gray-400' : 'text-brand-light'}`}>
              {user?.rollNumber ?? '00CS000'}
            </p>
            {!redeemed && (
              <motion.p
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.8, repeat: Infinity }}
                className="font-sans text-[10px] text-brand-dark/40 mt-1"
              >
                Worker: tap here to redeem
              </motion.p>
            )}
          </motion.div>

        </div>
      </motion.div>

      {/* Close button — must use arrow wrapper so NO argument is passed.
          onClick={onClose} would pass the MouseEvent as the first arg,
          which the parent's onClose(expired) would treat as truthy. */}
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.18 }}
        onClick={() => onCloseRef.current?.()}
        className="mt-6 w-[52px] h-[52px] rounded-full bg-brand-bg border-2 border-brand-dark shadow-brutal flex items-center justify-center"
        aria-label="Close token"
      >
        <X size={22} className="text-brand-dark" />
      </motion.button>
    </div>
  );
}
