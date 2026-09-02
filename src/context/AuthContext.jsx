import { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  linkWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { getUser, setUser } from '../lib/firestoreService';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

/* ─────────────────────────────────────────────────────────
   AuthContext — Phase 2
   Single-device enforcement strategy:
   1. On login: generate UUID → write to Firestore + localStorage
   2. onSnapshot listener watches the user doc at ALL times
   3. If Firestore sessionId ≠ localStorage sessionId → force logout
   4. visibilitychange listener catches backgrounded mobile tabs
   5. Point-in-time check on every onAuthStateChanged fire
───────────────────────────────────────────────────────── */

const AuthContext = createContext(null);
const googleProvider = new GoogleAuthProvider();
const DOMAIN = '@gecmess.internal';
const USE_FIREBASE = import.meta.env.VITE_USE_FIREBASE === 'true';

const toEmail = (rollNumber) =>
  `${rollNumber.toLowerCase().replace(/\s+/g, '')}${DOMAIN}`;

const SESSION_KEY = 'gecmess_session_id';
const newSessionId = () => crypto.randomUUID();

/** Write a new sessionId to Firestore and persist in localStorage */
const claimSession = async (uid) => {
  const id = newSessionId();
  localStorage.setItem(SESSION_KEY, id);           // set local FIRST
  await updateDoc(doc(db, 'users', uid), { activeSessionId: id }); // then Firestore
  return id;
};

/** Clear sessionId from Firestore and localStorage on logout */
const releaseSession = async (uid) => {
  localStorage.removeItem(SESSION_KEY);
  try {
    await updateDoc(doc(db, 'users', uid), { activeSessionId: null });
  } catch (_) { /* ignore if doc gone */ }
};

/* ── Mock users (dev mode) ──────────────────────────────── */
const MOCK_USERS = {
  student:     { uid: 'mock-s-001', displayName: 'Rahul Kumar',     rollNumber: '23CS001',  walletBalance: 1250, role: 'student',     isActive: true },
  committee:   { uid: 'mock-c-002', displayName: 'Priya Singh',     rollNumber: 'CMTE001',  walletBalance: 0,    role: 'committee',   isActive: true },
  worker:      { uid: 'mock-w-003', displayName: 'Ramesh Yadav',    rollNumber: 'WRK001',   walletBalance: 0,    role: 'worker',      isActive: true },
  super_admin: { uid: 'mock-a-004', displayName: 'Dr. Ashok Sharma',rollNumber: 'ADMIN001', walletBalance: 0,    role: 'super_admin', isActive: true },
};

export function AuthProvider({ children }) {
  const [user,         setUser_]         = useState(null);
  const [loading,      setLoading]       = useState(true);
  const [error,        setError]         = useState(null);
  const [kickedOut,    setKickedOut]     = useState(false);
  const [pendingGoogle,setPendingGoogle] = useState(null);

  // Persistent ref to the SINGLE onSnapshot watcher — never cleared mid-session
  const watcherRef  = useRef(null);
  const currentUid  = useRef(null); // track whose doc we are watching

  const [mockRole, setMockRole] = useState(
    () => sessionStorage.getItem('devRole') || 'student'
  );
  const useMock = !USE_FIREBASE;

  /* ── Mock mode ── */
  useEffect(() => {
    if (!useMock) return;
    const timer = setTimeout(() => {
      setUser_(MOCK_USERS[mockRole] ?? MOCK_USERS.student);
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [useMock, mockRole]);

  /* ── Core kick-out logic (shared by listener + visibility check) ── */
  const forceKickOut = async () => {
    console.warn('[Session] Kicked — another device has this session.');
    watcherRef.current?.();
    watcherRef.current = null;
    currentUid.current = null;
    localStorage.removeItem(SESSION_KEY);
    setKickedOut(true);
    setUser_(null);
    await signOut(auth);
  };

  /* ── Start / replace the Firestore session watcher ── */
  const startSessionWatch = (uid) => {
    // If already watching this uid, do nothing (preserve the listener)
    if (watcherRef.current && currentUid.current === uid) return;

    // Stop any old watcher for a different uid
    watcherRef.current?.();
    currentUid.current = uid;

    const ref = doc(db, 'users', uid);
    watcherRef.current = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const remote = snap.data().activeSessionId;
      const local  = localStorage.getItem(SESSION_KEY);

      // Both must exist and differ to indicate a takeover
      if (local && remote && remote !== local) {
        forceKickOut();
      }
    }, (err) => {
      // Permission error may happen after signOut — safe to ignore
      console.warn('[Session watcher error]', err.code);
    });
  };

  /* ── Real Firebase: auth state ── */
  useEffect(() => {
    if (useMock) return;

    // Handle any pending redirect result
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result) return;
        await handleGoogleUser(result.user);
      })
      .catch((err) => {
        console.warn('getRedirectResult:', err.code);
      });

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        // Signed out — tear down watcher only if it's still running
        watcherRef.current?.();
        watcherRef.current = null;
        currentUid.current = null;
        setUser_(null);
        setLoading(false);
        return;
      }

      try {
        const profile = await getUser(fbUser.uid);

        if (!profile?.role) {
          // New Google user — needs roll number registration
          setPendingGoogle({
            uid:         fbUser.uid,
            displayName: fbUser.displayName || '',
            email:       fbUser.email || '',
          });
          setUser_(null);
          setLoading(false);
          return;
        }

        // ── Point-in-time session check ─────────────────────────────
        // Catches cases where onSnapshot missed an update (backgrounded tab)
        const localId  = localStorage.getItem(SESSION_KEY);
        const remoteId = profile.activeSessionId;

        if (localId && remoteId && remoteId !== localId) {
          // Our local session ID is stale — another device has claimed it
          console.warn('[Session] Stale session on auth change — kicked.');
          localStorage.removeItem(SESSION_KEY);
          setKickedOut(true);
          setUser_(null);
          setLoading(false);
          await signOut(auth);
          return;
        }
        // ────────────────────────────────────────────────────────────

        setUser_({ uid: fbUser.uid, email: fbUser.email, ...profile });
        // Start watcher (idempotent — won't restart if same uid already watched)
        startSessionWatch(fbUser.uid);
      } catch (err) {
        console.error('Profile load failed:', err);
        setError('Could not load your profile. Check your connection.');
      } finally {
        setLoading(false);
      }
    });

    // ── Visibility listener — mobile foreground resume ────────────
    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return;
      const localId = localStorage.getItem(SESSION_KEY);
      if (!localId || !auth.currentUser) return;
      try {
        const profile = await getUser(auth.currentUser.uid);
        if (profile?.activeSessionId && profile.activeSessionId !== localId) {
          await forceKickOut();
        }
      } catch { /* offline — ignore */ }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsub();
      document.removeEventListener('visibilitychange', handleVisibility);
      // NOTE: watcherRef is intentionally NOT cleared here —
      // it should persist across React strict-mode double-mount cycles.
    };
  }, [useMock]); // eslint-disable-line

  /* helper — called after Google popup/redirect result */
  const handleGoogleUser = async (fbUser) => {
    const profile = await getUser(fbUser.uid);
    if (!profile?.role) {
      setPendingGoogle({
        uid:         fbUser.uid,
        displayName: fbUser.displayName || '',
        email:       fbUser.email || '',
      });
      setUser_(null);
    } else {
      // Claim session BEFORE onAuthStateChanged fires its next handler
      await claimSession(fbUser.uid);
    }
  };

  /* ── Google sign-in (popup) ── */
  const loginWithGoogle = async () => {
    setError(null);
    setKickedOut(false);
    if (useMock) {
      sessionStorage.setItem('devRole', 'student');
      setMockRole('student');
      return;
    }
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await handleGoogleUser(result.user);
    } catch (err) {
      throw err;
    }
  };

  /* ── Complete registration for new Google users ── */
  const completeGoogleRegistration = async (rollNumber, password) => {
    if (!pendingGoogle?.uid) throw new Error('No pending Google user');
    const fbUser = auth.currentUser;
    if (!fbUser) throw new Error('Auth state lost. Please sign in with Google again.');

    try {
      const credential = EmailAuthProvider.credential(toEmail(rollNumber), password);
      await linkWithCredential(fbUser, credential);
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        throw new Error('This Registration Number is already registered.');
      } else if (err.code === 'auth/credential-already-in-use') {
        throw new Error('This Registration Number is already linked to another account.');
      }
      throw err;
    }

    const profile = {
      displayName:  pendingGoogle.displayName || rollNumber.toUpperCase(),
      rollNumber:   rollNumber.toUpperCase(),
      role:         'student',
      walletBalance: 0,
      isActive:     true,
      email:        pendingGoogle.email,
    };
    await setUser(pendingGoogle.uid, profile);
    await claimSession(pendingGoogle.uid);
    setPendingGoogle(null);
    setUser_({ uid: pendingGoogle.uid, ...profile });
    startSessionWatch(pendingGoogle.uid);
  };

  /* ── Roll number + password login ── */
  const login = async (rollNumber, password) => {
    setError(null);
    setKickedOut(false);
    if (useMock) {
      const role = Object.keys(MOCK_USERS).find(
        r => MOCK_USERS[r].rollNumber.toLowerCase() === rollNumber.toLowerCase()
      ) || 'student';
      sessionStorage.setItem('devRole', role);
      setMockRole(role);
      return;
    }
    // Claim session immediately on sign-in
    const cred = await signInWithEmailAndPassword(auth, toEmail(rollNumber), password);
    await claimSession(cred.user.uid);
    // onAuthStateChanged will fire and call startSessionWatch
  };

  /* ── Logout ── */
  const logout = async () => {
    if (useMock) {
      sessionStorage.removeItem('devRole');
      setMockRole('student');
      setUser_(null);
      return;
    }
    const uid = user?.uid;
    watcherRef.current?.();
    watcherRef.current = null;
    currentUid.current = null;
    setPendingGoogle(null);
    setKickedOut(false);
    if (uid) await releaseSession(uid);
    await signOut(auth);
  };

  /* ── Refresh profile after wallet updates ── */
  const refreshProfile = async () => {
    if (!user?.uid || useMock) return;
    const profile = await getUser(user.uid);
    if (profile) setUser_(prev => ({ ...prev, ...profile }));
  };

  const switchDevRole = (role) => {
    sessionStorage.setItem('devRole', role);
    setMockRole(role);
    setLoading(true);
  };

  return (
    <AuthContext.Provider value={{
      user, loading, error, kickedOut,
      login, loginWithGoogle, completeGoogleRegistration,
      logout, refreshProfile,
      pendingGoogle,
    }}>
      {children}
      {import.meta.env.DEV && useMock && (
        <DevRoleSwitcher current={mockRole} onSwitch={switchDevRole} />
      )}
    </AuthContext.Provider>
  );
}

