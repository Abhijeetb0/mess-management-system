import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, BarChart2, X, Reply, SmilePlus, ChevronDown,
  BarChart3, Check,
} from 'lucide-react';
import { format } from 'date-fns';
import AnimatedPage from '../../components/AnimatedPage';
import { useAuth } from '../../context/AuthContext';
import {
  listenFeedback,
  sendFeedbackMessage,
  sendFeedbackPoll,
  toggleReaction,
  voteOnPoll,
  getMyMessageCountLastHour,
  hasAutoPollForMeal,
} from '../../lib/firestoreService';

/* ─────────────────────────────────────────────────────────
   Student — Feedback / Chat Page
   • Real-time chat via Firestore
   • Reactions (emoji), Replies, Polls
   • Students: max 3 messages / hour
   • Committee: can create polls
   • Auto meal-rating polls after breakfast / lunch / dinner
───────────────────────────────────────────────────────── */

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const MAX_PER_HOUR = 3;
const TODAY_ISO = format(new Date(), 'yyyy-MM-dd');

// Meal auto-poll schedule: {meal, endHour} — poll fires after the meal window
const MEAL_POLLS = [
  { meal: 'breakfast', endHour: 9,  question: 'How was today\'s breakfast? 🌅', options: ['Excellent 🤩', 'Good 👍', 'Average 😐', 'Poor 👎'] },
  { meal: 'lunch',     endHour: 14, question: 'How was today\'s lunch? 🍱',     options: ['Excellent 🤩', 'Good 👍', 'Average 😐', 'Poor 👎'] },
  { meal: 'dinner',    endHour: 21, question: 'How was today\'s dinner? 🌙',    options: ['Excellent 🤩', 'Good 👍', 'Average 😐', 'Poor 👎'] },
];

