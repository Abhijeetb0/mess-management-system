import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, AlertCircle, Upload, Calendar, Hash, FileText, ShieldAlert, CheckCircle, Clock, Eye, X } from 'lucide-react';
import { format, addDays } from 'date-fns';
import AnimatedPage from '../../components/AnimatedPage';
import { BrutalCard, BrutalButton } from '../../components/ui';
import { Toast } from '../../components/Feedback';
import { useAuth } from '../../context/AuthContext';
import { submitOptOut, listenMyOptOuts, cancelOptOut, getOptOutEndDate } from '../../lib/firestoreService';

/* ─────────────────────────────────────────────────────────
   Student — Opt-Out Page (Phase 2: writes to Firestore)
   Doc uploaded as base64 string (Spark plan — no Storage)
───────────────────────────────────────────────────────── */

const REFUND_PER_DAY = 100;
const getTodayISO = () => format(new Date(), 'yyyy-MM-dd');
const getTomorrowISO = () => format(addDays(new Date(), 1), 'yyyy-MM-dd');
const DAYS_OPTIONS = [1,2,3,4,5,6,7,10,14,21,30];

function useDeadlineLock() {
  const [isLocked, setIsLocked] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    const check = () => {
      const now = new Date(), deadline = new Date();
      deadline.setHours(21, 0, 0, 0);
      if (now >= deadline) { setIsLocked(true); setTimeLeft(''); return; }
      setIsLocked(false);
      const diff = deadline - now;
      const h = Math.floor(diff/3_600_000), m = Math.floor((diff%3_600_000)/60_000), s = Math.floor((diff%60_000)/1_000);
      setTimeLeft(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, []);
  return { isLocked, timeLeft };
}

const STATUS_COLOR = {
  pending:  'bg-brand-purple',
  approved: 'bg-brand-accent',
  rejected: 'bg-brand-secondary',
  cancelled: 'bg-brand-bg',
};

const fmtRange = (startDate, numDays) => {
  if (!startDate) return '';
  try {
    const end = getOptOutEndDate(startDate, numDays);
    const f = (iso) => format(new Date(iso + 'T00:00:00'), 'dd MMM');
    return startDate === end ? f(startDate) : `${f(startDate)} → ${f(end)}`;
  } catch { return startDate; }
};

function DocViewModal({ base64, name, onClose }) {
  return (
    <div className="fixed inset-0 bg-brand-dark/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-brand-bg border-2 border-brand-dark rounded-brutal shadow-brutal-lg p-5 w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-3 gap-2">
          <p className="font-sans font-bold text-sm truncate">{name || 'Document'}</p>
          <button onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-auto">
          {base64?.startsWith('data:image') ? (
            <img src={base64} alt={name} className="w-full rounded" />
          ) : base64?.startsWith('data:application/pdf') ? (
            <iframe src={base64} title={name} className="w-full h-[60vh] border rounded" />
          ) : base64 ? (
            <div className="text-center py-10">
              <p className="font-sans text-sm text-brand-light mb-3">Preview not available for this file type.</p>
              <a href={base64} download={name || 'document'} className="font-sans text-xs font-bold underline">Download file</a>
            </div>
          ) : (
            <p className="font-sans text-sm text-brand-light text-center py-10">No document attached.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OptOut({ direction }) {
  const { user } = useAuth();
  const { isLocked, timeLeft } = useDeadlineLock();

  const [startDate, setStartDate] = useState(() => getTomorrowISO());
  const [numDays,   setNumDays]   = useState(1);
  const [reason,    setReason]    = useState('');
  const [docFile,   setDocFile]   = useState(null);
  const [agreed,    setAgreed]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors,    setErrors]    = useState({});
  const [history,   setHistory]   = useState([]);
  const [docView, setDocView] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3500);
  };

  // Live history of own opt-out requests
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = listenMyOptOuts(user.uid, setHistory);
    return () => unsub?.();
  }, [user?.uid]);

  const estimatedRefund = numDays * REFUND_PER_DAY;

  const validate = () => {
    const e = {};
    if (!startDate)     e.startDate = 'Please select a start date.';
    else if (startDate <= getTodayISO()) e.startDate = 'Same-day opt-out is not allowed. Please select tomorrow or a later date.';
    if (!reason.trim()) e.reason    = 'Please provide a reason.';
    if (!docFile)       e.docFile   = 'Please upload a valid document.';
    if (!agreed)        e.agreed    = 'You must agree to the terms.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const toBase64 = (file) => new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload  = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLocked || !validate()) return;
    // Extra guard: same-day opt-out kabhi allow nahi (UI bypass ho tab bhi)
    if (startDate <= getTodayISO()) {
      showToast('Same-day opt-out is not allowed. Select tomorrow or later.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      let docBase64 = null, docFileName = null;
      if (docFile) {
        if (docFile.size > 500_000) {
          showToast('File too large. Max 500 KB.', 'error');
          setSubmitting(false);
          return;
        }
        docBase64   = await toBase64(docFile);
        docFileName = docFile.name;
      }
      await submitOptOut(user.uid, {
        startDate, numDays, reason, docBase64, docFileName,
        studentName: user.displayName,
        rollNumber:  user.rollNumber,
        estimatedRefund,
      });
      showToast(`Request submitted for ${numDays} day(s). Awaiting approval.`);
      setReason(''); setDocFile(null); setAgreed(false); setNumDays(1);
      setStartDate(getTomorrowISO());
      setErrors({});
    } catch (err) {
      if (err?.message === 'SAME_DAY_NOT_ALLOWED') showToast('Same-day opt-out is not allowed. Select tomorrow or later.', 'error');
      else if (err?.message === 'OVERLAP_EXISTS') showToast(`Is range me already request hai (${err.clash?.startDate}, ${err.clash?.status}).`, 'error');
      else if (err?.message === 'INVALID_DAYS') showToast('Days 1–30 ke beech hone chahiye.', 'error');
      else if (err?.message === 'REASON_REQUIRED') showToast('Please provide a reason.', 'error');
      else showToast('Failed to submit. Check your connection.', 'error');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount  = history.filter(r => r.status === 'pending').length;
  const pendingReq    = history.find(r => r.status === 'pending');

  return (
    <>
      <Toast {...toast} />
      <AnimatedPage direction={direction} className="px-5 pt-5 pb-8">
        <div className="mb-5">
          <h2 className="font-serif font-bold text-2xl text-brand-dark">
            <span className="highlight-pink">Mess Opt-Out</span>
          </h2>
          <p className="font-sans text-sm text-brand-light mt-0.5">
            Apply for a mess leave — same-day not allowed, window closes at 9:00 PM daily
          </p>
        </div>

        {/* Deadline Banner */}
        <motion.div layout className={`mb-5 border-2 border-brand-dark rounded-brutal p-4 shadow-brutal-sm ${isLocked ? 'bg-brand-secondary' : 'bg-brand-primary'}`}>
          <div className="flex items-center gap-3">
            {isLocked ? <Lock size={18} className="shrink-0" /> : <AlertCircle size={18} className="shrink-0" />}
            <div>
              {isLocked
                ? <><p className="font-sans font-bold text-sm">Opt-Out Window Closed</p><p className="font-sans text-xs text-brand-light mt-0.5">Window closes at 9:00 PM. Try again tomorrow.</p></>
                : <><p className="font-sans font-bold text-sm">Window Open — Closes at 9:00 PM</p><p className="font-sans text-xs text-brand-dark/70 mt-0.5">Time remaining: <span className="font-mono font-bold">{timeLeft}</span></p></>
              }
            </div>
          </div>
        </motion.div>

        {/* My Requests history — doc hamesha accessible (pending/approved/rejected) */}
        {history.length > 0 && (
          <div className="mb-5">
            <h3 className="font-serif font-bold text-lg mb-2">My Requests</h3>
            <div className="flex flex-col gap-2">
              {history.map(r => (
                <BrutalCard key={r.id} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-sans font-bold text-sm">{r.numDays} day(s) · {fmtRange(r.startDate, r.numDays)}</p>
                      <p className="font-mono text-[11px] text-brand-light mt-0.5">from {r.startDate}</p>
                      <p className="font-sans text-xs text-brand-light mt-0.5 truncate max-w-[180px]">{r.reason}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`font-sans text-[10px] font-bold px-2 py-0.5 rounded-pill border border-brand-dark/20 ${STATUS_COLOR[r.status] || STATUS_COLOR.pending}`}>
                        {r.status}
                      </span>
                      {r.status === 'approved' && (
                        <span className="font-serif font-bold text-brand-gold text-sm">₹{r.estimatedRefund}</span>
                      )}
                    </div>
                  </div>
                  {r.status === 'rejected' && r.rejectReason && (
                    <p className="font-sans text-xs text-red-700 bg-red-50 border border-red-200 rounded-brutal px-2.5 py-1.5 mt-3">
                      Reason: {r.rejectReason}
                    </p>
                  )}
                  {r.docBase64 && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-brand-dark/10">
                      <FileText size={13} className="text-brand-dark/60 shrink-0" />
                      <span className="font-sans text-xs truncate max-w-[120px]">{r.docFileName || 'Document'}</span>
                      <button
                        onClick={() => setDocView({ base64: r.docBase64, name: r.docFileName })}
                        className="flex items-center gap-1 font-sans text-xs font-semibold text-brand-light hover:text-brand-dark ml-auto"
                      >
                        <Eye size={12} /> View
                      </button>
                      {r.status === 'pending' && (
                        <button
                          disabled={cancelling === r.id}
                          onClick={async () => {
                            if (!window.confirm('Apni pending request cancel karein?')) return;
                            setCancelling(r.id);
                            try { await cancelOptOut(r.id); showToast('Request cancelled.'); }
                            catch { showToast('Cancel failed. Try again.', 'error'); }
                            finally { setCancelling(null); }
                          }}
                          className="font-sans text-xs font-bold text-red-600 hover:underline disabled:opacity-50"
                        >
                          {cancelling === r.id ? '…' : 'Cancel'}
                        </button>
                      )}
                    </div>
                  )}
                  {r.status === 'pending' && !r.docBase64 && (
                    <div className="mt-3 pt-3 border-t border-brand-dark/10 flex justify-end">
                      <button
                        disabled={cancelling === r.id}
                        onClick={async () => {
                          if (!window.confirm('Apni pending request cancel karein?')) return;
                          setCancelling(r.id);
                          try { await cancelOptOut(r.id); showToast('Request cancelled.'); }
                          catch { showToast('Cancel failed. Try again.', 'error'); }
                          finally { setCancelling(null); }
                        }}
                        className="font-sans text-xs font-bold text-red-600 hover:underline disabled:opacity-50"
                      >
                        {cancelling === r.id ? '…' : 'Cancel request'}
                      </button>
                    </div>
                  )}
                </BrutalCard>
              ))}
            </div>
          </div>
        )}

        {/* Not yet approved — block the form */}
        {!user?.isApproved && (
          <div className="mb-5 border-2 border-brand-dark rounded-brutal p-5 bg-brand-secondary/30 text-center">
            <p className="text-2xl mb-2">⏳</p>
            <p className="font-sans font-bold text-sm text-brand-dark">Account Pending Approval</p>
            <p className="font-sans text-xs text-brand-light mt-1">
              Your registration is awaiting committee approval. Once approved, you can submit opt-out requests.
            </p>
          </div>
        )}

        {/* Form — only shown when approved */}
        {user?.isApproved && !pendingReq && (
          <form onSubmit={handleSubmit}>
            <BrutalCard className={`p-5 ${isLocked ? 'opacity-60 pointer-events-none' : ''}`}>

              {/* Start Date */}
              <div className="mb-4">
                <label className="flex items-center gap-1.5 font-sans font-semibold text-xs uppercase tracking-wider text-brand-light mb-1.5">
                  <Calendar size={13} /> Start Date
                </label>
                <input type="date" value={startDate} min={getTomorrowISO()} onChange={e => setStartDate(e.target.value)}
                  className="w-full border-2 border-brand-dark rounded-brutal px-3 py-2.5 font-sans text-sm bg-brand-bg outline-none focus:shadow-brutal-sm" />
                {errors.startDate && <p className="font-sans text-xs text-red-600 mt-1">{errors.startDate}</p>}
                {!errors.startDate && startDate && (
                  <p className="font-sans text-xs text-brand-light mt-1">Leave range: <span className="font-bold text-brand-dark">{fmtRange(startDate, numDays)}</span></p>
                )}
              </div>

              {/* Days */}
              <div className="mb-4">
                <label className="flex items-center gap-1.5 font-sans font-semibold text-xs uppercase tracking-wider text-brand-light mb-1.5">
                  <Hash size={13} /> Number of Days
                </label>
                <select value={numDays} onChange={e => setNumDays(Number(e.target.value))}
                  className="w-full border-2 border-brand-dark rounded-brutal px-3 py-2.5 font-sans text-sm bg-brand-bg outline-none appearance-none">
                  {DAYS_OPTIONS.map(d => <option key={d} value={d}>{d} {d === 1 ? 'day' : 'days'}</option>)}
                </select>
                <p className="font-sans text-xs text-brand-gold font-semibold mt-1.5">
                  Estimated refund: ₹{estimatedRefund} · {fmtRange(startDate, numDays)}
                </p>
              </div>

              {/* Reason */}
              <div className="mb-4">
                <label className="flex items-center gap-1.5 font-sans font-semibold text-xs uppercase tracking-wider text-brand-light mb-1.5">
                  <FileText size={13} /> Reason
                </label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
                  placeholder="Going home, medical leave, family function..."
                  className="w-full border-2 border-brand-dark rounded-brutal px-3 py-2.5 font-sans text-sm bg-brand-bg outline-none resize-none" />
                {errors.reason && <p className="font-sans text-xs text-red-600 mt-1">{errors.reason}</p>}
              </div>

              {/* Document */}
              <div className="mb-5">
                <label className="flex items-center gap-1.5 font-sans font-semibold text-xs uppercase tracking-wider text-brand-light mb-1.5">
                  <Upload size={13} /> Valid Document <span className="text-brand-light font-normal normal-case">(max 500 KB)</span>
                </label>
                <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-brutal p-5 cursor-pointer transition-colors ${docFile ? 'border-brand-dark bg-brand-accent/30' : 'border-brand-dark/40 bg-brand-bg hover:border-brand-dark'}`}>
                  <Upload size={20} className={docFile ? 'text-green-700' : 'text-brand-light'} />
                  <p className="font-sans text-xs text-center text-brand-light">
                    {docFile
                      ? <span className="text-green-700 font-semibold">✓ {docFile.name}</span>
                      : <>Tap to upload leave letter, ticket, or medical certificate</>
                    }
                  </p>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={e => setDocFile(e.target.files?.[0] ?? null)} />
                </label>
                {errors.docFile && <p className="font-sans text-xs text-red-600 mt-1">{errors.docFile}</p>}
              </div>

              {/* Agreement */}
              <div className={`border-2 rounded-brutal p-4 mb-5 ${errors.agreed ? 'border-red-500 bg-red-50' : 'border-brand-dark/30 bg-brand-secondary/20'}`}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <div className="relative mt-0.5 shrink-0">
                    <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="peer sr-only" />
                    <div className={`w-5 h-5 rounded border-2 border-brand-dark flex items-center justify-center ${agreed ? 'bg-brand-dark' : 'bg-white'}`}>
                      {agreed && <span className="text-white text-xs">✓</span>}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <ShieldAlert size={14} className="text-brand-dark shrink-0" />
                      <span className="font-sans font-bold text-xs">I understand and agree:</span>
                    </div>
                    <p className="font-sans text-xs text-brand-dark/80 leading-relaxed">
                      If I am found eating in the mess during my opted-out period, the committee may cancel my refund and impose a penalty.
                    </p>
                  </div>
                </label>
                {errors.agreed && <p className="font-sans text-xs text-red-600 mt-2">{errors.agreed}</p>}
              </div>

              <BrutalButton type="submit" variant="secondary" fullWidth size="lg" disabled={isLocked || submitting}>
                {submitting ? '⏳ Submitting...' : isLocked ? '🔒 Window Closed' : 'Submit Opt-Out Request →'}
              </BrutalButton>
            </BrutalCard>
          </form>
        )}

        {pendingReq && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
          >
            <BrutalCard color="bg-brand-purple" className="p-6 relative overflow-hidden text-center">
              {/* Background accent */}
              <div className="absolute -right-8 -bottom-8 opacity-10 text-brand-dark rotate-12">
                <Clock size={140} strokeWidth={1} />
              </div>

              <div className="relative z-10 flex flex-col items-center">
                <div className="w-14 h-14 rounded-full bg-white border-2 border-brand-dark flex items-center justify-center mb-3 shadow-brutal-sm">
                  <CheckCircle size={28} className="text-green-600" />
                </div>
                <h3 className="font-serif font-bold text-xl mb-1 text-brand-dark">Submitted Successfully</h3>
                
                <div className="inline-flex items-center gap-1.5 font-sans font-bold text-[10px] uppercase tracking-widest bg-brand-dark text-white px-3 py-1 rounded-pill mb-5">
                  <Clock size={12} className="text-brand-primary" />
                  Status: Pending
                </div>
                
                <div className="w-full bg-white border-2 border-brand-dark rounded-brutal p-4 text-left shadow-brutal-sm">
                  <div className="flex justify-between items-end border-b-2 border-brand-dark/10 pb-3 mb-3">
                    <div>
                      <p className="font-sans text-[10px] uppercase text-brand-light font-bold tracking-wider mb-0.5">Duration</p>
                      <p className="font-serif font-bold text-lg leading-none text-brand-dark">{pendingReq.numDays} Day{pendingReq.numDays > 1 ? 's' : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-sans text-[10px] uppercase text-brand-light font-bold tracking-wider mb-0.5">Start Date</p>
                      <p className="font-mono text-sm font-bold text-brand-dark">{pendingReq.startDate}</p>
                    </div>
                  </div>
                  <div>
                    <p className="font-sans text-[10px] uppercase text-brand-light font-bold tracking-wider mb-1">Reason</p>
                    <p className="font-sans text-xs text-brand-dark/80">{pendingReq.reason}</p>
                  </div>
                  {pendingReq.docBase64 && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t-2 border-brand-dark/10">
                      <FileText size={13} className="text-brand-dark/60 shrink-0" />
                      <span className="font-sans text-xs truncate max-w-[150px]">{pendingReq.docFileName || 'Document'}</span>
                      <button
                        onClick={() => setDocView({ base64: pendingReq.docBase64, name: pendingReq.docFileName })}
                        className="flex items-center gap-1 font-sans text-xs font-semibold hover:underline ml-auto"
                      >
                        <Eye size={12} /> View
                      </button>
                    </div>
                  )}
                </div>
                
                <p className="font-sans text-[10px] text-brand-dark mt-5 max-w-[220px]">
                  Waiting for committee approval. You will receive <span className="font-bold text-brand-dark">₹{pendingReq.estimatedRefund}</span> in your wallet if approved.
                </p>
                <button
                  disabled={cancelling === pendingReq.id}
                  onClick={async () => {
                    if (!window.confirm('Apni pending request cancel karein?')) return;
                    setCancelling(pendingReq.id);
                    try { await cancelOptOut(pendingReq.id); showToast('Request cancelled.'); }
                    catch { showToast('Cancel failed. Try again.', 'error'); }
                    finally { setCancelling(null); }
                  }}
                  className="mt-3 font-sans text-xs font-bold text-brand-dark/70 underline hover:text-brand-dark disabled:opacity-50"
                >
                  {cancelling === pendingReq.id ? 'Cancelling…' : 'Cancel this request'}
                </button>
              </div>
            </BrutalCard>
          </motion.div>
        )}
      </AnimatedPage>
      {docView && <DocViewModal {...docView} onClose={() => setDocView(null)} />}
    </>
  );
}
