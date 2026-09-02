import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, UserCheck, UserX, ChevronDown, ChevronUp, Search } from 'lucide-react';
import AnimatedPage from '../../components/AnimatedPage';
import { BrutalCard, BrutalButton, BrutalBadge } from '../../components/ui';
import { getAllStudents, getAllCommittee, setUserRole } from '../../lib/firestoreService';



const ROLE_BADGE = {
  student: { label: 'Student', color: 'bg-brand-bg' },
  committee: { label: 'Committee', color: 'bg-brand-accent' },
  worker: { label: 'Worker', color: 'bg-brand-primary' },
  super_admin: { label: 'Super Admin', color: 'bg-brand-gold' },
};

export default function CommitteeMgmt() {
  const [students, setStudents] = useState([]);
  const [committee, setCommittee] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [processing, setProcessing] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([getAllStudents(), getAllCommittee()]);
      setStudents(s);
      setCommittee(c);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const promote = async (uid) => {
    setProcessing(p => ({ ...p, [uid]: true }));
    try {
      await setUserRole(uid, 'committee');
      await load();
    } catch (err) {
      console.error('Promote failed:', err);
    } finally {
      setProcessing(p => ({ ...p, [uid]: false }));
    }
  };

  const demote = async (uid) => {
    setProcessing(p => ({ ...p, [uid]: true }));
    try {
      await setUserRole(uid, 'student');
      await load();
    } catch (err) {
      console.error('Demote failed:', err);
    } finally {
      setProcessing(p => ({ ...p, [uid]: false }));
    }
  };

  const makeWorker = async (uid) => {
    setProcessing(p => ({ ...p, [uid]: true }));
    try {
      await setUserRole(uid, 'worker');
      await load();
    } catch (err) {
      console.error('Make worker failed:', err);
    } finally {
      setProcessing(p => ({ ...p, [uid]: false }));
    }
  };

  const filtered = students.filter(
    s => s.displayName?.toLowerCase().includes(search.toLowerCase()) ||
      s.rollNumber?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AnimatedPage direction={1} className="p-8">
      <div className="mb-6">
        <h2 className="font-serif font-bold text-3xl">
          Committee <span className="highlight">Management</span>
        </h2>
        <p className="font-sans text-sm text-brand-light mt-1">
          Promote students to committee or worker roles
        </p>
      </div>

      {/* Current Committee */}
      <h3 className="font-serif font-bold text-xl mb-3">
        Current Committee ({committee.length})
      </h3>
      <div className="grid grid-cols-1 gap-3 max-w-2xl mb-8">
        {committee.length === 0 && !loading && (
          <BrutalCard className="p-5 text-center">
            <p className="font-sans text-sm text-brand-light">No committee members assigned yet.</p>
          </BrutalCard>
        )}
        <AnimatePresence>
          {committee.map((m, i) => (
            <motion.div key={m.uid} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}>
              <BrutalCard color="bg-brand-accent" className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white border-2 border-brand-dark flex items-center justify-center font-serif font-bold shrink-0">
                  {(m.displayName || '?')[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-sans font-bold text-sm">{m.displayName}</p>
                  <p className="font-mono text-xs text-brand-light">{m.rollNumber}</p>
                </div>
                <BrutalButton
                  size="sm" variant="ghost"
                  disabled={!!processing[m.uid]}
                  onClick={() => demote(m.uid)}
                >
                  {processing[m.uid] ? '...' : 'Revoke'}
                </BrutalButton>
              </BrutalCard>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Students — promote section */}
      <div className="flex items-center justify-between mb-3 max-w-2xl">
        <h3 className="font-serif font-bold text-xl">
          All Students ({filtered.length})
        </h3>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-light pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="pl-8 pr-3 py-2 border-2 border-brand-dark rounded-brutal font-sans text-xs bg-brand-bg outline-none w-36"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 max-w-2xl">
        {loading ? (
          <BrutalCard className="p-5 text-center">
            <p className="font-sans text-sm text-brand-light animate-pulse">Loading students...</p>
          </BrutalCard>
        ) : filtered.length === 0 ? (
          <BrutalCard className="p-5 text-center">
            <p className="font-sans text-sm text-brand-light">No students found.</p>
          </BrutalCard>
        ) : (
          filtered.map((s, i) => {
            const badge = ROLE_BADGE[s.role] ?? ROLE_BADGE.student;
            return (
              <motion.div key={s.uid} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}>
                <BrutalCard className="p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-brand-primary border-2 border-brand-dark flex items-center justify-center font-serif font-bold text-sm shrink-0">
                    {(s.displayName || '?')[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-sans font-bold text-sm">{s.displayName}</p>
                    <p className="font-mono text-xs text-brand-light">{s.rollNumber}</p>
                  </div>
                  <BrutalBadge color={badge.color}>{badge.label}</BrutalBadge>
                  <div className="flex gap-1.5 shrink-0">
                    <BrutalButton
                      size="sm" icon={UserCheck}
                      disabled={!!processing[s.uid]}
                      onClick={() => promote(s.uid)}
                      title="Make Committee Member"
                    >
                      {processing[s.uid] ? '...' : 'Committee'}
                    </BrutalButton>
                    <BrutalButton
                      size="sm" variant="ghost"
                      disabled={!!processing[s.uid]}
                      onClick={() => makeWorker(s.uid)}
                      title="Make Worker"
                    >
                      Worker
                    </BrutalButton>
                  </div>
                </BrutalCard>
              </motion.div>
            );
          })
        )}
      </div>
    </AnimatedPage>
  );
}