/* ── Dev Role Switcher ──────────────────────────────────── */
function DevRoleSwitcher({ current, onSwitch }) {
  const [open, setOpen] = useState(false);
  const roles  = ['student', 'committee', 'worker', 'super_admin'];
  const colors = { student: '#f9c74f', committee: '#90be6d', worker: '#43aa8b', super_admin: '#f94144' };
  return (
    <div style={{ position: 'fixed', bottom: 80, left: 12, zIndex: 9999, fontFamily: 'monospace' }}>
      {open && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6,
          background: '#fff', border: '2px solid #1a1a1a', borderRadius: 12,
          padding: 8, boxShadow: '3px 3px 0 #1a1a1a'
        }}>
          {roles.map(r => (
            <button key={r} onClick={() => { onSwitch(r); setOpen(false); }}
              style={{
                padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                border: '2px solid #1a1a1a', cursor: 'pointer', textAlign: 'left',
                background: current === r ? colors[r] : '#f5f5f5', color: '#1a1a1a'
              }}>
              {current === r ? '▶ ' : ''}{r}
            </button>
          ))}
        </div>
      )}
      <button onClick={() => setOpen(o => !o)}
        style={{
          padding: '5px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
          border: '2px solid #1a1a1a', cursor: 'pointer',
          background: colors[current] ?? '#ccc', boxShadow: '2px 2px 0 #1a1a1a'
        }}>
        🛠 {current}
      </button>
    </div>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside <AuthProvider>');
  return ctx;
}
