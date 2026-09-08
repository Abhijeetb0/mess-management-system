import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, Printer, FileText, Calendar, Eye, X, ChevronDown, CheckCheck, Trash2 } from 'lucide-react';
import AnimatedPage from '../../components/AnimatedPage';
import { BrutalCard, BrutalButton, BrutalBadge } from '../../components/ui';
import { QRCodeSVG } from 'qrcode.react';
import { listenPendingOptOuts, listenAllOptOuts, approveOptOut, rejectOptOut, getUser, applyPenalty, listenPenalties, resolvePenalty, removePenalty } from '../../lib/firestoreService';
import { useAuth } from '../../context/AuthContext';

/* ─────────────────────────────────────────────────────────
   Committee — Ledger & Opt-Out Requests (Phase 2: live)
───────────────────────────────────────────────────────── */

function DocViewModal({ base64, name, onClose }) {
  return (
    <div className="fixed inset-0 bg-brand-dark/60 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-brand-bg border-2 border-brand-dark rounded-brutal shadow-brutal-lg p-5 w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <p className="font-sans font-bold text-sm truncate">{name}</p>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-auto">
          {base64?.startsWith('data:image') ? (
            <img src={base64} alt={name} className="w-full rounded" />
          ) : base64?.startsWith('data:application/pdf') ? (
            <iframe src={base64} title={name} className="w-full h-[60vh] border rounded" />
          ) : (
            <p className="font-sans text-sm text-brand-light text-center py-10">
              Preview not available for this file type.
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function Ledger() {
  const [requests, setRequests] = useState([]);
  const [processed, setProcessed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPrint, setShowPrint] = useState(false);
  const [processing, setProcessing] = useState({});
  const [docView, setDocView] = useState(null);
  const [penaltyUid, setPenaltyUid] = useState('');
  const [penaltyAmt, setPenaltyAmt] = useState('');
  const [penaltyReason, setPenaltyReason] = useState('');
  const [penaltyError, setPenaltyError] = useState('');
  const [penaltyBusy, setPenaltyBusy] = useState(false);
  const [penalties, setPenalties] = useState([]);
  const [penaltyOpen, setPenaltyOpen] = useState({}); // { [penaltyId]: bool }
  const [penaltyAction, setPenaltyAction] = useState({}); // { [penaltyId]: 'resolving'|'removing' }
  const { user } = useAuth();

  useEffect(() => {
    const unsub1 = listenPendingOptOuts((data) => {
      setRequests(data);
      setLoading(false);
    });
    const unsub2 = listenPenalties(setPenalties);
    const unsub3 = listenAllOptOuts((all) => {
      setProcessed(all.filter(r => r.status === 'approved' || r.status === 'rejected').slice(0, 30));
    });
    return () => { unsub1?.(); unsub2?.(); unsub3?.(); };
  }, []);

  const handleApprove = async (r) => {
    if (processing[r.id]) return;
    setProcessing(p => ({ ...p, [r.id]: true }));
    try {
      // Get current wallet balance
      const student = await getUser(r.uid);
      await approveOptOut(r.id, {
        uid: r.uid,
        refundAmount: r.estimatedRefund || 0,
        currentBalance: student?.walletBalance || 0,
      });
    } catch (err) {
      console.error('Approve failed:', err);
    } finally {
      setProcessing(p => ({ ...p, [r.id]: false }));
    }
  };

  const handleReject = async (r) => {
    if (processing[r.id]) return;
    setProcessing(p => ({ ...p, [r.id]: true }));
    try {
      await rejectOptOut(r.id);
    } catch (err) {
      console.error('Reject failed:', err);
    } finally {
      setProcessing(p => ({ ...p, [r.id]: false }));
    }
  };

  return (
    <AnimatedPage direction={1} className="p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="font-serif font-bold text-3xl">
            Opt-Out <span className="highlight">Requests</span>
          </h2>
          <p className="font-sans text-sm text-brand-light mt-1">
            {loading ? 'Loading...' : `${requests.length} pending approval`}
          </p>
        </div>
        {/* <BrutalButton icon={Printer} onClick={() => setShowPrint(true)} variant="secondary">
          Print Passes
        </BrutalButton> */}
      </div>

      {/* Request cards */}
      <div className="flex flex-col gap-4 mb-10 max-w-3xl">
        <AnimatePresence>
          {!loading && requests.length === 0 && (
            <BrutalCard className="p-8 text-center">
              <p className="text-3xl mb-2">🎉</p>
              <p className="font-sans text-sm text-brand-light">All caught up! No pending requests.</p>
            </BrutalCard>
          )}
          {requests.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 60, scale: 0.95 }}
              transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 25 }}
            >
              <BrutalCard className="p-5">
                {/* Student info */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-brand-primary border-2 border-brand-dark flex items-center justify-center font-serif font-bold shrink-0">
                    {(r.studentName || r.rollNumber || '?')[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-sans font-bold text-sm">{r.studentName || 'Unknown'}</p>
                    <p className="font-mono text-xs text-brand-light">{r.rollNumber}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-serif font-bold text-2xl text-brand-gold">₹{r.estimatedRefund || 0}</span>
                    <p className="font-sans text-[10px] text-brand-light">estimated</p>
                  </div>
                </div>

                {/* Leave details */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="flex items-center gap-2 bg-brand-primary/30 rounded-brutal px-3 py-2">
                    <Calendar size={13} className="shrink-0" />
                    <div>
                      <p className="font-sans text-[10px] text-brand-light">Start Date</p>
                      <p className="font-sans font-semibold text-xs">{r.startDate}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-brand-accent/30 rounded-brutal px-3 py-2">
                    <Calendar size={13} className="shrink-0" />
                    <div>
                      <p className="font-sans text-[10px] text-brand-light">Duration</p>
                      <p className="font-sans font-semibold text-xs">{r.numDays} day{r.numDays > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                </div>

                {/* Reason */}
                <div className="mb-3 bg-brand-bg border border-brand-dark/20 rounded-brutal px-3 py-2">
                  <p className="font-sans text-[10px] text-brand-light mb-0.5">Reason</p>
                  <p className="font-sans text-xs text-brand-dark">{r.reason}</p>
                </div>

                {/* Document */}
                {r.docFileName && (
                  <div className="flex items-center gap-2 mb-4">
                    <FileText size={13} className="text-brand-dark/60" />
                    <span className="font-sans text-xs truncate max-w-[150px]">{r.docFileName}</span>
                    {r.docBase64 && (
                      <button
                        onClick={() => setDocView({ base64: r.docBase64, name: r.docFileName })}
                        className="flex items-center gap-1 font-sans text-xs text-brand-light hover:text-brand-dark ml-auto"
                      >
                        <Eye size={12} /> View
                      </button>
                    )}
                    <BrutalBadge color="bg-brand-accent" className="text-[9px]">Uploaded</BrutalBadge>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <BrutalButton
                    variant="success" icon={CheckCircle} fullWidth
                    disabled={!!processing[r.id]}
                    onClick={() => handleApprove(r)}
                  >
                    {processing[r.id] ? '...' : 'Approve & Refund'}
                  </BrutalButton>
                  <BrutalButton
                    variant="danger" icon={XCircle} fullWidth
                    disabled={!!processing[r.id]}
                    onClick={() => handleReject(r)}
                  >
                    Reject
                  </BrutalButton>
                </div>
              </BrutalCard>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Refund status history — approve/reject ke baad bhi doc accessible */}
      <h3 className="font-serif font-bold text-xl mb-3">Refund Status History</h3>
      <div className="flex flex-col gap-2 max-w-3xl mb-10">
        {processed.length === 0 ? (
          <BrutalCard className="p-5 text-center">
            <p className="font-sans text-sm text-brand-light">No processed requests yet.</p>
          </BrutalCard>
        ) : (
          processed.map((r) => (
            <BrutalCard key={r.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-sans font-bold text-sm">{r.studentName || 'Unknown'} <span className="font-mono font-normal text-xs text-brand-light">· {r.rollNumber}</span></p>
                  <p className="font-sans text-xs text-brand-light mt-0.5">{r.numDays} day{r.numDays > 1 ? 's' : ''} from {r.startDate} · ₹{r.estimatedRefund || 0}</p>
                </div>
                <BrutalBadge color={r.status === 'approved' ? 'bg-brand-accent' : 'bg-brand-secondary'}>{r.status}</BrutalBadge>
              </div>
              {r.docBase64 && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-brand-dark/10">
                  <FileText size={13} className="text-brand-dark/60 shrink-0" />
                  <span className="font-sans text-xs truncate max-w-[150px]">{r.docFileName || 'Document'}</span>
                  <button
                    onClick={() => setDocView({ base64: r.docBase64, name: r.docFileName })}
                    className="flex items-center gap-1 font-sans text-xs font-semibold text-brand-light hover:text-brand-dark ml-auto"
                  >
                    <Eye size={12} /> View
                  </button>
                </div>
              )}
            </BrutalCard>
          ))
        )}
      </div>

      {/* Apply Penalty */}
      <h3 className="font-serif font-bold text-xl mb-3">Apply Penalty</h3>
      <BrutalCard className="p-5 max-w-md mb-5">
        <div className="flex flex-col gap-3">
          <input value={penaltyUid} onChange={e => { setPenaltyUid(e.target.value); setPenaltyError(''); }}
            placeholder="Student Roll No (e.g. 25105157XXX)"
            className="border-2 border-brand-dark rounded-brutal px-3 py-2.5 font-sans text-sm bg-brand-bg outline-none" />
          <input value={penaltyAmt} onChange={e => { setPenaltyAmt(e.target.value); setPenaltyError(''); }}
            placeholder="Penalty amount (₹)" type="number" min="1"
            className="border-2 border-brand-dark rounded-brutal px-3 py-2.5 font-sans text-sm bg-brand-bg outline-none" />
          <input value={penaltyReason} onChange={e => { setPenaltyReason(e.target.value); setPenaltyError(''); }}
            placeholder="Reason (e.g. Eating during opt-out period)"
            className="border-2 border-brand-dark rounded-brutal px-3 py-2.5 font-sans text-sm bg-brand-bg outline-none" />
          {penaltyError && (
            <p className="font-sans text-xs text-red-600 font-semibold">{penaltyError}</p>
          )}
          <BrutalButton variant="danger" icon={AlertTriangle} fullWidth disabled={penaltyBusy}
            onClick={async () => {
              const amt = Number(penaltyAmt);
              if (!penaltyUid.trim()) { setPenaltyError('Enter the student roll number.'); return; }
              if (!amt || amt <= 0) { setPenaltyError('Enter a valid amount.'); return; }
              if (!penaltyReason.trim()) { setPenaltyError('Enter a reason for the penalty.'); return; }
              setPenaltyBusy(true);
              setPenaltyError('');
              try {
                // Find student by roll number
                const { getAllStudents } = await import('../../lib/firestoreService');
                const all = await getAllStudents();
                const student = all.find(s => s.rollNumber?.toLowerCase() === penaltyUid.trim().toLowerCase());
                if (!student) { setPenaltyError('Student not found with that roll number.'); return; }
                await applyPenalty(student.uid, {
                  amount: amt,
                  reason: penaltyReason.trim(),
                  appliedBy: user?.displayName || user?.rollNumber || 'Committee',
                });
                setPenaltyUid(''); setPenaltyAmt(''); setPenaltyReason('');
              } catch (err) {
                setPenaltyError(err.message || 'Failed to apply penalty.');
              } finally {
                setPenaltyBusy(false);
              }
            }}
          >
            {penaltyBusy ? 'Applying…' : 'Apply Penalty'}
          </BrutalButton>
        </div>
      </BrutalCard>

      {/* Penalty History */}
      <h3 className="font-serif font-bold text-xl mb-3">Penalty History</h3>
      <div className="flex flex-col gap-2 max-w-3xl mb-10">
        {penalties.length === 0 ? (
          <BrutalCard className="p-5 text-center">
            <p className="font-sans text-sm text-brand-light">No penalties applied yet.</p>
          </BrutalCard>
        ) : (
          penalties.map((p, i) => {
            const isOpen   = !!penaltyOpen[p.id];
            const busy     = penaltyAction[p.id];
            const resolved = !!p.resolved;

            const handleResolve = async () => {
              if (busy || resolved) return;
              setPenaltyAction(a => ({ ...a, [p.id]: 'resolving' }));
              try {
                await resolvePenalty(p.id, p.uid, p.amount);
                setPenaltyOpen(o => ({ ...o, [p.id]: false }));
              } catch (err) { console.error(err); }
              finally { setPenaltyAction(a => ({ ...a, [p.id]: null })); }
            };

            const handleRemove = async () => {
              if (busy) return;
              if (!window.confirm(`Remove this penalty record? The student's wallet will NOT be refunded.`)) return;
              setPenaltyAction(a => ({ ...a, [p.id]: 'removing' }));
              try {
                await removePenalty(p.id);
              } catch (err) { console.error(err); }
              finally { setPenaltyAction(a => ({ ...a, [p.id]: null })); }
            };

            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <BrutalCard
                  color={resolved ? 'bg-brand-accent/60' : 'bg-brand-secondary'}
                  className="overflow-hidden"
                >
                  {/* Main row */}
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-white border-2 border-brand-dark flex items-center justify-center font-serif font-bold text-sm shrink-0">
                          {(p.studentName || '?')[0]}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-sans font-bold text-sm">{p.studentName}</p>
                            {resolved && (
                              <span className="inline-flex items-center gap-1 font-sans text-[9px] font-bold uppercase tracking-wider text-green-700 bg-green-100 border border-green-400 px-1.5 py-0.5 rounded-pill">
                                <CheckCheck size={9} /> Resolved
                              </span>
                            )}
                          </div>
                          <p className="font-mono text-xs text-brand-light">{p.rollNumber}</p>
                          <p className="font-sans text-xs text-brand-dark/70 mt-0.5">{p.reason}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right shrink-0">
                          <p className="font-serif font-bold text-lg text-brand-dark">−₹{p.amount}</p>
                          <p className="font-sans text-[10px] text-brand-light">₹{p.balanceBefore} → ₹{p.balanceAfter}</p>
                          <p className="font-sans text-[10px] text-brand-light">
                            By {p.appliedBy} · {p.appliedAt?.toDate ? new Date(p.appliedAt.toDate()).toLocaleDateString('en-IN') : 'Just now'}
                          </p>
                        </div>
                        {/* Expand chevron */}
                        <motion.button
                          onClick={() => setPenaltyOpen(o => ({ ...o, [p.id]: !isOpen }))}
                          animate={{ rotate: isOpen ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="w-8 h-8 flex items-center justify-center rounded-brutal border-2 border-brand-dark/30 hover:border-brand-dark transition-colors shrink-0"
                        >
                          <ChevronDown size={15} />
                        </motion.button>
                      </div>
                    </div>
                  </div>

                  {/* Expandable action row */}
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="border-t-2 border-brand-dark/20 px-4 py-3 flex items-center gap-3 flex-wrap bg-white/40">
                          <p className="font-sans text-xs text-brand-light flex-1">
                            {resolved ? 'Penalty already resolved.' : 'Choose an action for this penalty:'}
                          </p>
                          {/* Resolve */}
                          <button
                            onClick={handleResolve}
                            disabled={!!busy || resolved}
                            className="flex items-center gap-1.5 font-sans font-semibold text-xs px-3 py-2 rounded-brutal border-2 border-brand-dark bg-brand-accent hover:shadow-brutal-sm transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {busy === 'resolving'
                              ? <span className="animate-spin inline-block">⏳</span>
                              : <CheckCheck size={13} />}
                            {resolved ? 'Resolved' : 'Mark Resolved'}
                          </button>
                          {/* Remove */}
                          <button
                            onClick={handleRemove}
                            disabled={!!busy}
                            className="flex items-center gap-1.5 font-sans font-semibold text-xs px-3 py-2 rounded-brutal border-2 border-brand-dark bg-brand-secondary hover:shadow-brutal-sm transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {busy === 'removing'
                              ? <span className="animate-spin inline-block">⏳</span>
                              : <Trash2 size={13} />}
                            Remove
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </BrutalCard>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Doc view modal */}
      {docView && <DocViewModal {...docView} onClose={() => setDocView(null)} />}
    </AnimatedPage>
  );
}
