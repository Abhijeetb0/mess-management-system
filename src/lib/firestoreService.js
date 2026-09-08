// ─────────────────────────────────────────────────────────
//  src/lib/firestoreService.js
//  All Firestore read/write helpers — imported by components
// ─────────────────────────────────────────────────────────
import {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, onSnapshot, limit,
  serverTimestamp, getDocs, runTransaction,
} from 'firebase/firestore';
import { db } from './firebase';
import { format, addDays, parseISO } from 'date-fns';

const TODAY = () => format(new Date(), 'yyyy-MM-dd');

/* ── Opt-out date helpers (shared by UI + gate) ──────────── */
// ISO yyyy-MM-dd strings compare lexically, so range checks are safe.
export const getOptOutEndDate = (startDate, numDays) => {
  try {
    return format(addDays(parseISO(startDate), Math.max(1, Number(numDays) || 1) - 1), 'yyyy-MM-dd');
  } catch {
    return startDate;
  }
};
export const isDateInOptOutRange = (dateISO, startDate, numDays) => {
  if (!dateISO || !startDate) return false;
  const end = getOptOutEndDate(startDate, numDays);
  return startDate <= dateISO && dateISO <= end;
};
export const rangesOverlap = (aStart, aEnd, bStart, bEnd) =>
  aStart <= bEnd && bStart <= aEnd;

/* ── Users ──────────────────────────────────────────────── */

/** Fetch a single user document */
export const getUser = (uid) =>
  getDoc(doc(db, 'users', uid)).then(s => s.exists() ? { uid, ...s.data() } : null);

/** Create or overwrite a user document (used during registration) */
export const setUser = (uid, data) =>
  setDoc(doc(db, 'users', uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });

/** Fetch all users with role = 'student' */
export const getAllStudents = () =>
  getDocs(query(collection(db, 'users'), where('role', '==', 'student')))
    .then(snap => snap.docs.map(d => ({ uid: d.id, ...d.data() })));

/** Live listener for all students (so approval status updates in real-time) */
export const listenAllStudents = (callback) => {
  const q = query(collection(db, 'users'), where('role', '==', 'student'));
  return onSnapshot(q, snap =>
    callback(
      snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .sort((a, b) => (a.rollNumber || '').localeCompare(b.rollNumber || ''))
    )
  );
};

/** Approve a student registration (sets isApproved: true) */
export const approveStudent = (uid) =>
  updateDoc(doc(db, 'users', uid), { isApproved: true,  updatedAt: serverTimestamp() });

/** Reject / unapprove a student registration */
export const rejectStudent = (uid) =>
  updateDoc(doc(db, 'users', uid), { isApproved: false, updatedAt: serverTimestamp() });

/** Fetch all users with role = 'committee' */
export const getAllCommittee = () =>
  getDocs(query(collection(db, 'users'), where('role', '==', 'committee')))
    .then(snap => snap.docs.map(d => ({ uid: d.id, ...d.data() })));

/** Update a user's role (Super Admin only — enforced by security rules) */
export const setUserRole = (uid, role) =>
  updateDoc(doc(db, 'users', uid), { role, updatedAt: serverTimestamp() });

/** Update wallet balance */
export const updateWallet = (uid, newBalance) =>
  updateDoc(doc(db, 'users', uid), { walletBalance: newBalance, updatedAt: serverTimestamp() });

/** Find a student by roll number (case-insensitive) — worker fallback + penalty form */
export const getUserByRollNumber = async (rollNumber) => {
  const clean = (rollNumber || '').trim().toLowerCase();
  if (!clean) return null;
  const all = await getAllStudents();
  return all.find(s => (s.rollNumber || '').toLowerCase() === clean) || null;
};

/* ── Opt-Out Requests ───────────────────────────────────── */