/* ── Poll Message Card ───────────────────────────────────── */
function PollCard({ msg, uid, isOptedOut }) {
  const opts      = msg.pollOptions || [];
  const totalVotes= opts.reduce((s, o) => s + (o.voters?.length ?? 0), 0);
  const hasVoted  = opts.some(o => o.voters?.includes(uid));
  const myVote    = opts.findIndex(o => o.voters?.includes(uid));
  const canVote   = !isOptedOut || msg.pollMeal == null; // non-meal polls anyone can vote

  const handleVote = async (i) => {
    if (!canVote) return;
    await voteOnPoll(msg.id, uid, i);
  };

  return (
    <div className="rounded-brutal border-2 border-brand-dark bg-brand-bg overflow-hidden shadow-brutal-sm">
      {/* Poll header */}
      <div className="bg-brand-purple px-4 py-2.5 flex items-center gap-2">
        <BarChart3 size={14} className="text-brand-dark" />
        <span className="font-sans font-bold text-xs uppercase tracking-wider text-brand-dark">
          {msg.pollMeal ? `${msg.pollMeal} rating` : 'Poll'}
        </span>
        {msg.isAutomatic && (
          <span className="ml-auto font-sans text-[9px] uppercase tracking-widest text-brand-dark/60 border border-brand-dark/20 px-1.5 rounded-pill">
            Auto
          </span>
        )}
      </div>

      {/* Question */}
      <div className="px-4 pt-3 pb-2">
        <p className="font-sans font-bold text-sm text-brand-dark">{msg.text}</p>
      </div>

      {/* Options */}
      <div className="px-4 pb-4 flex flex-col gap-2">
        {opts.map((opt, i) => {
          const pct      = totalVotes > 0 ? Math.round((opt.voters?.length ?? 0) / totalVotes * 100) : 0;
          const isMine   = myVote === i;
          const showBar  = hasVoted;

          return (
            <motion.button
              key={i}
              onClick={() => handleVote(i)}
              disabled={!canVote}
              whileTap={canVote ? { scale: 0.97 } : {}}
              className={`relative w-full text-left rounded-brutal border-2 overflow-hidden transition-colors
                ${isMine ? 'border-brand-dark' : 'border-brand-dark/30'}
                ${!canVote ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {/* Progress bar bg */}
              {showBar && (
                <motion.div
                  className="absolute inset-y-0 left-0 bg-brand-primary/40"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              )}
              <div className="relative z-10 flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {isMine && <Check size={12} className="text-brand-dark" />}
                  <span className="font-sans text-sm">{opt.label}</span>
                </div>
                {showBar && (
                  <span className="font-mono text-xs font-bold text-brand-dark/60">{pct}%</span>
                )}
              </div>
            </motion.button>
          );
        })}
        <p className="font-sans text-[10px] text-brand-light text-right mt-1">
          {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
          {isOptedOut && msg.pollMeal && (
            <span className="ml-2 text-brand-secondary font-semibold">
              (Voted-out students can't vote on meal polls)
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

/* ── Single Message Row ──────────────────────────────────── */
function MessageRow({ msg, uid, isOptedOut, onReply }) {
  const [showReactions, setShowReactions] = useState(false);
  const isMe = msg.uid === uid;

  const handleReact = async (emoji) => {
    setShowReactions(false);
    await toggleReaction(msg.id, uid, emoji);
  };

  const allReactions = Object.entries(msg.reactions || {}).filter(([, voters]) => voters.length > 0);
  const tsLabel = msg.sentAt?.toDate
    ? format(msg.sentAt.toDate(), 'h:mm a')
    : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}
      id={`msg-${msg.id}`}
    >
      {/* Sender name (not for self) */}
      {!isMe && (
        <div className="flex items-center gap-1.5 ml-1">
          <span className="font-sans font-bold text-xs text-brand-dark">{msg.displayName}</span>
          {msg.role !== 'student' && (
            <span className={`font-sans text-[9px] uppercase tracking-wider px-1.5 py-px rounded-pill border border-brand-dark/20
              ${msg.role === 'committee' ? 'bg-brand-accent' : 'bg-brand-gold'}`}>
              {msg.role === 'super_admin' ? 'Admin' : 'Committee'}
            </span>
          )}
        </div>
      )}

      {/* Bubble or Poll */}
      <div className={`max-w-[78%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        {/* Reply preview */}
        {msg.replyTo && (
          <div className={`text-xs font-sans px-2.5 py-1.5 rounded-t-brutal border-l-4 border-brand-dark/30
            bg-brand-dark/5 text-brand-light line-clamp-1 w-full`}>
            <span className="font-bold text-brand-dark/70">↩ {msg.replyTo.displayName}: </span>
            {msg.replyTo.text}
          </div>
        )}

        {msg.type === 'poll' ? (
          <div className="w-72">
            <PollCard msg={msg} uid={uid} isOptedOut={isOptedOut} />
          </div>
        ) : (
          <div
            className={`px-4 py-2.5 rounded-brutal border-2 border-brand-dark shadow-brutal-sm
              ${isMe ? 'bg-brand-dark text-brand-bg' : 'bg-brand-surface text-brand-dark'}`}
          >
            <p className="font-sans text-sm leading-relaxed break-words">{msg.text}</p>
          </div>
        )}

        {/* Time + Reactions row */}
        <div className={`flex items-center gap-2 flex-wrap ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="font-sans text-[10px] text-brand-light">{tsLabel}</span>

          {/* Existing reactions */}
          {allReactions.map(([emoji, voters]) => (
            <motion.button
              key={emoji}
              whileTap={{ scale: 0.85 }}
              onClick={() => handleReact(emoji)}
              className={`flex items-center gap-0.5 text-xs border rounded-pill px-1.5 py-0.5 transition-colors
                ${voters.includes(uid)
                  ? 'bg-brand-primary border-brand-dark font-bold'
                  : 'bg-brand-bg border-brand-dark/30'}`}
            >
              {emoji}<span className="font-sans font-bold text-[10px] text-brand-dark">{voters.length}</span>
            </motion.button>
          ))}

          {/* React button */}
          <div className="relative">
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => setShowReactions(v => !v)}
              className="text-brand-light hover:text-brand-dark transition-colors"
            >
              <SmilePlus size={14} />
            </motion.button>

            <AnimatePresence>
              {showReactions && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.85, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  className={`absolute z-50 bottom-full mb-1 flex gap-1 bg-brand-bg border-2 border-brand-dark rounded-brutal p-1 shadow-brutal
                    ${isMe ? 'right-0' : 'left-0'}`}
                >
                  {REACTIONS.map(e => (
                    <button key={e} onClick={() => handleReact(e)}
                      className="text-lg hover:scale-125 transition-transform">
                      {e}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Reply button */}
          {msg.type !== 'poll' && (
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => onReply(msg)}
              className="text-brand-light hover:text-brand-dark transition-colors"
            >
              <Reply size={14} />
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Poll Creator Modal (committee only) ─────────────────── */
function PollCreator({ user, onClose }) {
  const [question,   setQuestion]  = useState('');
  const [options,    setOptions]   = useState(['', '']);
  const [submitting, setSubmitting] = useState(false);

  const addOpt = () => options.length < 6 && setOptions(o => [...o, '']);
  const updateOpt = (i, v) => setOptions(o => o.map((x, j) => j === i ? v : x));
  const removeOpt = (i) => options.length > 2 && setOptions(o => o.filter((_, j) => j !== i));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const q    = question.trim();
    const opts = options.map(o => o.trim()).filter(Boolean);
    if (!q || opts.length < 2) return;
    setSubmitting(true);
    try {
      await sendFeedbackPoll(user, q, opts, { isAutomatic: false });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-brand-dark/60 flex items-end justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg bg-brand-bg border-2 border-brand-dark rounded-brutal shadow-brutal-lg p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif font-bold text-lg">Create Poll</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="font-sans text-xs font-bold uppercase tracking-wider text-brand-light mb-1 block">Question</label>
            <input
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Ask something..."
              className="w-full border-2 border-brand-dark rounded-brutal px-3 py-2 font-sans text-sm bg-brand-bg outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="font-sans text-xs font-bold uppercase tracking-wider text-brand-light mb-1 block">Options</label>
            <div className="flex flex-col gap-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={opt}
                    onChange={e => updateOpt(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 border-2 border-brand-dark rounded-brutal px-3 py-2 font-sans text-sm bg-brand-bg outline-none"
                  />
                  {options.length > 2 && (
                    <button type="button" onClick={() => removeOpt(i)} className="text-brand-light hover:text-brand-dark">
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}
              {options.length < 6 && (
                <button type="button" onClick={addOpt}
                  className="font-sans text-xs text-brand-light hover:text-brand-dark border-2 border-dashed border-brand-dark/30 rounded-brutal py-2 transition-colors">
                  + Add option
                </button>
              )}
            </div>
          </div>
          <motion.button
            type="submit"
            disabled={submitting}
            whileTap={{ scale: 0.97 }}
            className="mt-1 w-full bg-brand-dark text-brand-bg font-sans font-bold text-sm py-3 rounded-brutal border-2 border-brand-dark shadow-brutal disabled:opacity-50"
          >
            {submitting ? 'Sending…' : 'Send Poll'}
          </motion.button>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* ── Main Feedback Page ───────────────────────────────────── */
export default function Feedback({ direction }) {
  const { user } = useAuth();
  const [messages,    setMessages]    = useState([]);
  const [text,        setText]        = useState('');
  const [replyTo,     setReplyTo]     = useState(null);
  const [showPollUI,  setShowPollUI]  = useState(false);
  const [msgCount,    setMsgCount]    = useState(0);
  const [rateLimited, setRateLimited] = useState(false);
  const [sending,     setSending]     = useState(false);
  const [scrolledUp,  setScrolledUp]  = useState(false);
  const bottomRef = useRef(null);
  const listRef   = useRef(null);

  const isCommittee = ['committee', 'super_admin'].includes(user?.role);
  const isStudent   = user?.role === 'student';

  // Check if the student is opted out (has an active pending/approved opt-out covering today)
  const isOptedOut = false; // TODO: hook into opt-out state if needed

  /* Live messages */
  useEffect(() => {
    const unsub = listenFeedback(setMessages);
    return () => unsub?.();
  }, []);

  /* Auto-scroll on new message */
  useEffect(() => {
    if (!scrolledUp) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, scrolledUp]);

  /* Rate-limit check */
  useEffect(() => {
    if (!user?.uid || !isStudent) return;
    getMyMessageCountLastHour(user.uid).then(n => {
      setMsgCount(n);
      setRateLimited(n >= MAX_PER_HOUR);
    });
  }, [user?.uid, messages.length, isStudent]);

  /* Auto-poll trigger — fires for committee/admin when page loads.
     Uses sequential for...of (not forEach) so each Firestore check
     completes before the next — prevents race-condition duplicates. */
  useEffect(() => {
    if (!isCommittee || !user) return;
    const now  = new Date();
    const hour = now.getHours();
    const date = format(now, 'yyyy-MM-dd');

    (async () => {
      for (const { meal, endHour, question, options } of MEAL_POLLS) {
        if (hour < endHour) continue; // meal hasn't ended yet
        const already = await hasAutoPollForMeal(meal, date);
        if (already) continue;
        await sendFeedbackPoll(
          { uid: user.uid, displayName: 'Mess Committee', rollNumber: '', role: user.role },
          question,
          options,
          { isAutomatic: true, pollMeal: meal, pollDate: date }
        );
      }
    })();
  }, [isCommittee, user]);

  /* Latest active poll (for quick-vote button in input bar) */
  const latestPoll = [...messages].reverse().find(m => m.type === 'poll');

  /* Scroll detection */
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setScrolledUp(el.scrollHeight - el.scrollTop - el.clientHeight > 80);
  }, []);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    if (isStudent && rateLimited) return;
    setSending(true);
    try {
      await sendFeedbackMessage(user, text.trim(), replyTo);
      setText('');
      setReplyTo(null);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <>
      <AnimatePresence>
        {showPollUI && isCommittee && (
          <PollCreator user={user} onClose={() => setShowPollUI(false)} />
        )}
      </AnimatePresence>

      <AnimatedPage direction={direction} className="flex flex-col h-[calc(100dvh-4rem-1px)]">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b-2 border-brand-dark/10 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif font-bold text-xl text-brand-dark">Feedback</h2>
              <p className="font-sans text-xs text-brand-light mt-0.5">Chat with your mess committee</p>
            </div>
            {isStudent && (
              <div className="flex items-center gap-1">
                {[0,1,2].map(i => (
                  <div key={i}
                    className={`w-2 h-2 rounded-full border border-brand-dark/30
                      ${i < msgCount ? 'bg-brand-secondary' : 'bg-brand-dark/10'}`}
                  />
                ))}
                <span className="font-sans text-[10px] text-brand-light ml-1">{msgCount}/3/hr</span>
              </div>
            )}
          </div>
        </div>

        {/* Messages list */}
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4"
        >
          {messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
              <span className="text-5xl mb-3">💬</span>
              <p className="font-sans font-bold text-sm text-brand-dark">No messages yet</p>
              <p className="font-sans text-xs text-brand-light mt-1">Be the first to say something!</p>
            </div>
          )}
          {messages.map(msg => (
            <MessageRow
              key={msg.id}
              msg={msg}
              uid={user?.uid}
              isOptedOut={isOptedOut}
              onReply={setReplyTo}
            />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Scroll-to-bottom button */}
        <AnimatePresence>
          {scrolledUp && (
            <motion.button
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              onClick={() => { setScrolledUp(false); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
              className="absolute bottom-24 right-5 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-brand-dark text-brand-bg border-2 border-brand-dark shadow-brutal-sm"
            >
              <ChevronDown size={16} />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Reply preview strip */}
        <AnimatePresence>
          {replyTo && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-4 pt-2 pb-1 border-t border-brand-dark/10 bg-brand-primary/10 shrink-0 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Reply size={13} className="text-brand-light shrink-0" />
                <p className="font-sans text-xs text-brand-dark truncate">
                  <span className="font-bold">{replyTo.displayName}: </span>{replyTo.text}
                </p>
              </div>
              <button onClick={() => setReplyTo(null)} className="shrink-0 text-brand-light hover:text-brand-dark">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input bar */}
        <div className="px-3 py-3 border-t-2 border-brand-dark/10 bg-brand-bg shrink-0 safe-bottom">
          {rateLimited && isStudent && (
            <p className="font-sans text-[10px] text-brand-secondary text-center mb-2 font-semibold">
              ⏳ Limit reached — 3 messages per hour max. Try again later.
            </p>
          )}
          <div className="flex items-end gap-2">
            {/* Poll button (committee only) */}
            {isCommittee && (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowPollUI(true)}
                className="shrink-0 w-10 h-10 flex items-center justify-center border-2 border-brand-dark rounded-brutal bg-brand-purple hover:shadow-brutal-sm transition-shadow"
                title="Create poll"
              >
                <BarChart2 size={18} className="text-brand-dark" />
              </motion.button>
            )}

            {/* Text input */}
            <div className="relative flex-1">
              <textarea
                rows={1}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={rateLimited && isStudent}
                placeholder={
                  rateLimited && isStudent
                    ? 'Hourly limit reached…'
                    : 'Write a message…'
                }
                className="w-full border-2 border-brand-dark rounded-brutal px-3 py-2.5 pr-10 font-sans text-sm bg-brand-bg outline-none resize-none focus:shadow-brutal-sm transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ maxHeight: 100 }}
              />
            </div>

            {/* Quick-vote button — jumps to latest poll */}
            {latestPoll && (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  const el = document.getElementById(`msg-${latestPoll.id}`);
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  setScrolledUp(false);
                }}
                className="shrink-0 w-10 h-10 flex items-center justify-center border-2 border-brand-dark rounded-brutal bg-brand-gold/80 hover:shadow-brutal-sm transition-shadow"
                title="Jump to latest poll"
              >
                <BarChart3 size={17} className="text-brand-dark" />
              </motion.button>
            )}

            {/* Send button */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleSend}
              disabled={(rateLimited && isStudent) || !text.trim() || sending}
              className="shrink-0 w-10 h-10 flex items-center justify-center border-2 border-brand-dark rounded-brutal bg-brand-dark text-brand-bg shadow-brutal-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send size={16} />
            </motion.button>
          </div>
        </div>
      </AnimatedPage>
    </>
  );
}
