import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, User, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BrutalButton } from '../../components/ui';

/* ─────────────────────────────────────────────────────────
   Login Page — Roll Number + Password auth
───────────────────────────────────────────────────────── */

export default function LoginPage() {
  const { login } = useAuth();
  const [rollNumber, setRollNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rollNumber.trim() || !password.trim()) {
      setError('Please fill in both fields.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(rollNumber.trim().toUpperCase(), password);
    } catch (err) {
      setError('Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-brand-bg flex flex-col items-center justify-center p-6">
      {/* Floating decoration */}
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="text-7xl mb-2 select-none"
      >
        🍱
      </motion.div>

      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-center mb-8"
      >
        <h1 className="font-serif font-bold text-4xl text-brand-dark">
          Mess<span className="text-brand-gold">App</span>
        </h1>
        <div className="inline-flex items-center gap-2 mt-2 px-4 py-1.5 rounded-pill border-2 border-brand-dark bg-brand-bg shadow-brutal-sm">
          <span className="font-sans font-semibold text-xs uppercase tracking-widest text-brand-dark">
            GEC Sheikhpura · Mess Portal
          </span>
        </div>
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 25 }}
        className="w-full max-w-sm bg-brand-surface border-2 border-brand-dark rounded-brutal shadow-brutal p-6"
      >
        <h2 className="font-serif font-bold text-xl mb-5 text-brand-dark">Sign In</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Roll Number */}
          <div className="flex flex-col gap-1.5">
            <label className="font-sans font-semibold text-xs uppercase tracking-wider text-brand-light">
              Roll Number
            </label>
            <div className="flex items-center gap-2 border-2 border-brand-dark rounded-brutal px-3 py-2.5 bg-brand-bg focus-within:shadow-brutal-sm transition-shadow">
              <User size={16} className="text-brand-light shrink-0" />
              <input
                type="text"
                value={rollNumber}
                onChange={e => setRollNumber(e.target.value)}
                placeholder="e.g. 25105157XXX"
                className="flex-1 bg-transparent font-sans text-sm text-brand-dark placeholder:text-brand-light/60 outline-none uppercase"
                autoComplete="username"
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label className="font-sans font-semibold text-xs uppercase tracking-wider text-brand-light">
              Password
            </label>
            <div className="flex items-center gap-2 border-2 border-brand-dark rounded-brutal px-3 py-2.5 bg-brand-bg focus-within:shadow-brutal-sm transition-shadow">
              <Lock size={16} className="text-brand-light shrink-0" />
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Your password"
                className="flex-1 bg-transparent font-sans text-sm text-brand-dark placeholder:text-brand-light/60 outline-none"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPass(p => !p)}
                className="text-brand-light hover:text-brand-dark transition-colors"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 rounded-brutal border-2 border-brand-dark bg-brand-secondary text-sm font-sans"
            >
              <span>⚠️</span> {error}
            </motion.div>
          )}

          <BrutalButton
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In →'}
          </BrutalButton>
        </form>

        <p className="mt-4 text-center text-xs font-sans text-brand-light">
          Forgot password? Contact the Mess Committee.
        </p>
      </motion.div>

      {/* Footer */}
      <p className="mt-8 text-xs font-sans text-brand-light text-center">
        GEC Sheikhpura Mess Management System
      </p>
    </div>
  );
}
