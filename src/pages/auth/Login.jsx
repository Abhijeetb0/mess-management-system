import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, ChevronDown, Eye, EyeOff, Hash, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BrutalButton } from '../../components/ui';

/* ─────────────────────────────────────────────────────────
   Login Page
   Primary:   Sign in with Google (popup — works on any origin)
   Secondary: Roll Number + Password (collapsible)
   New users: Prompted for registration number after Google sign-in
───────────────────────────────────────────────────────── */

export default function Login() {
  const { loginWithGoogle, login, completeGoogleRegistration, pendingGoogle, kickedOut } = useAuth();

  const [step, setStep] = useState('main');   // 'main' | 'id-login' | 'complete-registration'
  const [roll, setRoll] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [regRoll, setRegRoll] = useState('');
  const [regName, setRegName] = useState('');
  const [regPass, setRegPass] = useState('');
  const [showRegPass, setShowRegPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // When AuthContext signals a new Google user needs registration → switch step
  useEffect(() => {
    if (pendingGoogle) {
      setRegRoll('');
      setRegName('');
      setRegPass('');
      setStep('complete-registration');
    }
  }, [pendingGoogle]);

  /* ── Google sign-in ── */
  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
      // If successful for an existing user, AuthContext sets user → App.jsx navigates
      // If new user, AuthContext sets pendingGoogle → useEffect above switches step
    } catch (err) {
      const messages = {
        'auth/popup-closed-by-user': 'Sign-in cancelled.',
        'auth/popup-blocked': 'Popup blocked — please allow popups for this site.',
        'auth/cancelled-popup-request': 'Sign-in cancelled.',
        'auth/network-request-failed': 'Network error. Check your connection.',
        'auth/operation-not-allowed': 'Google sign-in is not enabled. Contact the administrator.',
        'auth/unauthorized-domain': 'This domain is not authorized. Add it in Firebase Console → Authentication → Settings → Authorized domains.',
      };
      setError(messages[err.code] || `Sign-in error: ${err.code ?? err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /* ── Complete registration for new Google users ── */
  const handleCompleteReg = async (e) => {
    e.preventDefault();
    const nameVal = regName.trim();
    const rollVal = regRoll.trim();
    if (!nameVal)                          { setError('Please enter your full name.'); return; }
    if (!/^\d{11}$/.test(rollVal))         { setError('Registration number must be exactly 11 digits (numbers only).'); return; }
    if (!regPass.trim())                   { setError('Please set a password for ID login.'); return; }
    if (regPass.length < 6)               { setError('Password must be at least 6 characters.'); return; }

    setError('');
    setLoading(true);
    try {
      await completeGoogleRegistration(rollVal, regPass, nameVal);
      // AuthContext sets user → App.jsx navigates to student panel
    } catch (err) {
      console.error('Registration error:', err);
      setError(`Registration failed: ${err.message || 'Try again.'}`);
    } finally {
      setLoading(false);
    }
  };

  /* ── Roll number + password login ── */
  const handleIdLogin = async (e) => {
    e.preventDefault();
    if (!roll.trim()) { setError('Enter your registration number.'); return; }
    if (!pass) { setError('Enter your password.'); return; }
    setError('');
    setLoading(true);
    try {
      await login(roll.trim(), pass);
    } catch (err) {
      const messages = {
        'auth/user-not-found': 'No account found. Sign in with Google first.',
        'auth/wrong-password': 'Wrong password.',
        'auth/invalid-credential': 'Invalid registration number or password.',
        'auth/invalid-email': 'Invalid registration number format.',
        'auth/too-many-requests': 'Too many attempts. Please wait.',
        'auth/network-request-failed': 'Network error. Check your connection.',
        // Google-only accounts can't use email/password
        'auth/user-disabled': 'This account has been disabled.',
      };
      setError(messages[err.code] || `Login error: ${err.code ?? err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center px-5 py-10">

      {/* Kicked-out banner */}
      <AnimatePresence>
        {kickedOut && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm mx-auto"
          >
            <div className="bg-brand-secondary border-2 border-brand-dark rounded-brutal shadow-brutal px-4 py-3 flex items-start gap-3">
              <span className="text-xl shrink-0">⚠️</span>
              <div>
                <p className="font-sans font-bold text-sm text-brand-dark">Signed out from this device</p>
                <p className="font-sans text-xs text-brand-dark/70 mt-0.5">
                  Your account was signed in on another device. Each account can only be active on one device at a time.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <motion.div
          animate={{ rotate: [0, -8, 8, -4, 4, 0] }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="w-20 h-20 rounded-brutal bg-brand-primary border-2 border-brand-dark shadow-brutal mx-auto flex items-center justify-center text-4xl mb-3"
        >
          🍛
        </motion.div>
        <h1 className="font-serif font-bold text-3xl text-brand-dark">
          Mess<span className="text-brand-gold">App</span>
        </h1>
        <p className="font-sans text-sm text-brand-light mt-1 tracking-widest uppercase">
          GEC Sheikhpura
        </p>
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 26 }}
        className="w-full max-w-sm bg-brand-bg border-2 border-brand-dark rounded-brutal shadow-brutal p-7"
      >
        <AnimatePresence mode="wait">

          {/* ══ STEP: Complete registration (new Google users) ══ */}
          {step === 'complete-registration' && (
            <motion.div key="reg"
              initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}>
              <div className="text-center mb-5">
                <span className="text-3xl">{pendingGoogle?.displayName ? '👋' : '🎓'}</span>
                <h2 className="font-serif font-bold text-xl mt-2">
                  {pendingGoogle?.displayName
                    ? `Hi, ${pendingGoogle.displayName.split(' ')[0]}!`
                    : 'Almost there!'}
                </h2>
                <p className="font-sans text-xs text-brand-light mt-1">
                  Enter your registration number to activate your mess account
                </p>
              </div>
              <form onSubmit={handleCompleteReg} className="flex flex-col gap-4">
                {/* Full Name */}
                <div>
                  <label className="font-sans font-semibold text-xs uppercase tracking-wider text-brand-light mb-1.5 block">
                    Full Name
                  </label>
                  <input
                    value={regName}
                    onChange={e => setRegName(e.target.value)}
                    placeholder="e.g. Rahul Kumar"
                    autoFocus
                    autoComplete="name"
                    className="w-full border-2 border-brand-dark rounded-brutal px-3 py-2.5 font-sans text-sm bg-brand-bg outline-none focus:shadow-brutal-sm transition-shadow"
                  />
                </div>

                {/* Registration Number */}
                <div>
                  <label className="font-sans font-semibold text-xs uppercase tracking-wider text-brand-light mb-1.5 block">
                    Registration Number
                    <span className="normal-case font-normal ml-1 text-brand-light/70">(11 digits)</span>
                  </label>
                  <input
                    value={regRoll}
                    onChange={e => {
                      // Allow only digits, max 11
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                      setRegRoll(digits);
                    }}
                    placeholder="25105157XXX"
                    inputMode="numeric"
                    maxLength={11}
                    className={`w-full border-2 rounded-brutal px-3 py-2.5 font-mono text-sm bg-brand-bg outline-none focus:shadow-brutal-sm transition-shadow
                      ${regRoll.length > 0 && regRoll.length !== 11
                        ? 'border-red-400'
                        : 'border-brand-dark'}`}
                  />
                  {regRoll.length > 0 && regRoll.length !== 11 && (
                    <p className="font-sans text-[10px] text-red-500 mt-1">{regRoll.length}/11 digits entered</p>
                  )}
                  {regRoll.length === 11 && (
                    <p className="font-sans text-[10px] text-green-600 mt-1">✓ Valid length</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="font-sans font-semibold text-xs uppercase tracking-wider text-brand-light mb-1.5 block">
                    Set Password <span className="normal-case font-normal">(for ID login later)</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showRegPass ? 'text' : 'password'}
                      value={regPass}
                      onChange={e => setRegPass(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full border-2 border-brand-dark rounded-brutal px-3 py-2.5 pr-10 font-sans text-sm bg-brand-bg outline-none focus:shadow-brutal-sm transition-shadow"
                    />
                    <button type="button" tabIndex={-1}
                      onClick={() => setShowRegPass(s => !s)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-light hover:text-brand-dark">
                      {showRegPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {error && <ErrorBanner message={error} />}
                <BrutalButton type="submit" fullWidth size="lg" disabled={loading}>
                  {loading ? 'Saving…' : 'Complete Registration →'}
                </BrutalButton>
              </form>
            </motion.div>
          )}

          {/* ══ STEP: Main (Google + ID toggle) ══ */}
          {step === 'main' && (
            <motion.div key="main"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -40 }}>
              <h2 className="font-serif font-bold text-xl mb-1">Sign In</h2>
              <p className="font-sans text-xs text-brand-light mb-6">
                Use your college Google account
              </p>

              {/* Google button */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleGoogle}
                disabled={loading}
                id="btn-google-signin"
                className="w-full flex items-center justify-center gap-3 border-2 border-brand-dark rounded-brutal px-4 py-3.5 bg-white hover:bg-brand-primary/20 shadow-brutal-sm hover:shadow-brutal transition-all font-sans font-semibold text-sm text-brand-dark disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {loading ? 'Opening Google…' : 'Continue with Google'}
              </motion.button>

              {error && <ErrorBanner message={error} className="mt-3" />}

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-brand-dark/15" />
                <span className="font-sans text-xs text-brand-light">or</span>
                <div className="flex-1 h-px bg-brand-dark/15" />
              </div>

              {/* ID login toggle */}
              <button
                id="btn-show-id-login"
                onClick={() => { setStep('id-login'); setError(''); }}
                className="w-full flex items-center justify-between px-4 py-3 border-2 border-brand-dark/30 rounded-brutal hover:border-brand-dark hover:bg-brand-primary/10 transition-all font-sans text-sm font-medium text-brand-dark/70 hover:text-brand-dark"
              >
                <span className="flex items-center gap-2">
                  <Hash size={15} />
                  Login with ID
                </span>
                <ChevronDown size={15} />
              </button>
            </motion.div>
          )}

          {/* ══ STEP: ID login form ══ */}
          {step === 'id-login' && (
            <motion.div key="id"
              initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}>
              <div className="flex items-center gap-3 mb-5">
                <button onClick={() => { setStep('main'); setError(''); }}
                  className="w-8 h-8 flex items-center justify-center rounded-brutal border-2 border-brand-dark hover:bg-brand-primary/20 transition-colors text-brand-dark">
                  <ArrowLeft size={16} />
                </button>
                <h2 className="font-serif font-bold text-lg">Login with ID</h2>
              </div>

              <form onSubmit={handleIdLogin} className="flex flex-col gap-4">
                <div>
                  <label className="font-sans font-semibold text-xs uppercase tracking-wider text-brand-light mb-1.5 block">
                    Registration Number
                  </label>
                  <input
                    id="input-roll"
                    value={roll}
                    onChange={e => setRoll(e.target.value.toUpperCase())}
                    placeholder="e.g. 25105157XXX"
                    autoFocus
                    className="w-full border-2 border-brand-dark rounded-brutal px-3 py-2.5 font-mono text-sm bg-brand-bg outline-none focus:shadow-brutal-sm transition-shadow"
                  />
                </div>
                <div>
                  <label className="font-sans font-semibold text-xs uppercase tracking-wider text-brand-light mb-1.5 block">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="input-password"
                      type={showPass ? 'text' : 'password'}
                      value={pass}
                      onChange={e => setPass(e.target.value)}
                      placeholder="Your password"
                      className="w-full border-2 border-brand-dark rounded-brutal px-3 py-2.5 pr-10 font-sans text-sm bg-brand-bg outline-none focus:shadow-brutal-sm transition-shadow"
                    />
                    <button type="button" tabIndex={-1}
                      onClick={() => setShowPass(s => !s)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-light hover:text-brand-dark">
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {error && <ErrorBanner message={error} />}

                <BrutalButton id="btn-id-login" type="submit" icon={LogIn} fullWidth size="lg" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign In'}
                </BrutalButton>
              </form>

              <p className="font-sans text-xs text-brand-light text-center mt-4">
                No password? Use <button onClick={() => { setStep('main'); setError(''); }}
                  className="underline font-semibold hover:text-brand-dark">Google Sign-In</button> instead.
              </p>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function ErrorBanner({ message, className = '' }) {
  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      className={`font-sans text-xs text-red-600 bg-red-50 border border-red-200 rounded-brutal px-3 py-2 ${className}`}
    >
      ⚠ {message}
    </motion.p>
  );
}
