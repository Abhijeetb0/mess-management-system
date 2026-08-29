import {
  BrowserRouter as Router,
  Routes, Route, Navigate,
  useLocation,
} from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Suspense, lazy, useState, useEffect } from 'react';

import { AuthProvider }    from './context/AuthContext';
import ProtectedRoute      from './components/ProtectedRoute';
import { FullPageLoader }  from './components/Feedback';
import BottomNav           from './components/BottomNav';
import SideNav             from './components/SideNav';
import { useAuth }         from './context/AuthContext';

/* ── Lazy-loaded panels ─────────────────────────────────── */
// Auth
const LoginPage = lazy(() => import('./pages/auth/Login'));

// Student
const StudentRoutine = lazy(() => import('./pages/student/Routine'));
const StudentOptOut  = lazy(() => import('./pages/student/OptOut'));
const StudentProfile = lazy(() => import('./pages/student/Profile'));
const StudentFeedback = lazy(() => import('./pages/student/Feedback'));

// Committee
const CommitteeDashboard = lazy(() => import('./pages/committee/Dashboard'));
const CommitteeMenu      = lazy(() => import('./pages/committee/MenuManager'));
const CommitteeAnnounce  = lazy(() => import('./pages/committee/Announce'));
const CommitteeLedger    = lazy(() => import('./pages/committee/Ledger'));
const CommitteeUsers     = lazy(() => import('./pages/committee/Users'));
const CommitteeStudents  = lazy(() => import('./pages/committee/Students'));

// Worker
const WorkerTerminal = lazy(() => import('./pages/worker/Terminal'));

// Super Admin
const AdminDashboard  = lazy(() => import('./pages/superadmin/Dashboard'));
const AdminCommittee  = lazy(() => import('./pages/superadmin/Committee'));
const AdminWorkers    = lazy(() => import('./pages/superadmin/Workers'));
const AdminSuccession = lazy(() => import('./pages/superadmin/Succession'));

/* ── Route ordering for slide direction detection ─────── */
const STUDENT_ROUTES = [
  '/student/routine',
  '/student/opt-out',
  '/student/feedback',
  '/student/profile',
];

/* ── Student Panel Layout (mobile, with BottomNav) ────── */
function StudentLayout() {
  const location = useLocation();
  const [direction, setDirection] = useState(1);
  const [prevPath, setPrevPath]   = useState(location.pathname);

  useEffect(() => {
    if (location.pathname !== prevPath) {
      const cur  = STUDENT_ROUTES.findIndex(r => location.pathname.startsWith(r));
      const prev = STUDENT_ROUTES.findIndex(r => prevPath.startsWith(r));
      setDirection(cur >= prev ? 1 : -1);
      setPrevPath(location.pathname);
    }
  }, [location.pathname, prevPath]);

  return (
    <div className="max-w-[480px] mx-auto min-h-dvh flex flex-col relative">
      {/* Sticky header */}
      <header className="sticky top-0 z-40 bg-brand-bg/95 backdrop-blur-sm border-b-2 border-brand-dark px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif font-bold text-xl leading-none">
              Mess<span className="text-brand-gold">App</span>
            </h1>
            <p className="font-sans text-[10px] text-brand-light uppercase tracking-widest mt-0.5">
              GEC Sheikhpura
            </p>
          </div>
          <StudentHeaderRight />
        </div>
      </header>

      {/* Page content with slide animation */}
      <main className="flex-1 relative overflow-x-hidden">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <Suspense fallback={<FullPageLoader />}>
            <Routes location={location} key={location.pathname}>
              <Route path="routine"  element={<StudentRoutine  direction={direction} />} />
              <Route path="opt-out"  element={<StudentOptOut   direction={direction} />} />
              <Route path="feedback" element={<StudentFeedback direction={direction} />} />
              <Route path="profile"  element={<StudentProfile  direction={direction} />} />
              <Route index element={<Navigate to="routine" replace />} />
            </Routes>
          </Suspense>
        </AnimatePresence>
      </main>

      {/* Floating bottom nav */}
      <BottomNav />

      {/* Spacer so content doesn't hide behind nav */}
      <div className="h-24" />
    </div>
  );
}

