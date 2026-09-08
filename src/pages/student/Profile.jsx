import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LogOut, Wallet, Clock, CheckCircle2, XCircle, ArrowLeftRight, FileText, Eye, X } from 'lucide-react';
import AnimatedPage from '../../components/AnimatedPage';
import { BrutalCard, BrutalButton, BrutalBadge } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { listenMyOptOuts, listenMyPenalties, getOptOutEndDate } from '../../lib/firestoreService';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';

/* ─────────────────────────────────────────────────────────
   Student — Profile (Phase 2: live wallet + opt-out history)
   Committee/Admin members also see a panel-switch button.
───────────────────────────────────────────────────────── */

const STATUS_CONF = {
  pending:  { label: 'Pending',  color: 'bg-brand-purple',    Icon: Clock        },
  approved: { label: 'Approved', color: 'bg-brand-accent',    Icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-brand-secondary', Icon: XCircle      },
  cancelled: { label: 'Cancelled', color: 'bg-brand-bg',      Icon: XCircle      },
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

export default function Profile({ direction }) {
  const { user, logout, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [docView, setDocView] = useState(null);

  const isStaff    = user?.role === 'committee'; // admin accounts are separate — no switch needed
  const panelPath  = '/committee';
  const panelLabel = 'Committee Panel';

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = listenMyOptOuts(user.uid, (list) => {
      setHistory(list);
      refreshProfile?.();
    });
    return () => unsub?.();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = listenMyPenalties(user.uid, setPenalties);
    return () => unsub?.();
  }, [user?.uid]);

  const approved = history.filter(r => r.status === 'approved');
  const pending = history.filter(r => r.status === 'pending');
  const totalSaved = approved.reduce((sum, r) => sum + (r.estimatedRefund || 0), 0);
  const pendingTotal = pending.reduce((sum, r) => sum + (r.estimatedRefund || 0), 0);
  const monthPrefix = new Date().toISOString().slice(0, 7); // yyyy-MM
  const monthSaved = approved
    .filter(r => (r.startDate || '').startsWith(monthPrefix))
    .reduce((sum, r) => sum + (r.estimatedRefund || 0), 0);

  return (
    <AnimatedPage direction={direction} className="px-5 pt-5 pb-6">

      {/* Profile card */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-brand-primary border-2 border-brand-dark rounded-brutal p-5 shadow-brutal mb-4 relative overflow-hidden"
      >
        <span className="absolute -bottom-4 -right-4 font-serif font-bold text-brand-dark/10 select-none pointer-events-none"
          style={{ fontSize: '5rem' }}>🎓</span>
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-16 h-16 rounded-full bg-white border-2 border-brand-dark flex items-center justify-center font-serif font-bold text-3xl shadow-brutal-sm shrink-0">
            {user?.displayName?.[0] ?? 'S'}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-serif font-bold text-xl text-brand-dark leading-tight">
              {user?.displayName ?? 'Student'}
            </h2>
            <p className="font-mono text-sm text-brand-dark/70">{user?.rollNumber}</p>
            <p className="font-sans text-xs text-brand-dark/50 mt-0.5">{user?.email}</p>
          </div>
        </div>
      </motion.div>

      {/* Panel switch — committee/admin only */}
      {isStaff && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => { window.location.href = panelPath; }}
          className="w-full mb-5 flex items-center justify-between gap-3 bg-brand-dark text-brand-bg border-2 border-brand-dark rounded-brutal px-5 py-3.5 shadow-brutal-sm hover:shadow-brutal transition-shadow"
        >
          <div className="flex items-center gap-3">
            <ArrowLeftRight size={18} className="shrink-0" />
            <div className="text-left">
              <p className="font-sans font-bold text-sm">Switch to {panelLabel}</p>
              <p className="font-sans text-xs text-brand-bg/60">You have staff access</p>
            </div>
          </div>
          <span className="font-sans text-xs bg-brand-gold text-brand-dark px-2 py-0.5 rounded-pill font-bold capitalize">
            {user.role.replace('_', ' ')}
          </span>
        </motion.button>
      )}

      {/* Wallet + Stats */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <BrutalCard color="bg-brand-gold" className="p-4 text-center">
          <Wallet size={20} className="mx-auto mb-1 text-brand-dark" />
          <p className="font-sans text-xs text-brand-dark/60 uppercase tracking-wider mb-1">Wallet</p>
          <p className="font-serif font-bold text-2xl text-brand-dark">₹{user?.walletBalance ?? 0}</p>
        </BrutalCard>
        <BrutalCard color="bg-brand-accent" className="p-4 text-center">
          <CheckCircle2 size={20} className="mx-auto mb-1 text-brand-dark" />
          <p className="font-sans text-xs text-brand-dark/60 uppercase tracking-wider mb-1">Total Saved</p>
          <p className="font-serif font-bold text-2xl text-brand-dark">₹{totalSaved}</p>
        </BrutalCard>
      </div>

      {/* Refund split chips */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <BrutalCard className="p-3 text-center">
          <p className="font-sans text-[10px] text-brand-light uppercase tracking-wider">Pending</p>
          <p className="font-serif font-bold text-lg text-brand-dark">₹{pendingTotal}</p>
        </BrutalCard>
        <BrutalCard className="p-3 text-center">
          <p className="font-sans text-[10px] text-brand-light uppercase tracking-wider">Credited</p>
          <p className="font-serif font-bold text-lg text-brand-gold">₹{totalSaved}</p>
        </BrutalCard>
        <BrutalCard className="p-3 text-center">
          <p className="font-sans text-[10px] text-brand-light uppercase tracking-wider">This month</p>
          <p className="font-serif font-bold text-lg text-brand-dark">₹{monthSaved}</p>
        </BrutalCard>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border-2 border-brand-dark rounded-brutal p-6 flex flex-col items-center gap-3 shadow-brutal mb-6"
      >
        <p className="font-sans font-bold text-xs uppercase tracking-wider text-brand-dark">
          GEC Sheikhpura — Entry QR
        </p>
        <QRCodeSVG value={user?.uid ?? 'unknown'} size={160} level="H" />
        <p className="font-sans text-[10px] text-brand-light text-center max-w-[160px] mt-1">
          Show this at the mess gate when asked
        </p>
      </motion.div>

      {/* Opt-out history */}
      <h3 className="font-serif font-bold text-lg mb-3">Opt-Out History</h3>
      <div className="flex flex-col gap-3 mb-6">
        {history.length === 0 && (
          <BrutalCard className="p-5 text-center">
            <p className="font-sans text-sm text-brand-light">No opt-out requests yet.</p>
          </BrutalCard>
        )}
        {history.map((r, i) => {
          const conf = STATUS_CONF[r.status] ?? STATUS_CONF.pending;
          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <BrutalCard className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <conf.Icon size={18} className="text-brand-dark shrink-0" />
                    <div>
                      <p className="font-sans font-bold text-sm">
                        {r.numDays} day{r.numDays > 1 ? 's' : ''} · {r.startDate} → {getOptOutEndDate(r.startDate, r.numDays)}
                      </p>
                      <p className="font-sans text-xs text-brand-light truncate max-w-[160px]">
                        {r.reason}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <BrutalBadge color={conf.color}>{conf.label}</BrutalBadge>
                    {r.status === 'approved' && (
                      <span className="font-serif font-bold text-sm text-brand-gold">+₹{r.estimatedRefund}</span>
                    )}
                  </div>
                </div>
                {r.status === 'rejected' && r.rejectReason && (
                  <p className="font-sans text-xs text-red-700 bg-red-50 border border-red-200 rounded-brutal px-2.5 py-1.5 mt-3">
                    Reject reason: {r.rejectReason}
                  </p>
                )}
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
            </motion.div>
          );
        })}
      </div>

      {/* My penalties (wallet kata to reason yahi dikhega) */}
      {penalties.length > 0 && (
        <>
          <h3 className="font-serif font-bold text-lg mb-3">My Penalties</h3>
          <div className="flex flex-col gap-2 mb-6">
            {penalties.map((p) => (
              <BrutalCard key={p.id} color={p.resolved ? 'bg-brand-accent/60' : 'bg-brand-secondary'} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-sans font-bold text-sm">−₹{p.amount} · {p.reason}</p>
                    <p className="font-sans text-[11px] text-brand-dark/60 mt-0.5">
                      By {p.appliedBy || 'Committee'}
                      {p.appliedAt?.toDate ? ` · ${new Date(p.appliedAt.toDate()).toLocaleDateString('en-IN')}` : ''}
                    </p>
                  </div>
                  <BrutalBadge color={p.resolved ? 'bg-brand-accent' : 'bg-brand-secondary'}>
                    {p.resolved ? 'Resolved' : 'Active'}
                  </BrutalBadge>
                </div>
              </BrutalCard>
            ))}
          </div>
        </>
      )}

      {/* Logout */}
      <BrutalButton icon={LogOut} onClick={logout} variant="ghost" fullWidth>
        Sign Out
      </BrutalButton>

      {docView && <DocViewModal {...docView} onClose={() => setDocView(null)} />}

    </AnimatedPage>
  );
}