/** Check if a new range overlaps the student's pending/approved requests */
export const checkOptOutOverlap = async (uid, newStartDate, newNumDays, ignoreId = null) => {
  const newEnd = getOptOutEndDate(newStartDate, newNumDays);
  const snap = await getDocs(query(collection(db, 'optouts'), where('uid', '==', uid)));
  const clash = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(r => (r.status === 'pending' || r.status === 'approved') && r.id !== ignoreId)
    .find(r => {
      if (!r.startDate) return false;
      const existingEnd = getOptOutEndDate(r.startDate, r.numDays);
      return rangesOverlap(newStartDate, newEnd, r.startDate, existingEnd);
    });
  return clash || null;
};

/** Submit a new opt-out request */
export const submitOptOut = async (uid, data) => {
  // Same-day opt-out block — UI bypass ho tab bhi guard rahe
  if (!data?.startDate || data.startDate <= TODAY()) {
    throw new Error('SAME_DAY_NOT_ALLOWED');
  }
  const days = Number(data.numDays) || 0;
  if (!days || days < 1 || days > 30) throw new Error('INVALID_DAYS');
  if (!data?.reason?.trim()) throw new Error('REASON_REQUIRED');
  const clash = await checkOptOutOverlap(uid, data.startDate, days);
  if (clash) {
    const err = new Error('OVERLAP_EXISTS');
    err.clash = clash;
    throw err;
  }
  const ref = await addDoc(collection(db, 'optouts'), {
    uid,
    ...data,               // startDate, numDays, reason, docBase64, docFileName
    status:      'pending',
    submittedAt: serverTimestamp(),
  });
  return ref.id;
};

/** Live listener for pending opt-out requests (committee view) */
export const listenPendingOptOuts = (callback) => {
  // Only filter by status — no orderBy to avoid needing a composite index
  const q = query(
    collection(db, 'optouts'),
    where('status', '==', 'pending')
  );
  return onSnapshot(q, snap =>
    callback(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.submittedAt?.seconds ?? 0) - (a.submittedAt?.seconds ?? 0))
    )
  );
};

/** Live listener for ALL opt-out requests (admin/committee overview) */
export const listenAllOptOuts = (callback, max = 100) => {
  const q = query(
    collection(db, 'optouts'),
    orderBy('submittedAt', 'desc'),
    limit(max)
  );
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
};

/* ── Active opt-outs (gate check — blocklist doc ki jagah direct query) ── */

/** UIDs jinka approved opt-out `dateISO` ko cover karta hai (one-shot, worker gate) */
export const getActiveOptOutUIDs = async (dateISO = TODAY()) => {
  const snap = await getDocs(
    query(collection(db, 'optouts'), where('status', '==', 'approved'))
  );
  const set = new Set();
  snap.docs.forEach(d => {
    const r = d.data();
    if (r.startDate && isDateInOptOutRange(dateISO, r.startDate, r.numDays)) set.add(r.uid);
  });
  return set;
};

/** Live version — committee approve karte hi gate list update */
export const listenActiveOptOuts = (dateISO, callback) => {
  const q = query(collection(db, 'optouts'), where('status', '==', 'approved'));
  return onSnapshot(q, snap => {
    const set = new Set();
    const rows = [];
    snap.docs.forEach(d => {
      const r = { id: d.id, ...d.data() };
      if (r.startDate && isDateInOptOutRange(dateISO, r.startDate, r.numDays)) {
        set.add(r.uid);
        rows.push(r);
      }
    });
    callback(set, rows);
  });
};

/** Student ka koi approved opt-out `dateISO` ko cover karta hai? (Routine banner + Token block) */
export const listenMyActiveOptOut = (uid, dateISO, callback) => {
  const q = query(collection(db, 'optouts'), where('uid', '==', uid), where('status', '==', 'approved'));
  return onSnapshot(q, snap => {
    const hit = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .find(r => r.startDate && isDateInOptOutRange(dateISO, r.startDate, r.numDays));
    callback(hit || null);
  });
};

