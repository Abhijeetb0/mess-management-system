import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, CalendarDays, Megaphone,
  Wallet, Users, LogOut, ChefHat, Hammer,
  MessageSquare, UserCheck, ArrowLeftRight, Menu, X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/* ─────────────────────────────────────────────────────────
   SideNav — Left sidebar for Committee & Super Admin panels
   • Desktop/tablet: fixed left sidebar (w-64)
   • Mobile: slide-in drawer with hamburger toggle
   • "Student View" button at bottom for quick panel switch
───────────────────────────────────────────────────────── */

const COMMITTEE_TABS = [
  { path: '/committee/dashboard',  label: 'Dashboard',     Icon: LayoutDashboard },
  { path: '/committee/menu',       label: 'Menu Manager',  Icon: CalendarDays    },
  { path: '/committee/announce',   label: 'Announcements', Icon: Megaphone       },
  { path: '/committee/ledger',     label: 'Ledger',        Icon: Wallet          },
  { path: '/committee/students',   label: 'Students',      Icon: Users           },
  { path: '/committee/feedback',   label: 'Feedback',      Icon: MessageSquare   },
];

const ADMIN_TABS = [
  { path: '/superadmin/dashboard',  label: 'Control Panel', Icon: LayoutDashboard },
  { path: '/superadmin/committee',  label: 'Committee',     Icon: Users           },
  { path: '/superadmin/workers',    label: 'Workers',       Icon: Hammer          },
  { path: '/superadmin/students',   label: 'Students',      Icon: UserCheck       },
  { path: '/superadmin/succession', label: 'Succession',    Icon: ChefHat         },
  { path: '/superadmin/feedback',   label: 'Feedback',      Icon: MessageSquare   },
];

/* ── Inner nav content (shared between drawer and sidebar) ── */
function NavContent({ tabs, onNavigate, variant }) {
  const location = useLocation();
  const navigate  = useNavigate();
  const { user, logout } = useAuth();

  const go = (path) => {
    navigate(path);
    onNavigate?.(); // close drawer on mobile
  };

  // Cross-layout navigation needs a full page transition
  const goStudent = () => {
    onNavigate?.();
    window.location.href = '/student/routine';
  };

  return (
    <>
      {/* Logo */}
      <div className="p-6 border-b-2 border-brand-dark">
        <h1 className="font-serif font-bold text-2xl text-brand-dark leading-tight">
          Mess<span className="text-brand-gold">App</span>
        </h1>
        <p className="text-xs font-sans text-brand-light mt-0.5 uppercase tracking-widest">
          GEC Sheikhpura
        </p>
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-4 flex flex-col gap-1 overflow-y-auto">
        {tabs.map((tab) => {
          const isActive = location.pathname.startsWith(tab.path);
          return (
            <motion.button
              key={tab.path}
              onClick={() => go(tab.path)}
              whileTap={{ scale: 0.97 }}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-brutal text-sm font-sans font-medium
                transition-all duration-150 w-full text-left
                ${isActive
                  ? 'bg-brand-dark text-brand-bg shadow-brutal-sm'
                  : 'text-brand-dark hover:bg-brand-primary/40'}
              `}
            >
              <tab.Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              {tab.label}
            </motion.button>
          );
        })}
      </nav>

      {/* User info + switch + logout */}
      <div className="p-4 border-t-2 border-brand-dark">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-brand-primary border-2 border-brand-dark flex items-center justify-center font-serif font-bold text-sm shrink-0">
            {user?.displayName?.[0] ?? 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-sans font-semibold text-sm truncate">{user?.displayName}</p>
            <p className="font-sans text-xs text-brand-light capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>

        {/* Switch to student view — committee only, not admin */}
        {variant === 'committee' && (
          <button
            onClick={goStudent}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-brutal text-sm font-sans font-medium text-brand-dark hover:bg-brand-accent/40 transition-colors mb-1"
          >
            <ArrowLeftRight size={15} />
            Student View
          </button>
        )}

        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-brutal text-sm font-sans font-medium text-brand-dark hover:bg-brand-secondary/40 transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </>
  );
}

export default function SideNav({ variant = 'committee' }) {
  const tabs = variant === 'committee' ? COMMITTEE_TABS : ADMIN_TABS;
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* ── Mobile top bar (hamburger) ─────────────────── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-brand-bg border-b-2 border-brand-dark flex items-center justify-between px-4 h-14">
        <span className="font-serif font-bold text-xl">
          Mess<span className="text-brand-gold">App</span>
        </span>
        <button
          onClick={() => setDrawerOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-brutal border-2 border-brand-dark"
        >
          <Menu size={18} />
        </button>
      </div>

      {/* ── Mobile drawer overlay ──────────────────────── */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="lg:hidden fixed inset-0 bg-brand-dark/40 z-40"
            />
            {/* Drawer */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="lg:hidden fixed top-0 left-0 bottom-0 z-50 w-72 flex flex-col border-r-2 border-brand-dark bg-brand-bg shadow-brutal"
            >
              {/* Close button */}
              <button
                onClick={() => setDrawerOpen(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-brutal border-2 border-brand-dark"
              >
                <X size={15} />
              </button>
              <NavContent tabs={tabs} onNavigate={() => setDrawerOpen(false)} variant={variant} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Desktop sidebar ────────────────────────────── */}
      <aside className="no-print hidden lg:flex w-64 h-screen flex-col border-r-2 border-brand-dark bg-brand-bg sticky top-0 overflow-hidden">
        <NavContent tabs={tabs} onNavigate={undefined} variant={variant} />
      </aside>
    </>
  );
}
