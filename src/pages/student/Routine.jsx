import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import AnimatedPage from '../../components/AnimatedPage';
import { BrutalCard, BrutalBadge } from '../../components/ui';
import TokenOverlay from '../../components/TokenOverlay';
import { listenTodayMenu, listenAnnouncements, listenMyActiveOptOut, getOptOutEndDate } from '../../lib/firestoreService';
import { useAuth } from '../../context/AuthContext';



const FALLBACK_MEALS = [
  { id: 'breakfast', type: 'Breakfast', timing: '8:00 – 9:30 AM', emoji: '☀️', color: 'bg-brand-primary', items: ['Aloo Paratha', 'Curd', 'Chai'] },
  { id: 'lunch', type: 'Lunch', timing: '1:00 – 2:30 PM', emoji: '🌤️', color: 'bg-brand-secondary', items: ['Rajma Chawal', 'Roti', 'Lassi'] },
  { id: 'snacks', type: 'Snacks', timing: '6:00 – 7:00 PM', emoji: '🫖', color: 'bg-brand-purple', items: ['Samosa', 'Chai'] },
  { id: 'dinner', type: 'Dinner', timing: '8:00 – 9:30 PM', emoji: '🌙', color: 'bg-brand-accent', items: ['Dal Tadka', 'Roti', 'Rice'] },
];
const MEAL_META = {
  breakfast: { emoji: '☀️', color: 'bg-brand-primary', timing: '8:00 – 9:30 AM' },
  lunch: { emoji: '🌤️', color: 'bg-brand-secondary', timing: '1:00 – 2:30 PM' },
  snacks: { emoji: '🫖', color: 'bg-brand-purple', timing: '6:00 – 7:00 PM' },
  dinner: { emoji: '🌙', color: 'bg-brand-accent', timing: '8:00 – 9:30 PM' },
};

function getMealStatus(mealId) {
  const h = new Date().getHours();
  if (mealId === 'breakfast') return h < 8 ? 'upcoming' : h < 10 ? 'serving' : 'done';
  if (mealId === 'lunch') return h < 13 ? 'upcoming' : h < 15 ? 'serving' : 'done';
  if (mealId === 'snacks') return h < 18 ? 'upcoming' : h < 19 ? 'serving' : 'done';
  return h < 20 ? 'upcoming' : h < 22 ? 'serving' : 'done'; // dinner
}
const STATUS_BADGE = {
  upcoming: { label: 'Upcoming', color: 'bg-brand-purple' },
  serving: { label: '🍽 Serving', color: 'bg-brand-accent' },
  done: { label: 'Closed', color: 'bg-brand-dark text-brand-bg' },
};