/** Approve: status → 'approved', credit refund to wallet (transactional) */
export const approveOptOut = async (requestId, { uid, refundAmount, processedBy = 'Committee' }) => {
  // Wallet hamesha transaction me fresh read hota hai — stale balance / double-credit safe
  await runTransaction(db, async (tx) => {
    const optRef = doc(db, 'optouts', requestId);
    const optSnap = await tx.get(optRef);
    if (!optSnap.exists()) throw new Error('REQUEST_NOT_FOUND');
    if (optSnap.data().status !== 'pending') throw new Error('ALREADY_PROCESSED');
    const userRef = doc(db, 'users', uid);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) throw new Error('Student not found');
    const freshBalance = userSnap.data().walletBalance || 0;
    tx.update(optRef, {
      status: 'approved',
      processedAt: serverTimestamp(),
      processedBy,
    });
    tx.update(userRef, {
      walletBalance: freshBalance + (refundAmount || 0),
      updatedAt: serverTimestamp(),
    });
  });
};

/** Reject: status → 'rejected' (reason mandatory — UI enforce karta hai) */
export const rejectOptOut = (requestId, rejectReason = '', rejectedBy = 'Committee') =>
  updateDoc(doc(db, 'optouts', requestId), {
    status: 'rejected',
    rejectReason: (rejectReason || '').trim(),
    processedAt: serverTimestamp(),
    processedBy: rejectedBy,
  });

/** Student cancels own pending request — audit ke liye status='cancelled' */
export const cancelOptOut = (requestId) =>
  updateDoc(doc(db, 'optouts', requestId), {
    status: 'cancelled',
    cancelledAt: serverTimestamp(),
  });

/** Get a student's own opt-out history */
export const listenMyOptOuts = (uid, callback) => {
  // Filter by uid only — no orderBy to avoid composite index requirement
  const q = query(
    collection(db, 'optouts'),
    where('uid', '==', uid)
  );
  return onSnapshot(q, snap =>
    callback(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.submittedAt?.seconds ?? 0) - (a.submittedAt?.seconds ?? 0))
    )
  );
};

/* ── Daily Token ────────────────────────────────────────── */

/** Get today's token document */
export const getDailyToken = () =>
  getDoc(doc(db, 'system', 'dailyToken')).then(s => s.exists() ? s.data() : null);

/** Live listener for the daily token */
export const listenDailyToken = (callback) =>
  onSnapshot(doc(db, 'system', 'dailyToken'), snap =>
    snap.exists() && callback(snap.data())
  );

/** Set today's token (committee/admin) */
export const setDailyToken = (data) =>
  setDoc(doc(db, 'system', 'dailyToken'), {
    ...data,
    activeDate: TODAY(),
    updatedAt:  serverTimestamp(),
  });

/* ── Blocklist ──────────────────────────────────────────── */

/** Get today's opt-out blocklist as an array of UIDs */
export const getTodayBlocklist = async () => {
  const ref = doc(db, 'blocklist', TODAY());
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data().uids || []) : [];
};

/** Rebuild blocklist from approved opt-outs for today
    (Legacy — gate ab direct query use karta hai; sirf backward-compat ke liye rakha hai) */
export const rebuildBlocklist = async () => {
  const today = TODAY();
  const snap  = await getDocs(
    query(collection(db, 'optouts'), where('status', '==', 'approved'))
  );
  const uids = snap.docs
    .map(d => d.data())
    .filter(r => r.startDate && isDateInOptOutRange(today, r.startDate, r.numDays))
    .map(r => r.uid);

  await setDoc(doc(db, 'blocklist', today), { uids, updatedAt: serverTimestamp() });
  return uids;
};

/* ── Meal Scans ─────────────────────────────────────────── */

/** Record that a student's QR was scanned for a meal */
export const recordScan = async (uid, mealKey, date, studentName, rollNumber) => {
  await setDoc(
    doc(db, 'scans', date, mealKey, uid),
    { uid, mealKey, date, studentName, rollNumber, scannedAt: serverTimestamp() },
    { merge: true }
  );
};

