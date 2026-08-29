import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Save, Plus, Trash2, CalendarDays } from 'lucide-react';
import AnimatedPage from '../../components/AnimatedPage';
import { BrutalCard, BrutalButton } from '../../components/ui';
import { saveTodayMenu, listenTodayMenu } from '../../lib/firestoreService';
import { db } from '../../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { format, startOfWeek, addDays } from 'date-fns';

/* ─────────────────────────────────────────────────────────
   Committee — Menu Manager (Phase 2: live Firestore)
   + Weekly routine table view
───────────────────────────────────────────────────────── */

const DEFAULT_MENU = {
  breakfast: { timing: '8:00 – 9:30 AM',  items: [] },
  lunch:     { timing: '1:00 – 2:30 PM',  items: [] },
  snacks:    { timing: '6:00 – 7:00 PM',  items: [] },
  dinner:    { timing: '8:00 – 9:30 PM',  items: [] },
};
const MEAL_COLORS  = { breakfast: 'bg-brand-primary', lunch: 'bg-brand-secondary', snacks: 'bg-brand-purple', dinner: 'bg-brand-accent' };
const MEAL_EMOJIS  = { breakfast: '☀️', lunch: '🌤️', snacks: '🫖', dinner: '🌙' };
const MEAL_TIMINGS = { breakfast: '8:00–9:30 AM', lunch: '1:00–2:30 PM', snacks: '6:00–7:00 PM', dinner: '8:00–9:30 PM' };

/* ── Meal Editor card ─────────────────────────────────── */
function MealEditor({ meal, data, onChange }) {
  const [newItem, setNewItem] = useState('');
  const addItem = () => {
    if (!newItem.trim()) return;
    onChange({ ...data, items: [...(data.items || []), newItem.trim()] });
    setNewItem('');
  };
  const removeItem = (idx) =>
    onChange({ ...data, items: data.items.filter((_, i) => i !== idx) });

  return (
    <BrutalCard color={MEAL_COLORS[meal]} className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">{MEAL_EMOJIS[meal]}</span>
        <h3 className="font-serif font-bold text-lg capitalize">{meal}</h3>
        <span className="font-sans text-xs text-brand-light ml-auto">{data.timing}</span>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {(data.items || []).map((item, idx) => (
          <span key={idx} className="flex items-center gap-1 px-3 py-1 bg-white/60 border border-brand-dark/20 rounded-pill font-sans text-xs font-medium">
            {item}
            <button onClick={() => removeItem(idx)} className="text-brand-dark/50 hover:text-red-600 ml-1">
              <Trash2 size={10} />
            </button>
          </span>
        ))}
        {data.items?.length === 0 && (
          <span className="font-sans text-xs text-brand-light italic">No items — add below</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addItem())}
          placeholder="Add dish (press Enter)"
          className="flex-1 border-2 border-brand-dark rounded-brutal px-3 py-2 font-sans text-sm bg-white/80 outline-none"
        />
        <button onClick={addItem} className="w-10 h-10 bg-brand-dark text-brand-bg rounded-brutal border-2 border-brand-dark flex items-center justify-center">
          <Plus size={16} />
        </button>
      </div>
    </BrutalCard>
  );
}