export default function Routine({ direction }) {
  const { user } = useAuth();
  const today = format(new Date(), 'EEEE, dd MMMM yyyy');
  const todayISO = format(new Date(), 'yyyy-MM-dd');
  const [showToken, setShowToken] = useState(false);
  const [meals, setMeals] = useState(FALLBACK_MEALS);
  const [announcements, setAnnouncements] = useState([]);
  const [activeOptOut, setActiveOptOut] = useState(null);

  // Live menu from Firestore
  useEffect(() => {
    const unsub = listenTodayMenu((data) => {
      if (!data) return;
      const parsed = ['breakfast', 'lunch', 'snacks', 'dinner'].map(id => ({
        id,
        type: id.charAt(0).toUpperCase() + id.slice(1),
        items: data[id]?.items || [],
        ...MEAL_META[id],
      }));
      setMeals(parsed);
    });
    return () => unsub?.();
  }, []);

  // Live announcements
  useEffect(() => {
    const unsub = listenAnnouncements(setAnnouncements);
    return () => unsub?.();
  }, []);

  // Am I opted out today? (gate deny hoga to pehle se pata chale)
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = listenMyActiveOptOut(user.uid, todayISO, setActiveOptOut);
    return () => unsub?.();
  }, [user?.uid, todayISO]);

  return (
    <>
      <AnimatedPage direction={direction} className="px-5 pt-5 pb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-serif font-bold text-2xl text-brand-dark">
              Today's <span className="highlight">Menu</span>
            </h2>
            <p className="font-sans text-sm text-brand-light mt-0.5">{today}</p>
          </div>
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={() => setShowToken(true)}
            className="px-4 py-2.5 bg-brand-secondary border-2 border-brand-dark rounded-brutal shadow-brutal-sm font-sans font-bold text-sm text-brand-dark hover:shadow-brutal transition-shadow"
          >
            Show Token
          </motion.button>
        </div>

        {activeOptOut && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-4 border-2 border-brand-dark rounded-brutal p-4 shadow-brutal-sm bg-brand-secondary">
            <p className="font-sans font-bold text-sm">⛔ You are opted out today</p>
            <p className="font-sans text-xs text-brand-dark/70 mt-0.5">
              {activeOptOut.startDate} → {getOptOutEndDate(activeOptOut.startDate, activeOptOut.numDays)} · Gate par entry deny hogi.
            </p>
          </motion.div>
        )}

        {/* Meal cards */}
        <div className="flex flex-col gap-4">
          {meals.map((meal, i) => {
            const status = getMealStatus(meal.id);
            const badge = STATUS_BADGE[status];
            return (
              <motion.div
                key={meal.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, type: 'spring', stiffness: 300, damping: 22 }}
              >
                <BrutalCard color={meal.color} className={`p-5 ${status === 'done' ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{meal.emoji}</span>
                      <div>
                        <h3 className="font-serif font-bold text-lg leading-none">{meal.type}</h3>
                        <p className="font-sans text-xs text-brand-light mt-0.5">{meal.timing}</p>
                      </div>
                    </div>
                    <BrutalBadge color={badge.color}>{badge.label}</BrutalBadge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {meal.items.length > 0
                      ? meal.items.map(item => (
                        <span key={item} className="px-3 py-1 bg-white/60 border border-brand-dark/20 rounded-pill font-sans text-xs font-medium">
                          {item}
                        </span>
                      ))
                      : <span className="font-sans text-xs text-brand-light italic">Menu not set yet</span>
                    }
                  </div>
                </BrutalCard>
              </motion.div>
            );
          })}
        </div>

        {/* Announcements heading */}
        {announcements.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
            className="mt-6 mb-1 flex items-center gap-2"
          >
            <h3 className="font-serif font-bold text-lg text-brand-dark">Announcements</h3>
            <span className="flex-1 h-0.5 bg-brand-dark/10 rounded" />
          </motion.div>
        )}

        {/* Announcements */}
        {announcements.slice(0, 3).map((ann, i) => (
          <motion.div
            key={ann.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.06 }}
            className="mt-2 bg-brand-purple border-2 border-brand-dark rounded-brutal p-4 shadow-brutal-sm"
          >
            <p className="font-sans font-semibold text-xs uppercase tracking-wider text-brand-light mb-1">
              📢 {ann.title || 'Announcement'}
            </p>
            <p className="font-sans text-sm text-brand-dark">{ann.body}</p>
            <p className="font-sans text-[10px] text-brand-light/70 mt-2">
              🕐 {ann.createdAt?.toDate
                ? new Date(ann.createdAt.toDate()).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })
                : 'Just now'}
            </p>
          </motion.div>
        ))}

        {/* Fallback announcement if none from Firestore */}
        {announcements.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="mt-5 bg-brand-purple border-2 border-brand-dark rounded-brutal p-4 shadow-brutal-sm"
          >
            <p className="font-sans font-semibold text-xs uppercase tracking-wider text-brand-light mb-1">
              📢 Announcement
            </p>
            <p className="font-sans text-sm text-brand-dark">
              Welcome to GEC Sheikhpura Mess Management System.
            </p>
          </motion.div>
        )}
      </AnimatedPage>

      {showToken && <TokenOverlay onClose={() => setShowToken(false)} />}
    </>
  );
}