function StudentHeaderRight() {
  const { user } = useAuth();
  return (
    <div className="flex items-center gap-2">
      <div className="text-right">
        <p className="font-sans font-semibold text-xs">{user?.displayName}</p>
        <p className="font-mono text-[10px] text-brand-light">{user?.rollNumber}</p>
      </div>
      <div className="w-8 h-8 rounded-full bg-brand-primary border-2 border-brand-dark flex items-center justify-center font-serif font-bold text-sm">
        {user?.displayName?.[0] ?? 'S'}
      </div>
    </div>
  );
}

/* ── Committee Layout (desktop, with SideNav) ─────────── */
function CommitteeLayout() {
  const location = useLocation();
  return (
    <div className="flex min-h-dvh">
      <SideNav variant="committee" />
      <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
        <AnimatePresence mode="wait">
          <Suspense fallback={<FullPageLoader />}>
            <Routes location={location} key={location.pathname}>
              <Route path="dashboard" element={<CommitteeDashboard />} />
              <Route path="menu"      element={<CommitteeMenu />} />
              <Route path="announce"  element={<CommitteeAnnounce />} />
              <Route path="ledger"    element={<CommitteeLedger />} />
              <Route path="users"     element={<CommitteeUsers />} />
              <Route path="students"  element={<CommitteeStudents />} />
              <Route path="feedback"  element={<StudentFeedback direction={1} />} />
              <Route index element={<Navigate to="dashboard" replace />} />
            </Routes>
          </Suspense>
        </AnimatePresence>
      </main>
    </div>
  );
}

/* ── Super Admin Layout (desktop, with SideNav) ───────── */
function AdminLayout() {
  const location = useLocation();
  return (
    <div className="flex min-h-dvh">
      <SideNav variant="admin" />
      <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
        <AnimatePresence mode="wait">
          <Suspense fallback={<FullPageLoader />}>
            <Routes location={location} key={location.pathname}>
              <Route path="dashboard"  element={<AdminDashboard />} />
              <Route path="committee"  element={<AdminCommittee />} />
              <Route path="workers"    element={<AdminWorkers />} />
              <Route path="succession" element={<AdminSuccession />} />
              <Route path="students"   element={<CommitteeStudents />} />
              <Route path="feedback"   element={<StudentFeedback direction={1} />} />
              <Route index element={<Navigate to="dashboard" replace />} />
            </Routes>
          </Suspense>
        </AnimatePresence>
      </main>
    </div>
  );
}

/* ── Root App ─────────────────────────────────────────── */
function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return <FullPageLoader />;

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={
        user ? <Navigate to={roleHome(user.role)} replace /> : <Suspense fallback={<FullPageLoader />}><LoginPage /></Suspense>
      } />

      {/* Student Panel — committee can visit too (Student View button) */}
      <Route path="/student/*" element={
        <ProtectedRoute allowedRoles={['student', 'committee']}>
          <StudentLayout />
        </ProtectedRoute>
      } />

      {/* Committee Panel */}
      <Route path="/committee/*" element={
        <ProtectedRoute allowedRoles={['committee', 'super_admin']}>
          <CommitteeLayout />
        </ProtectedRoute>
      } />

      {/* Worker Terminal */}
      <Route path="/worker" element={
        <ProtectedRoute allowedRoles={['worker']}>
          <Suspense fallback={<FullPageLoader />}><WorkerTerminal /></Suspense>
        </ProtectedRoute>
      } />

      {/* Super Admin */}
      <Route path="/superadmin/*" element={
        <ProtectedRoute allowedRoles={['super_admin']}>
          <AdminLayout />
        </ProtectedRoute>
      } />

      {/* Root redirect */}
      <Route path="/" element={
        user ? <Navigate to={roleHome(user.role)} replace /> : <Navigate to="/login" replace />
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function roleHome(role) {
  const map = {
    student:     '/student/routine',
    committee:   '/committee/dashboard',
    worker:      '/worker',
    super_admin: '/superadmin/dashboard',
  };
  return map[role] ?? '/login';  // unknown/undefined role → back to login
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}
