import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Users, TrendingUp, UtensilsCrossed, AlertCircle, Clock, CheckCircle2, XCircle, FileText, Eye, X, Search } from 'lucide-react';
import AnimatedPage from '../../components/AnimatedPage';
import { BrutalCard, BrutalBadge, BrutalButton } from '../../components/ui';
import { listenPendingOptOuts, listenActiveOptOuts, approveOptOut, rejectOptOut, getAllStudents, getOptOutEndDate } from '../../lib/firestoreService';
import { format } from 'date-fns';
import { useAuth } from '../../context/AuthContext';

/* ─────────────────────────────────────────────────────────
   Committee — Dashboard (Opt-Out Request Queue)
   Phase 2: Live Firestore data
───────────────────────────────────────────────────────── */

const STATUS_CONF = {
  pending:  { label: 'Pending',  color: 'bg-brand-purple',    Icon: Clock         },
  approved: { label: 'Approved', color: 'bg-brand-accent',    Icon: CheckCircle2  },
  rejected: { label: 'Rejected', color: 'bg-brand-secondary', Icon: XCircle       },
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
          ) : (
            <p className="font-sans text-sm text-brand-light text-center py-10">Preview not available.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function RejectModal({ request, onClose, onConfirm, busy }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  return (
    <div className="fixed inset-0 bg-brand-dark/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-brand-bg border-2 border-brand-dark rounded-brutal shadow-brutal-lg p-5 w-full max-w-md">
        <h4 className="font-serif font-bold text-lg mb-1">Reject request?</h4>
        <p className="font-sans text-xs text-brand-light mb-3">{request?.studentName} · {request?.rollNumber} · {request?.numDays}d from {request?.startDate}</p>
        <label className="font-sans font-semibold text-xs uppercase tracking-wider text-brand-light">Reason (mandatory)</label>
        <textarea value={reason} onChange={e => { setReason(e.target.value); setError(''); }} rows={3}
          placeholder="e.g. Document unclear, dates overlap with exam mess..."
          className="mt-1.5 w-full border-2 border-brand-dark rounded-brutal px-3 py-2.5 font-sans text-sm bg-white outline-none resize-none" />
        {error && <p className="font-sans text-xs text-red-600 mt-1">{error}</p>}
        <div className="flex gap-2 mt-4">
          <BrutalButton variant="ghost" fullWidth onClick={onClose}>Cancel</BrutalButton>
          <BrutalButton variant="danger" fullWidth disabled={busy}
            onClick={() => {
              if (!reason.trim()) { setError('Reject reason dena mandatory hai.'); return; }
              onConfirm(reason.trim());
            }}>
            {busy ? '…' : 'Reject'}
          </BrutalButton>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 300, damping: 22 }}
    >
      <BrutalCard color={color} className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="p-2 rounded-brutal bg-white/40 border border-brand-dark/20">
            <Icon size={18} className="text-brand-dark" />
          </div>
        </div>
        <p className="font-serif font-bold text-3xl text-brand-dark">{value}</p>
        <p className="font-sans font-semibold text-sm text-brand-dark mt-1">{label}</p>
      </BrutalCard>
    </motion.div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [requests,  setRequests]  = useState([]);
  const [activeCount, setActiveCount] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [actioning, setActioning] = useState(null); // id being approved/rejected
  const [search, setSearch] = useState('');
  const [docView, setDocView] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);

  const todayISO = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    let alive = true;
    getAllStudents().then(s => { if (alive) { setTotalStudents(s.length); setLoading(false); } }).catch(() => alive && setLoading(false));
    const unsub1 = listenPendingOptOuts(setRequests);
    const unsub2 = listenActiveOptOuts(todayISO, (set) => setActiveCount(set.size));
    return () => { alive = false; unsub1?.(); unsub2?.(); };
  }, []);

  const handleApprove = async (r) => {
    setActioning(r.id);
    try {
      // Wallet transaction me fresh read hota hai — stale balance safe
      await approveOptOut(r.id, {
        uid: r.uid,
        refundAmount: r.estimatedRefund || 0,
        processedBy: user?.displayName || user?.rollNumber || 'Committee',
      });
    } catch (err) {
      console.error('Approve failed:', err);
    } finally {
      setActioning(null);
    }
  };

  const handleRejectConfirm = async (reason) => {
    const r = rejectTarget;
    if (!r) return;
    setActioning(r.id);
    try {
      await rejectOptOut(r.id, reason, user?.displayName || user?.rollNumber || 'Committee');
      setRejectTarget(null);
    } catch (err) {
      console.error('Reject failed:', err);
    } finally {
      setActioning(null);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => requests.filter(r =>
    !q || (r.studentName || '').toLowerCase().includes(q) || (r.rollNumber || '').toLowerCase().includes(q)
  ), [requests, q]);

  const eating = Math.max(0, totalStudents - activeCount);
  const totalRefunds = requests.reduce((s, r) => s + (r.estimatedRefund || 0), 0);

  return (
    <AnimatedPage direction={1} className="p-8">
      <div className="mb-6">
        <h2 className="font-serif font-bold text-3xl text-brand-dark">
          Today's <span className="highlight">Headcount</span>
        </h2>
        <p className="font-sans text-sm text-brand-light mt-1">
          {loading ? 'Loading...' : `${totalStudents} students registered`}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-10">
        <StatCard icon={Users}           label="Total Students"  value={loading ? '...' : totalStudents} color="bg-brand-surface"   delay={0}    />
        <StatCard icon={UtensilsCrossed} label="Eating Today"    value={loading ? '...' : eating}        color="bg-brand-accent"    delay={0.06} />
        <StatCard icon={TrendingUp}      label="Opted Out (active)" value={activeCount}                  color="bg-brand-secondary" delay={0.12} />
        <StatCard icon={AlertCircle}     label="Pending Refunds" value={`₹${totalRefunds}`}              color="bg-brand-primary"   delay={0.18} />
      </div>

      {/* Opt-out request queue */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-serif font-bold text-xl">Student Opt-Out Requests</h3>
        {requests.length > 0 && (
          <span className="font-sans text-xs font-bold bg-brand-secondary border-2 border-brand-dark px-2.5 py-1 rounded-pill">
            {requests.length} pending
          </span>
        )}
      </div>
      <div className="relative max-w-3xl mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-light" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or roll no…"
          className="w-full border-2 border-brand-dark rounded-brutal pl-9 pr-3 py-2.5 font-sans text-sm bg-brand-bg outline-none" />
      </div>

      <div className="flex flex-col gap-4 max-w-3xl">
        {filtered.length === 0 && !loading && (
          <BrutalCard className="p-8 text-center">
            <CheckCircle2 size={32} className="mx-auto mb-2 text-brand-accent" />
            <p className="font-sans font-bold text-sm">{requests.length === 0 ? 'No pending requests 🎉' : 'No matches found'}</p>
            <p className="font-sans text-xs text-brand-light mt-1">{requests.length === 0 ? 'All opt-out requests have been processed.' : 'Try a different search.'}</p>
          </BrutalCard>
        )}

        {filtered.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ delay: i * 0.05 }}
          >
            <BrutalCard className="p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                {/* Student info */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-primary border-2 border-brand-dark flex items-center justify-center font-serif font-bold shrink-0">
                    {(r.studentName || r.rollNumber || '?')[0]}
                  </div>
                  <div>
                    <p className="font-sans font-bold text-sm">{r.studentName || 'Unknown'}</p>
                    <p className="font-mono text-xs text-brand-light">{r.rollNumber}</p>
                  </div>
                </div>

                {/* Status + Refund */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <BrutalBadge color="bg-brand-purple">Pending</BrutalBadge>
                  <span className="font-serif font-bold text-brand-gold">₹{r.estimatedRefund || 0}</span>
                </div>
              </div>

              {/* Request details */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-brand-bg border border-brand-dark/15 rounded-brutal p-2.5 text-center">
                  <p className="font-sans text-[10px] text-brand-light uppercase tracking-wider">Duration</p>
                  <p className="font-serif font-bold text-base">{r.numDays}d</p>
                </div>
                <div className="bg-brand-bg border border-brand-dark/15 rounded-brutal p-2.5 text-center col-span-2">
                  <p className="font-sans text-[10px] text-brand-light uppercase tracking-wider">Range</p>
                  <p className="font-mono text-xs font-bold">{r.startDate} → {getOptOutEndDate(r.startDate, r.numDays)}</p>
                </div>
              </div>

              {/* Reason */}
              <div className="bg-brand-bg border border-brand-dark/15 rounded-brutal p-3 mb-4">
                <p className="font-sans text-[10px] text-brand-light uppercase tracking-wider mb-1">Reason</p>
                <p className="font-sans text-sm text-brand-dark">{r.reason}</p>
              </div>

              {/* Document — modal preview (approve/reject ke baad Ledger history me milega) */}
              {r.docFileName && (
                <div className="flex items-center gap-2 mb-4">
                  <FileText size={14} className="text-brand-light shrink-0" />
                  <span className="font-sans text-xs truncate max-w-[180px]">{r.docFileName}</span>
                  {r.docBase64 && (
                    <button
                      onClick={() => setDocView({ base64: r.docBase64, name: r.docFileName })}
                      className="flex items-center gap-1 font-sans text-xs font-semibold text-brand-light hover:text-brand-dark ml-auto"
                    >
                      <Eye size={12} /> View
                    </button>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <BrutalButton
                  variant="secondary"
                  fullWidth
                  disabled={actioning === r.id}
                  onClick={() => handleApprove(r)}
                >
                  {actioning === r.id ? '…' : '✓ Approve'}
                </BrutalButton>
                <BrutalButton
                  variant="ghost"
                  fullWidth
                  disabled={actioning === r.id}
                  onClick={() => setRejectTarget(r)}
                >
                  ✕ Reject
                </BrutalButton>
              </div>
            </BrutalCard>
          </motion.div>
        ))}
      </div>
      {docView && <DocViewModal {...docView} onClose={() => setDocView(null)} />}
      {rejectTarget && (
        <RejectModal request={rejectTarget} busy={actioning === rejectTarget.id}
          onClose={() => setRejectTarget(null)} onConfirm={handleRejectConfirm} />
      )}
    </AnimatedPage>
  );
}
