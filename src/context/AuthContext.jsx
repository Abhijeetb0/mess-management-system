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
   • signInWithPopup (Google) — works on all origins including LAN IPs
   • getRedirectResult() also handled in case of browser redirect
   • signInWithEmailAndPassword — roll number → @gecmess.internal
   • New Google users prompted for roll number via completeGoogleRegistration
   • Role read from Firestore /users/{uid}
   • Dev mock mode active when VITE_USE_FIREBASE is not "true"
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
  await updateDoc(doc(db, 'users', uid), { activeSessionId: id });
  localStorage.setItem(SESSION_KEY, id);
  return id;
};

/** Clear sessionId from Firestore and localStorage on logout */
const releaseSession = async (uid) => {
  try {
    await updateDoc(doc(db, 'users', uid), { activeSessionId: null });
  } catch (_) { /* ignore if doc gone */ }
  localStorage.removeItem(SESSION_KEY);
};

/* ── Mock users (dev mode) ──────────────────────────────── */
const MOCK_USERS = {
  student: { uid: 'mock-s-001', displayName: 'Rahul Kumar', rollNumber: '23CS001', walletBalance: 1250, role: 'student', isActive: true },
  committee: { uid: 'mock-c-002', displayName: 'Priya Singh', rollNumber: 'CMTE001', walletBalance: 0, role: 'committee', isActive: true },
  worker: { uid: 'mock-w-003', displayName: 'Ramesh Yadav', rollNumber: 'WRK001', walletBalance: 0, role: 'worker', isActive: true },
  super_admin: { uid: 'mock-a-004', displayName: 'Dr. Ashok Sharma', rollNumber: 'ADMIN001', walletBalance: 0, role: 'super_admin', isActive: true },
};

export function AuthProvider({ children }) {
  const [user, setUser_] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [kickedOut, setKickedOut] = useState(false); // true when another device stole the session
  // Tracks a new Google user who needs to enter their roll number
  const [pendingGoogle, setPendingGoogle] = useState(null); // { uid, displayName, email }
  const sessionUnsubRef = useRef(null); // holds the onSnapshot unsubscribe for session watch

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

  /* ── Real Firebase: auth state + redirect result ── */
  useEffect(() => {
    if (useMock) return;

    // Handle any pending redirect result (in case browser used redirect flow)
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result) return;
        await handleGoogleUser(result.user);
      })
      .catch((err) => {
        console.warn('getRedirectResult error (safe to ignore if no redirect was started):', err.code);
      });

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      // Stop watching previous user's session doc
      sessionUnsubRef.current?.();
      sessionUnsubRef.current = null;

      if (!fbUser) {
        setUser_(null);
        setLoading(false);
        return;
      }
      try {
        const profile = await getUser(fbUser.uid);
        if (profile?.role) {
          // ── Point-in-time session check ───────────────────────────
          // If another device logged in while this device was backgrounded,
          // the Firestore profile already has the new sessionId.
          const localId = localStorage.getItem(SESSION_KEY);
          const remoteId = profile.activeSessionId;
          if (localId && remoteId && remoteId !== localId) {
            console.warn('[Session] Stale session detected on load — another device is active.');
            setKickedOut(true);
            localStorage.removeItem(SESSION_KEY);
            await signOut(auth);
            setUser_(null);
            setLoading(false);
            return;
          }
          // ─────────────────────────────────────────────────────────
          setUser_({ uid: fbUser.uid, email: fbUser.email, ...profile });
          // Start live watchdog — catches future logins on other devices
          startSessionWatch(fbUser.uid);
        } else {
          // Authenticated but no Firestore profile yet (new Google user)
          setPendingGoogle({
            uid: fbUser.uid,
            displayName: fbUser.displayName || '',
            email: fbUser.email || '',
          });
          setUser_(null);
        }
      } catch (err) {
        console.error('Profile load failed:', err);
        setError('Could not load your profile. Check your connection.');
      } finally {
        setLoading(false);
      }
    });

    // ── Visibility listener (mobile foreground resume) ────────────
    // Mobile browsers pause WebSocket connections in the background,
    // so onSnapshot may miss updates. Re-check session on tab focus.
    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return;
      const localId = localStorage.getItem(SESSION_KEY);
      if (!localId) return; // not logged in or no session
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        const profile = await getUser(currentUser.uid);
        if (profile?.activeSessionId && profile.activeSessionId !== localId) {
          console.warn('[Session] Kicked on resume — another device is active.');
          setKickedOut(true);
          localStorage.removeItem(SESSION_KEY);
          sessionUnsubRef.current?.();
          sessionUnsubRef.current = null;
          await signOut(auth);
          setUser_(null);
        }
      } catch { /* ignore — offline or transient */ }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsub();
      sessionUnsubRef.current?.();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [useMock]);


  /**
   * Watch the user's Firestore doc.
   * If activeSessionId changes to a value different from what's in localStorage,
   * another device has logged in → force-logout this device.
   */
  const startSessionWatch = (uid) => {
    sessionUnsubRef.current?.(); // clear any previous watcher
    const ref = doc(db, 'users', uid);
    const localId = localStorage.getItem(SESSION_KEY);

    const unsubWatch = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const remote = snap.data().activeSessionId;
      const local = localStorage.getItem(SESSION_KEY);
      // If we have a local session but Firestore shows a different one → kicked
      if (local && remote && remote !== local) {
        console.warn('[Session] Kicked — another device logged in.');
        setKickedOut(true);
        sessionUnsubRef.current?.();
        sessionUnsubRef.current = null;
        localStorage.removeItem(SESSION_KEY);
        signOut(auth);
        setUser_(null);
      }
    });
    sessionUnsubRef.current = unsubWatch;
  };

  /* helper — called after Google popup/redirect result */
  const handleGoogleUser = async (fbUser) => {
    const profile = await getUser(fbUser.uid);
    if (!profile?.role) {
      // New user — needs registration, session claimed after completeGoogleRegistration
      setPendingGoogle({
        uid: fbUser.uid,
        displayName: fbUser.displayName || '',
        email: fbUser.email || '',
      });
      setUser_(null);
    } else {
      // Existing Google user returning — claim session now
      await claimSession(fbUser.uid);
      // onAuthStateChanged will set the user, startSessionWatch fires there
    }
  };

  /* ── Google sign-in (popup — works on any origin) ── */
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

    // Link an Email/Password credential so they can login with ID later
    try {
      const credential = EmailAuthProvider.credential(toEmail(rollNumber), password);
      await linkWithCredential(fbUser, credential);
    } catch (err) {
      // If it says email-already-in-use, it means someone else already claimed this roll number!
      if (err.code === 'auth/email-already-in-use') {
        throw new Error('This Registration Number is already registered.');
      } else if (err.code === 'auth/credential-already-in-use') {
        throw new Error('This Registration Number is already linked to another account.');
      }
      throw err;
    }

    const profile = {
      displayName: pendingGoogle.displayName || rollNumber.toUpperCase(),
      rollNumber: rollNumber.toUpperCase(),
      role: 'student',
      walletBalance: 0,
      isActive: true,
      email: pendingGoogle.email, // store original gmail
    };
    await setUser(pendingGoogle.uid, profile);
    // Claim session for the newly registered user
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
    // Sign in first, then claim session
    const cred = await signInWithEmailAndPassword(auth, toEmail(rollNumber), password);
    await claimSession(cred.user.uid);
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
    sessionUnsubRef.current?.();
    sessionUnsubRef.current = null;
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
      pendingGoogle,  // { uid, displayName, email } when new Google user needs roll number
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
  const roles = ['student', 'committee', 'worker', 'super_admin'];
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