/** Live listener for scans of a specific meal on a given date */
export const listenMealScans = (date, mealKey, callback) =>
  onSnapshot(
    collection(db, 'scans', date, mealKey),
    snap => callback(snap.docs.map(d => ({ uid: d.id, ...d.data() })))
  );

/** Get UIDs of students opted out today (legacy wrapper — direct query use karta hai) */
export const getTodayOptOutUIDs = (dateISO = TODAY()) => getActiveOptOutUIDs(dateISO);

/* ── Opt-out violations (gate par denied entry ka audit) ── */

/** Log a denied entry attempt (opted-out student ne gate par try kiya) */
export const logDeniedScan = async (uid, mealKey, date, studentName = '', rollNumber = '') =>
  addDoc(collection(db, 'violations'), {
    uid, mealKey, date, studentName, rollNumber,
    attemptedAt: serverTimestamp(),
  });

/** Live listener for recent violation attempts (committee/Ledger) */
export const listenViolations = (callback, max = 50) => {
  const q = query(collection(db, 'violations'), orderBy('attemptedAt', 'desc'), limit(max));
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
};

/* ── Penalties ──────────────────────────────────────────── */

/**
 * Apply a penalty to a student:
 * - Deducts amount from wallet (min 0)
 * - Writes a record to /penalties collection
 */
export const applyPenalty = async (uid, { amount, reason, appliedBy }) => {
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) throw new Error('Student not found');
  const student = userSnap.data();
  const newBalance = Math.max(0, (student.walletBalance || 0) - amount);

  await Promise.all([
    // Deduct from wallet
    updateDoc(doc(db, 'users', uid), {
      walletBalance: newBalance,
      updatedAt: serverTimestamp(),
    }),
    // Write penalty record
    addDoc(collection(db, 'penalties'), {
      uid,
      studentName:  student.displayName || '',
      rollNumber:   student.rollNumber  || '',
      amount,
      reason,
      appliedBy,
      appliedAt:    serverTimestamp(),
      balanceBefore: student.walletBalance || 0,
      balanceAfter:  newBalance,
    }),
  ]);
  return newBalance;
};

/** Live listener for penalty records, ordered newest first */
export const listenPenalties = (callback) => {
  const q = query(
    collection(db, 'penalties'),
    orderBy('appliedAt', 'desc')
  );
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
};

/** Live listener for ONE student's penalties (student self-view, rules-safe) */
export const listenMyPenalties = (uid, callback) => {
  const q = query(collection(db, 'penalties'), where('uid', '==', uid));
  return onSnapshot(q, snap =>
    callback(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.appliedAt?.seconds ?? 0) - (a.appliedAt?.seconds ?? 0))
    )
  );
};

/** Mark a penalty as resolved (and refund the amount back to the student's wallet) */
export const resolvePenalty = async (penaltyId, uid, amount) => {
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) throw new Error('Student not found');
  const current = userSnap.data().walletBalance || 0;
  await Promise.all([
    updateDoc(doc(db, 'users', uid), {
      walletBalance: current + amount,
      updatedAt: serverTimestamp(),
    }),
    updateDoc(doc(db, 'penalties', penaltyId), {
      resolved: true,
      resolvedAt: serverTimestamp(),
    }),
  ]);
};

/** Permanently remove a penalty record (no refund) */
export const removePenalty = async (penaltyId) => {
  const { deleteDoc } = await import('firebase/firestore');
  await deleteDoc(doc(db, 'penalties', penaltyId));
};

/* ── Menu ───────────────────────────────────────────────── */

/** Live listener for today's menu */
export const listenTodayMenu = (callback) =>
  onSnapshot(doc(db, 'menu', TODAY()), snap =>
    snap.exists() && callback(snap.data())
  );

/** Save today's menu (committee) */
export const saveTodayMenu = (menuData) =>
  setDoc(doc(db, 'menu', TODAY()), { ...menuData, updatedAt: serverTimestamp() }, { merge: true });

/* ── Announcements ──────────────────────────────────────── */

