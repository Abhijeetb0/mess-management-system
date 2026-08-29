import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Search, Users, UserCheck, ShieldOff, RefreshCw } from 'lucide-react';
import AnimatedPage from '../../components/AnimatedPage';
import { BrutalCard, BrutalButton, BrutalBadge } from '../../components/ui';
import { listenAllStudents, approveStudent, rejectStudent } from '../../lib/firestoreService';

/* ─────────────────────────────────────────────────────────
   Students Registration Approval Page
   Shared by committee and super admin
   • Live list of all students
   • Approve / Reject each registration
   • Approved students can use opt-out; rejected ones cannot
───────────────────────────────────────────────────────── */

export default function Students({ direction }) {
  const [students,    setStudents]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [filter,      setFilter]      = useState('all'); // 'all' | 'pending' | 'approved' | 'rejected'
  const [processing,  setProcessing]  = useState({});

  useEffect(() => {
    const unsub = listenAllStudents((data) => {
      setStudents(data);
      setLoading(false);
    });
    return () => unsub?.();
  }, []);

  const handleApprove = async (uid) => {
    setProcessing(p => ({ ...p, [uid]: 'approving' }));
    try { await approveStudent(uid); }
    catch (err) { console.error('Approve failed:', err); }
    finally { setProcessing(p => ({ ...p, [uid]: null })); }
  };

  const handleReject = async (uid) => {
    setProcessing(p => ({ ...p, [uid]: 'rejecting' }));
    try { await rejectStudent(uid); }
    catch (err) { console.error('Reject failed:', err); }
    finally { setProcessing(p => ({ ...p, [uid]: null })); }
  };

  const filtered = students.filter(s => {
    const matchesSearch =
      s.displayName?.toLowerCase().includes(search.toLowerCase()) ||
      s.rollNumber?.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (filter === 'approved') return s.isApproved === true;
    if (filter === 'rejected') return s.isApproved === false;
    if (filter === 'pending')  return s.isApproved == null;
    return true;
  });

  const counts = {
    all:      students.length,
    pending:  students.filter(s => s.isApproved == null).length,
    approved: students.filter(s => s.isApproved === true).length,
    rejected: students.filter(s => s.isApproved === false).length,
  };

  const FILTERS = [
    { key: 'all',      label: `All (${counts.all})`,           color: 'bg-brand-surface' },
    { key: 'pending',  label: `Pending (${counts.pending})`,   color: 'bg-brand-primary' },
    { key: 'approved', label: `Approved (${counts.approved})`, color: 'bg-brand-accent'  },
    { key: 'rejected', label: `Rejected (${counts.rejected})`, color: 'bg-brand-secondary' },
  ];

  return (
    <AnimatedPage direction={direction ?? 1} className="p-4 sm:p-8">
      <div className="mb-5">
        <h2 className="font-serif font-bold text-2xl sm:text-3xl">
          Student <span className="highlight">Registrations</span>
        </h2>
        <p className="font-sans text-sm text-brand-light mt-1">
          Approve or reject student registrations. Only approved students can submit opt-out requests.
        </p>
      </div>

      {/* Filter pills — horizontally scrollable on mobile */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`font-sans text-xs font-bold px-3 py-1.5 rounded-pill border-2 border-brand-dark transition-all whitespace-nowrap shrink-0
              ${filter === f.key ? `${f.color} shadow-brutal-sm` : 'bg-brand-bg opacity-60 hover:opacity-100'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="relative mb-5">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-light pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or roll number…"
          className="w-full pl-9 pr-4 py-2.5 border-2 border-brand-dark rounded-brutal font-sans text-sm bg-brand-bg outline-none focus:shadow-brutal-sm transition-shadow"
        />
      </div>

      {/* Student list */}
      <div className="flex flex-col gap-3">
        {loading && (
          <BrutalCard className="p-8 text-center">
            <RefreshCw size={24} className="mx-auto animate-spin text-brand-light mb-2" />
            <p className="font-sans text-sm text-brand-light">Loading students…</p>
          </BrutalCard>
        )}

        {!loading && filtered.length === 0 && (
          <BrutalCard className="p-8 text-center">
            <Users size={32} className="mx-auto mb-2 text-brand-light" />
            <p className="font-sans text-sm text-brand-light">No students found.</p>
          </BrutalCard>
        )}

        <AnimatePresence>
          {filtered.map((s, i) => {
            const status = s.isApproved === true
              ? 'approved'
              : s.isApproved === false
              ? 'rejected'
              : 'pending';

            const statusConf = {
              approved: { label: 'Approved',  color: 'bg-brand-accent',    dot: 'bg-green-500' },
              rejected: { label: 'Rejected',  color: 'bg-brand-secondary', dot: 'bg-red-500'   },
              pending:  { label: 'Pending',   color: 'bg-brand-primary',   dot: 'bg-yellow-500'},
            }[status];

            const busy = processing[s.uid];

            return (
              <motion.div
                key={s.uid}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.03 }}
              >
                <BrutalCard className="p-4">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-11 h-11 rounded-full bg-brand-primary border-2 border-brand-dark flex items-center justify-center font-serif font-bold text-base shrink-0">
                      {(s.displayName || '?')[0].toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-sans font-bold text-sm">{s.displayName || 'Unknown'}</p>
                        <BrutalBadge color={statusConf.color} className="text-[9px] py-0.5 px-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dot} inline-block mr-1`} />
                          {statusConf.label}
                        </BrutalBadge>
                      </div>
                      <p className="font-mono text-xs text-brand-light">{s.rollNumber || '—'}</p>
                      <p className="font-sans text-[10px] text-brand-light">{s.email}</p>
                    </div>

                    {/* Wallet */}
                    <div className="text-right shrink-0 mr-2 hidden sm:block">
                      <p className="font-sans text-[10px] text-brand-light uppercase">Wallet</p>
                      <p className="font-serif font-bold text-brand-gold">₹{s.walletBalance ?? 0}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1.5 shrink-0">
                      {status !== 'approved' && (
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          disabled={!!busy}
                          onClick={() => handleApprove(s.uid)}
                          title="Approve"
                          className="w-9 h-9 flex items-center justify-center rounded-brutal border-2 border-brand-dark bg-brand-accent hover:shadow-brutal-sm transition-shadow disabled:opacity-50"
                        >
                          {busy === 'approving' ? (
                            <RefreshCw size={15} className="animate-spin" />
                          ) : (
                            <Check size={15} strokeWidth={2.5} className="text-brand-dark" />
                          )}
                        </motion.button>
                      )}
                      {status !== 'rejected' && (
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          disabled={!!busy}
                          onClick={() => handleReject(s.uid)}
                          title="Reject"
                          className="w-9 h-9 flex items-center justify-center rounded-brutal border-2 border-brand-dark bg-brand-secondary hover:shadow-brutal-sm transition-shadow disabled:opacity-50"
                        >
                          {busy === 'rejecting' ? (
                            <RefreshCw size={15} className="animate-spin" />
                          ) : (
                            <X size={15} strokeWidth={2.5} className="text-brand-dark" />
                          )}
                        </motion.button>
                      )}
                    </div>
                  </div>
                </BrutalCard>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </AnimatedPage>
  );
}
