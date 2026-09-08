import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import jsQR from 'jsqr';
import { format } from 'date-fns';
import {
  CheckCircle, XCircle, LogOut, CameraOff,
  Camera, Users, UserCheck, UserX, RefreshCw,
} from 'lucide-react';
import { BrutalCard } from '../../components/ui';
import {
  listenAllStudents, listenActiveOptOuts, getActiveOptOutUIDs,
  listenMealScans, recordScan, logDeniedScan, getUserByRollNumber, getUser,
} from '../../lib/firestoreService';
import { useAuth } from '../../context/AuthContext';

/* ─────────────────────────────────────────────────────────
   Worker Terminal — QR scanner + Students panel
   ─ Redesigned to match new QR token system
   ─ QR payload: "GECMESS|{uid}|{yyyy-MM-dd}|{mealKey}"
   ─ Validates: signature, date=today, meal=current window
   ─ Records scan in /scans/{date}/{mealKey}/{uid}
───────────────────────────────────────────────────────── */

const MEAL_WINDOWS = [
  { key: 'breakfast', label: 'Breakfast', emoji: '☀️',  start: 8,  end: 10 },
  { key: 'lunch',     label: 'Lunch',     emoji: '🌤️', start: 13, end: 15 },
  { key: 'snacks',    label: 'Snacks',    emoji: '🫖',  start: 18, end: 19 },
  { key: 'dinner',    label: 'Dinner',    emoji: '🌙',  start: 20, end: 22 },
];