/** Live listener for pinned + recent announcements */
export const listenAnnouncements = (callback) => {
  const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
};

/** Create announcement */
export const createAnnouncement = (data) =>
  addDoc(collection(db, 'announcements'), { ...data, createdAt: serverTimestamp() });

/** Delete announcement */
export const deleteAnnouncement = (id) =>
  deleteDoc(doc(db, 'announcements', id));

/* ── Feedback Chat ──────────────────────────────────────────────────── */

/** Live listener — last 60 messages, ordered ascending for chat display */
export const listenFeedback = (callback) => {
  const q = query(
    collection(db, 'feedback'),
    orderBy('sentAt', 'asc')
  );
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
};

/** Send a plain message */
export const sendFeedbackMessage = async (senderProfile, text, replyTo = null) => {
  return addDoc(collection(db, 'feedback'), {
    uid:         senderProfile.uid,
    displayName: senderProfile.displayName || 'User',
    rollNumber:  senderProfile.rollNumber  || '',
    role:        senderProfile.role        || 'student',
    type:        'message',
    text,
    replyTo,       // null | { id, text, displayName }
    reactions:   {},  // { emoji: [uid, uid, …] }
    sentAt:      serverTimestamp(),
  });
};

/** Create a poll (committee / auto) */
export const sendFeedbackPoll = async (senderProfile, question, options, meta = {}) => {
  return addDoc(collection(db, 'feedback'), {
    uid:          senderProfile.uid,
    displayName:  senderProfile.displayName || 'Mess Committee',
    rollNumber:   senderProfile.rollNumber  || '',
    role:         senderProfile.role        || 'committee',
    type:         'poll',
    text:         question,
    pollOptions:  options.map(label => ({ label, voters: [] })),
    reactions:    {},
    replyTo:      null,
    isAutomatic:  meta.isAutomatic  ?? false,
    pollMeal:     meta.pollMeal     ?? null,
    pollDate:     meta.pollDate     ?? TODAY(),
    sentAt:       serverTimestamp(),
  });
};

/** Toggle reaction emoji on a message */
export const toggleReaction = async (msgId, uid, emoji) => {
  const ref  = doc(db, 'feedback', msgId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const reactions = snap.data().reactions || {};
  const voters    = reactions[emoji] || [];
  const already   = voters.includes(uid);
  await updateDoc(ref, {
    [`reactions.${emoji}`]: already
      ? voters.filter(u => u !== uid)
      : [...voters, uid],
  });
};

/** Vote on a poll option (removes previous vote from same poll) */
export const voteOnPoll = async (msgId, uid, optionIndex) => {
  const ref  = doc(db, 'feedback', msgId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const opts = snap.data().pollOptions || [];
  // Remove uid from all options, then add to chosen one
  const updated = opts.map((o, i) => ({
    ...o,
    voters: i === optionIndex
      ? (o.voters.includes(uid) ? o.voters.filter(u => u !== uid) : [...o.voters, uid])
      : o.voters.filter(u => u !== uid),
  }));
  await updateDoc(ref, { pollOptions: updated });
};

/** Count messages sent by uid in the last hour (rate limiting) */
export const getMyMessageCountLastHour = async (uid) => {
  const oneHourAgo = new Date(Date.now() - 3_600_000);
  // Firestore Timestamp comparison — use simple query
  const snap = await getDocs(
    query(
      collection(db, 'feedback'),
      where('uid',  '==', uid),
      where('type', '==', 'message')
    )
  );
  return snap.docs.filter(d => {
    const ts = d.data().sentAt;
    if (!ts) return false;
    return ts.toDate() >= oneHourAgo;
  }).length;
};

/** Check if an auto-poll for a given meal+date has already been sent */
export const hasAutoPollForMeal = async (meal, date) => {
  const snap = await getDocs(
    query(
      collection(db, 'feedback'),
      where('isAutomatic', '==', true),
      where('pollMeal',    '==', meal),
      where('pollDate',    '==', date)
    )
  );
  return !snap.empty;
};