/* ── Weekly Routine Table ─────────────────────────────── */
function WeeklyTable() {
  const today     = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Mon
  const days      = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayKey  = format(today, 'yyyy-MM-dd');
  const [weekData, setWeekData] = useState({});

  useEffect(() => {
    const unsubs = days.map(day => {
      const key = format(day, 'yyyy-MM-dd');
      return onSnapshot(doc(db, 'menu', key), snap => {
        setWeekData(prev => ({ ...prev, [key]: snap.exists() ? snap.data() : null }));
      });
    });
    return () => unsubs.forEach(u => u());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const meals = ['breakfast', 'lunch', 'snacks', 'dinner'];

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays size={20} className="text-brand-dark" />
        <h3 className="font-serif font-bold text-xl">Weekly Routine</h3>
        <span className="font-sans text-xs text-brand-light ml-1">This week's saved menus</span>
      </div>

      <div className="overflow-x-auto rounded-brutal border-2 border-brand-dark shadow-brutal">
        <table className="w-full min-w-[640px] border-collapse font-sans text-sm">
          {/* Header row */}
          <thead>
            <tr className="bg-brand-dark text-brand-bg">
              <th className="text-left px-4 py-3 font-serif font-bold text-sm w-28 sticky left-0 bg-brand-dark z-10">
                Meal
              </th>
              {days.map(day => {
                const key     = format(day, 'yyyy-MM-dd');
                const isToday = key === todayKey;
                return (
                  <th key={key} className={`px-3 py-3 text-center font-sans font-semibold text-xs
                    ${isToday ? 'bg-brand-gold text-brand-dark' : ''}`}>
                    <p className="font-bold">{format(day, 'EEE')}</p>
                    <p className="font-normal opacity-70">{format(day, 'd MMM')}</p>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Body rows */}
          <tbody>
            {meals.map((meal, mIdx) => (
              <tr key={meal} className={`border-t-2 border-brand-dark/20 ${mIdx % 2 === 0 ? 'bg-brand-bg' : 'bg-brand-primary/10'}`}>
                {/* Sticky meal label */}
                <td className="px-4 py-3 sticky left-0 bg-inherit z-10 border-r-2 border-brand-dark/20">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">{MEAL_EMOJIS[meal]}</span>
                    <div>
                      <p className="font-bold capitalize text-xs">{meal}</p>
                      <p className="text-[10px] text-brand-light">{MEAL_TIMINGS[meal]}</p>
                    </div>
                  </div>
                </td>

                {/* Day cells */}
                {days.map(day => {
                  const key     = format(day, 'yyyy-MM-dd');
                  const isToday = key === todayKey;
                  const items   = weekData[key]?.[meal]?.items ?? [];

                  return (
                    <td key={key} className={`px-3 py-2 align-top border-l border-brand-dark/10 min-w-[90px]
                      ${isToday ? 'bg-brand-gold/20' : ''}`}>
                      {items.length === 0 ? (
                        <span className="text-[10px] text-brand-light/50 italic">—</span>
                      ) : (
                        <ul className="flex flex-col gap-0.5">
                          {items.map((item, idx) => (
                            <li key={idx} className="text-[11px] leading-tight text-brand-dark/80 flex items-start gap-1">
                              <span className="text-brand-dark/30 shrink-0 mt-0.5">•</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <div className="w-3 h-3 rounded bg-brand-gold border border-brand-dark/30" />
        <span className="font-sans text-xs text-brand-light">Today highlighted in gold</span>
      </div>
    </div>
  );
}

/* ── Main Component ───────────────────────────────────── */
export default function MenuManager() {
  const today = format(new Date(), 'EEEE, dd MMM yyyy');
  const [menu, setMenu]     = useState(DEFAULT_MENU);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  useEffect(() => {
    const unsub = listenTodayMenu((data) => {
      if (!data) return;
      setMenu({
        breakfast: data.breakfast || DEFAULT_MENU.breakfast,
        lunch:     data.lunch     || DEFAULT_MENU.lunch,
        dinner:    data.dinner    || DEFAULT_MENU.dinner,
      });
    });
    return () => unsub?.();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveTodayMenu(menu);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const updateMeal = (meal, data) => setMenu(m => ({ ...m, [meal]: data }));

  return (
    <AnimatedPage direction={1} className="p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="font-serif font-bold text-3xl">Menu <span className="highlight">Manager</span></h2>
          <p className="font-sans text-sm text-brand-light mt-1">{today} — changes go live instantly</p>
        </div>
        <BrutalButton icon={Save} onClick={handleSave} disabled={saving} variant={saved ? 'success' : 'primary'}>
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Menu'}
        </BrutalButton>
      </div>

      {/* Meal editors */}
      <div className="flex flex-col gap-5 max-w-2xl">
        {['breakfast', 'lunch', 'snacks', 'dinner'].map(meal => (
          <motion.div key={meal} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <MealEditor meal={meal} data={menu[meal] ?? DEFAULT_MENU[meal]} onChange={d => updateMeal(meal, d)} />
          </motion.div>
        ))}
      </div>

      {/* Weekly table */}
      <WeeklyTable />
    </AnimatedPage>
  );
}
