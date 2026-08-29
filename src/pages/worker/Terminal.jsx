import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import jsQR from 'jsqr';
import { CheckCircle, XCircle, LogOut, CameraOff } from 'lucide-react';
import { BrutalCard, BrutalButton } from '../../components/ui';
import { getTodayBlocklist } from '../../lib/firestoreService';
import { useAuth } from '../../context/AuthContext';
import { getTodayToken, ANIM_COMPONENT_MAP } from '../../utils/tokenUtils';

/* ─────────────────────────────────────────────────────────
   Worker — QR Terminal
   Uses native getUserMedia + jsQR for reliable scanning.
   Camera is fully released (all tracks stopped) on cancel/close.
───────────────────────────────────────────────────────── */

export default function Terminal() {
  const { user, logout } = useAuth();
  const [scanning,    setScanning]    = useState(false);
  const [result,      setResult]      = useState(null);
  const [camError,    setCamError]    = useState('');
  const [blocklist,   setBlocklist]   = useState(null);
  const [loadingList, setLoadingList] = useState(true);

  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const streamRef  = useRef(null);   // MediaStream — so we can stop it
  const rafRef     = useRef(null);   // requestAnimationFrame id
  const activeRef  = useRef(false);  // guard against stale closures

  const { asset, animationType } = getTodayToken();
  const AnimComp = ANIM_COMPONENT_MAP[animationType] ?? ANIM_COMPONENT_MAP['marquee-rtl'];

  /* ── Load blocklist ─────────────────────────────────── */
  useEffect(() => {
    const fetchList = async () => {
      try {
        const list = await getTodayBlocklist();
        setBlocklist(list);
        sessionStorage.setItem('cachedBlocklist', JSON.stringify(list));
      } catch {
        const cached = sessionStorage.getItem('cachedBlocklist');
        if (cached) setBlocklist(JSON.parse(cached));
      } finally {
        setLoadingList(false);
      }
    };
    fetchList();
  }, []);

  /* ── Cleanup on unmount ─────────────────────────────── */
  useEffect(() => {
    return () => stopCamera();
  }, []);

  /* ── Stop camera & release all resources ────────────── */
  const stopCamera = useCallback(() => {
    activeRef.current = false;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScanning(false);
  }, []);

  /* ── Start camera via getUserMedia ──────────────────── */
  const startCamera = useCallback(async () => {
    setCamError('');
    setResult(null);

    // getUserMedia requires a secure context (HTTPS or localhost)
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError(
        'Camera not available. This app must be accessed over HTTPS — ask your admin to check the connection.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      activeRef.current = true;

      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();

      setScanning(true);
      scanLoop();
    } catch (err) {
      console.error('Camera error:', err);
      if (err.name === 'NotAllowedError') {
        setCamError('Camera permission denied. Please allow camera access and try again.');
      } else if (err.name === 'NotFoundError') {
        setCamError('No camera found on this device.');
      } else {
        setCamError(`Camera error: ${err.message}`);
      }
    }
  }, []); // eslint-disable-line

  /* ── Frame-by-frame QR scan loop ───────────────────── */
  const scanLoop = useCallback(() => {
    if (!activeRef.current) return;

    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    const ctx = canvas.getContext('2d');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });

    if (code?.data) {
      onScan(code.data);
      return;
    }

    rafRef.current = requestAnimationFrame(scanLoop);
  }, []); // eslint-disable-line

  /* ── Handle a successful scan ───────────────────────── */
  const onScan = useCallback((uid) => {
    stopCamera();
    const allowed = blocklist ? !blocklist.includes(uid) : false;
    const reason  = !blocklist ? 'Blocklist not loaded — offline mode' : undefined;
    setResult({ allowed, uid, reason });
    setTimeout(() => setResult(null), 7000);
  }, [blocklist, stopCamera]);

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">

      {/* ── Header ── */}
      <div className="px-5 pt-5 pb-4 border-b-2 border-brand-dark flex items-center justify-between">
        <div>
          <h1 className="font-serif font-bold text-xl leading-none">
            Mess<span className="text-brand-gold">App</span>
            <span className="font-sans font-normal text-base text-brand-light ml-2">Worker</span>
          </h1>
          <p className="font-sans text-xs text-brand-light mt-0.5">
            {user?.displayName} · {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
          </p>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 font-sans text-xs font-semibold text-brand-dark/60 hover:text-brand-dark border-2 border-brand-dark/30 hover:border-brand-dark rounded-brutal px-3 py-2 transition-all"
        >
          <LogOut size={13} />
          Sign out
        </button>
      </div>

      {/* ── Today's token card ── */}
      <div className="px-5 py-5 flex justify-center">
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          className={`relative w-full max-w-[340px] rounded-[24px] border-2 border-brand-dark shadow-brutal flex flex-col items-center pt-5 pb-4 px-4 ${asset.bg}`}
          style={{ userSelect: 'none' }}
        >
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden select-none rounded-[22px]">
            <span className="font-serif font-bold text-brand-dark/[0.07]" style={{ fontSize: 'clamp(2rem,18vw,5rem)', whiteSpace: 'nowrap' }}>
              GEC MESS
            </span>
          </div>
          <p className="font-sans font-semibold text-[10px] uppercase tracking-[0.2em] text-brand-dark/50 mb-1 z-10">Today's Pass Token</p>
          <p className="font-sans text-[10px] text-brand-dark/40 mb-2 z-10">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <div className="z-10 w-full" style={{ overflowX: 'hidden', overflowY: 'visible', minHeight: 110, paddingTop: 8, paddingBottom: 8 }}>
            <AnimComp emoji={asset.emoji} size="text-5xl" />
          </div>
          <div className="w-full border-t-2 border-dashed border-brand-dark/20 my-2 z-10" />
          <div className="z-10 flex items-center justify-between w-full px-1 pt-1">
            <p className="font-sans text-[10px] text-brand-dark/50">GEC Sheikhpura Mess</p>
            <p className="font-mono text-[10px] font-bold text-brand-dark/60">
              {blocklist !== null ? `${blocklist.length} opted out` : loadingList ? 'syncing...' : 'offline'}
            </p>
          </div>
        </motion.div>
      </div>

      {/* ── Scan result banner ── */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`mx-5 rounded-brutal border-2 border-brand-dark p-5 flex items-center gap-4 mb-2 ${result.allowed ? 'bg-brand-accent' : 'bg-brand-secondary'}`}
          >
            {result.allowed
              ? <CheckCircle size={36} className="text-green-700 shrink-0" />
              : <XCircle    size={36} className="text-red-700 shrink-0" />}
            <div>
              <p className="font-serif font-bold text-lg leading-tight">
                {result.allowed ? '✓ Entry Allowed' : '✗ Opted Out'}
              </p>
              <p className="font-sans text-xs text-brand-dark/70 mt-0.5">
                {result.reason ?? (result.allowed ? 'Student may enter the mess.' : 'Deny entry — student has opted out today.')}
              </p>
              <p className="font-mono text-[10px] text-brand-dark/50 mt-1 truncate max-w-[220px]">{result.uid}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Camera error ── */}
      {camError && (
        <div className="mx-5 mb-3 flex items-center gap-3 border-2 border-brand-dark rounded-brutal p-4 bg-brand-secondary">
          <CameraOff size={20} className="shrink-0 text-brand-dark" />
          <p className="font-sans text-sm text-brand-dark">{camError}</p>
        </div>
      )}

      {/* ── Scanner area ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 pb-8">

        {/* Live video feed — always in DOM, shown/hidden via CSS */}
        <div className={`relative w-full max-w-sm mb-4 ${scanning ? 'block' : 'hidden'}`}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full aspect-square object-cover rounded-brutal border-2 border-brand-dark bg-brand-dark"
          />
          {/* Corner overlays */}
          {[['top-2 left-2', 'border-t-4 border-l-4'],
            ['top-2 right-2', 'border-t-4 border-r-4'],
            ['bottom-2 left-2', 'border-b-4 border-l-4'],
            ['bottom-2 right-2', 'border-b-4 border-r-4']].map(([pos, bdr], i) => (
            <div key={i} className={`absolute ${pos} w-8 h-8 ${bdr} border-brand-gold rounded-sm`} />
          ))}
          {/* Scan line */}
          <motion.div
            className="absolute left-3 right-3 h-0.5 bg-brand-gold/70 rounded"
            animate={{ top: ['8%', '92%', '8%'] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          />
        </div>

        {/* Hidden canvas for jsQR pixel extraction */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Idle state */}
        {!scanning && !result && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center"
          >
            <div className="relative mb-6">
              <div className="w-48 h-48 border-2 border-brand-dark/20 rounded-brutal bg-brand-bg flex items-center justify-center relative overflow-hidden">
                <motion.div
                  className="absolute left-0 right-0 h-0.5 bg-brand-dark/30"
                  animate={{ top: ['10%', '90%', '10%'] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                />
                {[['top-2 left-2', 'border-t-2 border-l-2'],
                  ['top-2 right-2', 'border-t-2 border-r-2'],
                  ['bottom-2 left-2', 'border-b-2 border-l-2'],
                  ['bottom-2 right-2', 'border-b-2 border-r-2']].map(([pos, bdr], i) => (
                  <div key={i} className={`absolute ${pos} w-7 h-7 ${bdr} border-brand-dark rounded-sm`} />
                ))}
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand-dark/30">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/>
                  <path d="M14 14h1v1h-1zM17 14h1v1h-1zM14 17h1v1h-1zM17 17h1v1h-1zM20 14h1v1h-1zM14 20h1v1h-1zM20 17h3v4h-3z"/>
                  <rect x="5" y="5" width="3" height="3" rx="0.5" fill="currentColor" stroke="none"/>
                  <rect x="16" y="5" width="3" height="3" rx="0.5" fill="currentColor" stroke="none"/>
                  <rect x="5" y="16" width="3" height="3" rx="0.5" fill="currentColor" stroke="none"/>
                </svg>
              </div>
            </div>
            <p className="font-serif font-bold text-xl text-brand-dark mb-1">
              {loadingList ? 'Getting ready...' : 'Ready to Scan'}
            </p>
            <p className="font-sans text-sm text-brand-light text-center mb-6 max-w-[220px]">
              {loadingList ? "Fetching today's opt-out list..." : `${blocklist?.length ?? 0} students opted out today`}
            </p>
            <BrutalButton onClick={startCamera} disabled={loadingList} size="lg" className="px-10">
              {loadingList ? '⏳ Loading...' : '📷 Start Scanning'}
            </BrutalButton>
          </motion.div>
        )}

        {/* Active scanning controls */}
        {scanning && (
          <div className="text-center mt-3 w-full max-w-sm">
            <motion.p
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="font-sans text-sm text-brand-light mb-4"
            >
              Point camera at student's QR code…
            </motion.p>
            <BrutalButton variant="ghost" onClick={stopCamera} fullWidth>
              ✕ Cancel
            </BrutalButton>
          </div>
        )}

        {/* Post-scan: scan next */}
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 w-full max-w-sm"
          >
            <BrutalButton onClick={startCamera} fullWidth size="lg">
              📷 Scan Next Student
            </BrutalButton>
          </motion.div>
        )}
      </div>
    </div>
  );
}