function getCurrentMeal() {
  const h = new Date().getHours();
/* ─────────────────────────────────────────────────────────
   🔧 DEV TESTING — set the same value as in TokenOverlay.jsx
   to simulate a meal window in the scanner.
   Set to null for live (real clock).
───────────────────────────────────────────────────────── */
const DEV_HOUR = 13; // ← change this to test (must match TokenOverlay.jsx)

const MEAL_WINDOWS = [
  { key: 'breakfast', label: 'Breakfast', emoji: '☀️', start: 8, end: 10 },
  { key: 'lunch', label: 'Lunch', emoji: '🌤️', start: 13, end: 15 },
  { key: 'snacks', label: 'Snacks', emoji: '🫖', start: 18, end: 19 },
  { key: 'dinner', label: 'Dinner', emoji: '🌙', start: 20, end: 22 },
];

function getCurrentMeal() {
  const h = DEV_HOUR ?? new Date().getHours();
  return MEAL_WINDOWS.find(m => h >= m.start && h < m.end) ?? null;
}

/* ── Parse + validate a scanned QR string ── */
function parseQR(raw, today) {
  if (!raw?.startsWith('GECMESS|')) return null;
  const [, uid, date, mealKey] = raw.split('|');
  if (!uid || !date || !mealKey) return null;
  if (date !== today)            return { error: 'QR is from a different day' };
  const meal = MEAL_WINDOWS.find(m => m.key === mealKey);
  if (!meal)                     return { error: 'Unknown meal type in QR' };
  const h = new Date().getHours();
  if (date !== today) return { error: 'QR is from a different day' };
  const meal = MEAL_WINDOWS.find(m => m.key === mealKey);
  if (!meal) return { error: 'Unknown meal type in QR' };
  const h = DEV_HOUR ?? new Date().getHours(); // uses override when testing
  if (h < meal.start || h >= meal.end)
    return { error: `This QR is for ${meal.label} (${meal.start}:00–${meal.end}:00)` };
  return { uid, mealKey, meal };
}

/* ══════════════════════════════════════════════════════════
   Students Panel — shows scanned / not scanned / opted out
══════════════════════════════════════════════════════════ */
function StudentsPanel({ today, currentMeal }) {
  const [students,    setStudents]    = useState([]);
  const [scanned,     setScanned]     = useState([]); // scan docs
  const [optOutUIDs,  setOptOutUIDs]  = useState(new Set());
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState('all'); // 'all'|'scanned'|'out'
  const [students, setStudents] = useState([]);
  const [scanned, setScanned] = useState([]); // scan docs
  const [optOutUIDs, setOptOutUIDs] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all'); // 'all'|'scanned'|'out'

  // Live students
  useEffect(() => {
    const unsub = listenAllStudents(data => { setStudents(data); setLoading(false); });
    return () => unsub?.();
  }, []);

  // Today's opt-outs — LIVE (committee approve karte hi update, blocklist doc nahi)
  useEffect(() => {
    const unsub = listenActiveOptOuts(today, (set) => setOptOutUIDs(set));
    return () => unsub?.();
  }, [today]);

  // Live scans for current meal
  useEffect(() => {
    if (!currentMeal) { setScanned([]); return; }
    const unsub = listenMealScans(today, currentMeal.key, setScanned);
    return () => unsub?.();
  }, [today, currentMeal]);

  const scannedUIDs   = new Set(scanned.map(s => s.uid));
  const approved      = students.filter(s => s.isApproved === true);
  const notScanned    = approved.filter(s => !scannedUIDs.has(s.uid) && !optOutUIDs.has(s.uid));
  const scannedList   = approved.filter(s => scannedUIDs.has(s.uid));
  const optedOutList  = students.filter(s => optOutUIDs.has(s.uid));

  const TABS = [
    { key: 'all',     label: 'Not In Yet', count: notScanned.length,   list: notScanned,   color: 'bg-brand-primary'   },
    { key: 'scanned', label: 'Scanned',    count: scannedList.length,  list: scannedList,  color: 'bg-brand-accent'    },
    { key: 'out',     label: 'Opted Out',  count: optedOutList.length, list: optedOutList, color: 'bg-brand-secondary' },
  const scannedUIDs = new Set(scanned.map(s => s.uid));
  const approved = students.filter(s => s.isApproved === true);
  const notScanned = approved.filter(s => !scannedUIDs.has(s.uid) && !optOutUIDs.has(s.uid));
  const scannedList = approved.filter(s => scannedUIDs.has(s.uid));
  const optedOutList = students.filter(s => optOutUIDs.has(s.uid));

  const TABS = [
    { key: 'all', label: 'Not In Yet', count: notScanned.length, list: notScanned, color: 'bg-brand-primary' },
    { key: 'scanned', label: 'Scanned', count: scannedList.length, list: scannedList, color: 'bg-brand-accent' },
    { key: 'out', label: 'Opted Out', count: optedOutList.length, list: optedOutList, color: 'bg-brand-secondary' },
  ];

  const active = TABS.find(t => t.key === tab);

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <RefreshCw size={22} className="animate-spin text-brand-light" />
    </div>
  );

  return (
    <div className="px-4 pb-6">
      {/* Tab pills */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 font-sans text-xs font-bold px-3 py-1.5 rounded-pill border-2 border-brand-dark whitespace-nowrap transition-all
              ${tab === t.key ? `${t.color} shadow-brutal-sm` : 'bg-brand-bg opacity-50 hover:opacity-80'}`}
          >
            {t.label}
            <span className="bg-brand-dark/10 text-brand-dark rounded-full px-1.5 py-0.5 text-[9px] font-bold">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Student cards */}
      <div className="flex flex-col gap-2">
        {active?.list.length === 0 ? (
          <BrutalCard className="p-6 text-center">
            <p className="font-sans text-sm text-brand-light">
              {tab === 'all'     ? (currentMeal ? 'All students have entered!' : 'Meal not active yet')
               : tab === 'scanned' ? 'No one scanned yet'
               : 'No opt-outs today'}
              {tab === 'all' ? (currentMeal ? 'All students have entered!' : 'Meal not active yet')
                : tab === 'scanned' ? 'No one scanned yet'
                  : 'No opt-outs today'}
            </p>
          </BrutalCard>
        ) : (
          active.list.map((s, i) => (
            <motion.div key={s.uid} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
              <BrutalCard color={active.color} className="p-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-white border-2 border-brand-dark flex items-center justify-center font-serif font-bold text-sm shrink-0">
                    {(s.displayName || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-sans font-bold text-sm truncate">{s.displayName}</p>
                    <p className="font-mono text-xs text-brand-light">{s.rollNumber}</p>
                  </div>
                  {tab === 'scanned' && (
                    <UserCheck size={16} className="text-green-700 shrink-0" />
                  )}
                  {tab === 'out' && (
                    <UserX size={16} className="text-red-600 shrink-0" />
                  )}
                </div>
              </BrutalCard>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Main Terminal
══════════════════════════════════════════════════════════ */
export default function Terminal() {
  const { user, logout } = useAuth();
  const [scanning,  setScanning]  = useState(false);
  const [result,    setResult]    = useState(null);
  const [camError,  setCamError]  = useState('');
  const [tab,       setTab]       = useState('scan'); // 'scan' | 'students'
  const [manualRoll, setManualRoll] = useState('');
  const [manualBusy, setManualBusy] = useState(false);

  const today       = format(new Date(), 'yyyy-MM-dd');
  const currentMeal = getCurrentMeal();

  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef    = useRef(null);

/* ══════════════════════════════════════════════════════════
   Main Terminal
══════════════════════════════════════════════════════════ */
export default function Terminal() {
  const { user, logout } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [camError, setCamError] = useState('');
  const [tab, setTab] = useState('scan'); // 'scan' | 'students'

  const today = format(new Date(), 'yyyy-MM-dd');
  const currentMeal = getCurrentMeal();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const activeRef = useRef(false);

  useEffect(() => () => stopCamera(), []);

  /* ── Camera stop ── */
  const stopCamera = useCallback(() => {
    activeRef.current = false;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  /* ── Camera start ── */
  const startCamera = useCallback(async () => {
    setCamError('');
    setResult(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError('Camera requires HTTPS. Connect via https:// or ask your admin.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      activeRef.current = true;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setScanning(true);
      scanLoop();
    } catch (err) {
      if (err.name === 'NotAllowedError') setCamError('Camera permission denied.');
      else if (err.name === 'NotFoundError') setCamError('No camera found.');
      else setCamError(`Camera error: ${err.message}`);
    }
  }, []); // eslint-disable-line

  /* ── Scan loop ── */
  const scanLoop = useCallback(() => {
    if (!activeRef.current) return;
    const video  = videoRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    if (code?.data) { onScan(code.data); return; }
    rafRef.current = requestAnimationFrame(scanLoop);
  }, []); // eslint-disable-line

  /* ── On scan ── */
  const onScan = useCallback(async (raw) => {
    stopCamera();
    const parsed = parseQR(raw, today);

    if (!parsed) {
      setResult({ status: 'invalid', message: 'Not a valid MessApp QR code.' });
      setTimeout(() => setResult(null), 6000);
      return;
    }
    if (parsed.error) {
      setResult({ status: 'error', message: parsed.error });
      setTimeout(() => setResult(null), 6000);
      return;
    }

    const { uid, mealKey, meal } = parsed;

    // Check opt-out (direct approved-query — hamesha fresh)
    const optOutUIDs = await getActiveOptOutUIDs(today);
    if (optOutUIDs.has(uid)) {
      try {
        const prof = await getUser(uid);
        await logDeniedScan(uid, mealKey, today, prof?.displayName || '', prof?.rollNumber || '');
      } catch { /* audit log fail ho to bhi deny rahe */ }
      setResult({ status: 'denied', message: `Opted out — deny ${meal.label} entry.`, uid });
      setTimeout(() => setResult(null), 7000);
      return;
    }

    // Record the scan
    try {
      const profile = await getUser(uid);
      if (profile && profile.isApproved === false) {
        setResult({ status: 'denied', message: 'Account not approved — deny entry.', uid });
        setTimeout(() => setResult(null), 7000);
        return;
      }
      await recordScan(uid, mealKey, today, profile?.displayName || '', profile?.rollNumber || '');
      setResult({
        status: 'allowed',
        message: `${meal.emoji} ${meal.label} entry allowed`,
        name: profile?.displayName || uid,
        roll: profile?.rollNumber || '',
      });
    } catch {
      setResult({ status: 'allowed', message: `Entry allowed`, name: uid, roll: '' });
    }
    setTimeout(() => setResult(null), 6000);
  }, [today, stopCamera]); // eslint-disable-line

  /* ── Manual roll entry fallback (camera fail / QR damage) ── */
  const handleManualCheck = useCallback(async () => {
    const roll = manualRoll.trim();
    if (!roll || manualBusy) return;
    if (!currentMeal) {
      setResult({ status: 'error', message: 'No active meal right now.' });
      setTimeout(() => setResult(null), 5000);
      return;
    }
    setManualBusy(true);
    try {
      const profile = await getUserByRollNumber(roll);
      if (!profile) {
        setResult({ status: 'invalid', message: `No student found: ${roll}` });
      } else if (profile.isApproved === false) {
        setResult({ status: 'denied', message: 'Account not approved — deny entry.', uid: profile.uid });
      } else {
        const optOutUIDs = await getActiveOptOutUIDs(today);
        if (optOutUIDs.has(profile.uid)) {
          try { await logDeniedScan(profile.uid, currentMeal.key, today, profile.displayName || '', profile.rollNumber || ''); } catch {}
          setResult({ status: 'denied', message: `Opted out — deny ${currentMeal.label} entry.`, uid: profile.uid });
        } else {
          await recordScan(profile.uid, currentMeal.key, today, profile.displayName || '', profile.rollNumber || '');
          setResult({
            status: 'allowed',
            message: `${currentMeal.emoji} ${currentMeal.label} entry allowed`,
            name: profile.displayName || profile.uid,
            roll: profile.rollNumber || '',
          });
        }
      }
    } catch {
      setResult({ status: 'error', message: 'Manual check failed. Try again.' });
    } finally {
      setManualBusy(false);
      setTimeout(() => setResult(null), 6000);
    }
  }, [manualRoll, manualBusy, currentMeal, today]);

  /* ─── Result colours ─── */
  const RESULT_STYLE = {
    allowed: 'bg-brand-accent border-brand-dark',
    denied:  'bg-brand-secondary border-brand-dark',
    invalid: 'bg-brand-primary border-brand-dark',
    error:   'bg-brand-primary border-brand-dark',

  /* ── On scan ── */
  const onScan = useCallback(async (raw) => {
    stopCamera();
    const parsed = parseQR(raw, today);

    if (!parsed) {
      setResult({ status: 'invalid', message: 'Not a valid MessApp QR code.' });
      setTimeout(() => setResult(null), 6000);
      return;
    }
    if (parsed.error) {
      setResult({ status: 'error', message: parsed.error });
      setTimeout(() => setResult(null), 6000);
      return;
    }

    const { uid, mealKey, meal } = parsed;

    // Check opt-out
    const optOutUIDs = await getTodayOptOutUIDs();
    if (optOutUIDs.has(uid)) {
      setResult({ status: 'denied', message: `Opted out — deny ${meal.label} entry.`, uid });
      setTimeout(() => setResult(null), 7000);
      return;
    }

    // Record the scan
    try {
      const profile = await import('../../lib/firestoreService')
        .then(m => m.getUser(uid));
      await recordScan(uid, mealKey, today, profile?.displayName || '', profile?.rollNumber || '');
      setResult({
        status: 'allowed',
        message: `${meal.emoji} ${meal.label} entry allowed`,
        name: profile?.displayName || uid,
        roll: profile?.rollNumber || '',
      });
    } catch {
      setResult({ status: 'allowed', message: `Entry allowed`, name: uid, roll: '' });
    }
    setTimeout(() => setResult(null), 6000);
  }, [today, stopCamera]); // eslint-disable-line

  /* ─── Result colours ─── */
  const RESULT_STYLE = {
    allowed: 'bg-brand-accent border-brand-dark',
    denied: 'bg-brand-secondary border-brand-dark',
    invalid: 'bg-brand-primary border-brand-dark',
    error: 'bg-brand-primary border-brand-dark',
  };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 border-b-2 border-brand-dark flex items-center justify-between gap-3 sticky top-0 bg-brand-bg z-10">
        <div className="flex items-center gap-3">
          <h1 className="font-serif font-bold text-xl leading-none">
            Mess<span className="text-brand-gold">App</span>
            <span className="font-sans font-normal text-sm text-brand-light ml-2">Worker</span>
          </h1>
          {currentMeal && (
            <span className="font-sans text-[10px] font-bold uppercase tracking-wider border-2 border-brand-dark rounded-pill px-2 py-0.5 bg-brand-primary">
              {currentMeal.emoji} {currentMeal.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Camera shortcut */}
          <button
            onClick={() => { setTab('scan'); if (!scanning) startCamera(); }}
            className="w-9 h-9 flex items-center justify-center rounded-brutal border-2 border-brand-dark bg-brand-dark text-brand-bg hover:bg-brand-dark/80 transition-colors"
            title="Scan QR"
          >
            <Camera size={16} />
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 font-sans text-xs font-semibold text-brand-dark/60 hover:text-brand-dark border-2 border-brand-dark/30 hover:border-brand-dark rounded-brutal px-3 py-2 transition-all"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>

      {/* ── Bottom tab bar ── */}
      <div className="flex border-b-2 border-brand-dark">
        {[{ key: 'scan', label: 'Scan', Icon: Camera }, { key: 'students', label: 'Students', Icon: Users }].map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => { setTab(key); if (key !== 'scan') stopCamera(); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 font-sans text-sm font-semibold transition-colors
              ${tab === key ? 'bg-brand-dark text-brand-bg' : 'bg-brand-bg text-brand-dark hover:bg-brand-primary/30'}`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ══ SCAN TAB ══ */}
      {tab === 'scan' && (
        <div className="flex-1 flex flex-col">

          {/* Result banner */}
          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`mx-4 mt-4 rounded-brutal border-2 p-4 flex items-start gap-3 ${RESULT_STYLE[result.status]}`}
              >
                {result.status === 'allowed'
                  ? <CheckCircle size={28} className="text-green-700 shrink-0 mt-0.5" />
                  : <XCircle    size={28} className="text-red-700 shrink-0 mt-0.5"   />}
                  : <XCircle size={28} className="text-red-700 shrink-0 mt-0.5" />}
                <div>
                  <p className="font-serif font-bold text-base leading-tight">{result.message}</p>
                  {result.name && (
                    <p className="font-sans text-sm text-brand-dark/70 mt-0.5">
                      {result.name} · {result.roll}
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Camera error */}
          {camError && (
            <div className="mx-4 mt-3 flex items-center gap-3 border-2 border-brand-dark rounded-brutal p-3 bg-brand-secondary">
              <CameraOff size={18} className="shrink-0" />
              <p className="font-sans text-sm">{camError}</p>
            </div>
          )}

          {/* Video feed */}
          <div className={`relative mx-4 mt-4 ${scanning ? 'block' : 'hidden'}`}>
            <video ref={videoRef} autoPlay playsInline muted
              className="w-full aspect-square object-cover rounded-brutal border-2 border-brand-dark bg-brand-dark"
            />
            {/* Corners */}
            {[['top-2 left-2','border-t-4 border-l-4'],['top-2 right-2','border-t-4 border-r-4'],
              ['bottom-2 left-2','border-b-4 border-l-4'],['bottom-2 right-2','border-b-4 border-r-4']].map(([p,b],i)=>(
            {[['top-2 left-2', 'border-t-4 border-l-4'], ['top-2 right-2', 'border-t-4 border-r-4'],
            ['bottom-2 left-2', 'border-b-4 border-l-4'], ['bottom-2 right-2', 'border-b-4 border-r-4']].map(([p, b], i) => (
              <div key={i} className={`absolute ${p} w-8 h-8 ${b} border-brand-gold rounded-sm`} />
            ))}
            <motion.div
              className="absolute left-3 right-3 h-0.5 bg-brand-gold/70 rounded"
              animate={{ top: ['8%','92%','8%'] }}
              animate={{ top: ['8%', '92%', '8%'] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            />
          </div>
          <canvas ref={canvasRef} className="hidden" />

          {/* Idle prompt */}
          {!scanning && !result && (
            <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
              <div className="w-36 h-36 border-2 border-brand-dark/20 rounded-brutal bg-brand-bg flex items-center justify-center mb-5 relative overflow-hidden">
                <motion.div className="absolute left-0 right-0 h-0.5 bg-brand-dark/20"
                  animate={{ top: ['10%','90%','10%'] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }} />
                {[['top-2 left-2','border-t-2 border-l-2'],['top-2 right-2','border-t-2 border-r-2'],
                  ['bottom-2 left-2','border-b-2 border-l-2'],['bottom-2 right-2','border-b-2 border-r-2']].map(([p,b],i)=>(
                  animate={{ top: ['10%', '90%', '10%'] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }} />
                {[['top-2 left-2', 'border-t-2 border-l-2'], ['top-2 right-2', 'border-t-2 border-r-2'],
                ['bottom-2 left-2', 'border-b-2 border-l-2'], ['bottom-2 right-2', 'border-b-2 border-r-2']].map(([p, b], i) => (
                  <div key={i} className={`absolute ${p} w-6 h-6 ${b} border-brand-dark rounded-sm`} />
                ))}
                <Camera size={32} className="text-brand-dark/25" />
              </div>
              <p className="font-serif font-bold text-lg text-brand-dark mb-1">
                {currentMeal ? `Scanning ${currentMeal.label}` : 'No Active Meal'}
              </p>
              <p className="font-sans text-sm text-brand-light text-center mb-6">
                {currentMeal
                  ? 'Tap the camera button or below to start scanning student QR codes'
                  : `Next meal starts soon — check the meal schedule`}
              </p>
              <button
                onClick={startCamera}
                className="flex items-center gap-2 font-sans font-bold text-sm px-8 py-3 bg-brand-dark text-brand-bg rounded-brutal border-2 border-brand-dark shadow-brutal hover:shadow-brutal-lg transition-shadow"
              >
                <Camera size={16} />
                Start Scanning
              </button>
              {/* Manual fallback */}
              <div className="w-full max-w-[320px] mt-6 border-2 border-brand-dark/20 rounded-brutal p-3 bg-white/60">
                <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-brand-light mb-2 text-center">
                  Camera fail? Manual entry
                </p>
                <div className="flex gap-2">
                  <input value={manualRoll} onChange={e => setManualRoll(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleManualCheck(); }}
                    placeholder="Roll no."
                    className="flex-1 min-w-0 border-2 border-brand-dark rounded-brutal px-3 py-2 font-mono text-sm bg-white outline-none" />
                  <button onClick={handleManualCheck} disabled={manualBusy || !manualRoll.trim()}
                    className="font-sans font-bold text-xs px-4 py-2 bg-brand-dark text-brand-bg rounded-brutal border-2 border-brand-dark disabled:opacity-50 shrink-0"
                  >
                    {manualBusy ? '…' : 'Check'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Scanning controls */}
          {scanning && (
            <div className="px-4 mt-3">
              <motion.p
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="font-sans text-sm text-brand-light text-center mb-3"
              >
                Point at student's QR code…
              </motion.p>
              <button onClick={stopCamera}
                className="w-full font-sans font-semibold text-sm py-3 rounded-brutal border-2 border-brand-dark hover:bg-brand-secondary/40 transition-colors"
              >
                ✕ Cancel
              </button>
            </div>
          )}

          {/* Scan next */}
          {result && (
            <div className="px-4 mt-3">
              <button onClick={startCamera}
                className="w-full flex items-center justify-center gap-2 font-sans font-bold text-sm py-3 bg-brand-dark text-brand-bg rounded-brutal border-2 border-brand-dark shadow-brutal"
              >
                <Camera size={15} />
                Scan Next Student
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══ STUDENTS TAB ══ */}
      {tab === 'students' && (
        <div className="flex-1">
          <div className="px-4 pt-4 pb-2">
            <h2 className="font-serif font-bold text-xl">
              {currentMeal
                ? <>{currentMeal.emoji} {currentMeal.label} <span className="text-brand-gold">Attendance</span></>
                : <>Today's <span className="text-brand-gold">Students</span></>}
            </h2>
            <p className="font-sans text-xs text-brand-light mt-0.5">
              {format(new Date(), 'EEEE, dd MMMM yyyy')}
              {currentMeal && ` · ${currentMeal.start}:00–${currentMeal.end}:00`}
            </p>
          </div>
          <StudentsPanel today={today} currentMeal={currentMeal} />
        </div>
      )}
    </div>
  );
}
