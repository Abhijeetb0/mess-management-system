/**
 * seed.mjs — Firestore seed script
 * Populates your Firebase project with initial data for testing.
 *
 * HOW TO RUN:
 *   1. Install admin SDK:  npm install -D firebase-admin
 *   2. Download service account JSON from Firebase Console:
 *      Project Settings → Service accounts → Generate new private key
 *   3. Save it as:  serviceAccountKey.json  (in project root)
 *   4. Run:  node seed.mjs
 *
 * WARNING: This will OVERWRITE existing documents with the same IDs.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });

const auth = getAuth();
const db = getFirestore();

const TODAY = new Date().toISOString().split('T')[0];

/* ── Users to seed ──────────────────────────────────────── */
const USERS = [
  { email: '23cs001@gecmess.internal', password: 'mess@2026', displayName: 'Rahul Kumar', rollNumber: '23CS001', role: 'student', walletBalance: 1250 },
  { email: '23ec024@gecmess.internal', password: 'mess@2026', displayName: 'Anjali Mehta', rollNumber: '23EC024', role: 'student', walletBalance: 800 },
  { email: '22me012@gecmess.internal', password: 'mess@2026', displayName: 'Vikas Rao', rollNumber: '22ME012', role: 'student', walletBalance: 600 },
  { email: 'cmte001@gecmess.internal', password: 'mess@2026', displayName: 'Priya Singh', rollNumber: 'CMTE001', role: 'committee', walletBalance: 0 },
  { email: 'wrk001@gecmess.internal', password: 'mess@2026', displayName: 'Ramesh Yadav', rollNumber: 'WRK001', role: 'worker', walletBalance: 0 },
  { email: 'admin001@gecmess.internal', password: 'mess@2026', displayName: 'Dr. Ashok Sharma', rollNumber: 'ADMIN001', role: 'super_admin', walletBalance: 0 },
];

async function seedUsers() {
  console.log('Seeding users...');
  for (const u of USERS) {
    let fbUser;
    try {
      fbUser = await auth.getUserByEmail(u.email);
      console.log(`  ↻ Existing: ${u.email}`);
    } catch {
      fbUser = await auth.createUser({ email: u.email, password: u.password, displayName: u.displayName });
      console.log(`  + Created: ${u.email}`);
    }
    await db.collection('users').doc(fbUser.uid).set({
      displayName: u.displayName,
      rollNumber: u.rollNumber,
      role: u.role,
      walletBalance: u.walletBalance,
      isActive: true,
      createdAt: new Date(),
    }, { merge: true });
  }
}

async function seedDailyToken() {
  console.log('Seeding daily token...');
  await db.collection('system').doc('dailyToken').set({
    emoji: '🍛',
    animationType: 'wave',
    activeDate: TODAY,
    updatedAt: new Date(),
  });
}

async function seedMenu() {
  console.log('Seeding today\'s menu...');
  await db.collection('menu').doc(TODAY).set({
    breakfast: { items: ['Aloo Paratha', 'Curd', 'Pickle', 'Chai'], timing: '8:00 – 9:30 AM' },
    lunch: { items: ['Rajma Chawal', 'Roti (3)', 'Mixed Salad', 'Lassi'], timing: '1:00 – 2:30 PM' },
    dinner: { items: ['Paneer Butter Masala', 'Naan (2)', 'Dal Tadka', 'Gulab Jamun'], timing: '8:00 – 9:30 PM' },
    updatedAt: new Date(),
  });
}

async function seedAnnouncement() {
  console.log('Seeding announcement...');
  await db.collection('announcements').add({
    title: 'Welcome to MessApp!',
    body: 'GEC Sheikhpura Mess Management System is now live. Use your roll number to log in.',
    createdBy: 'system',
    createdAt: new Date(),
    pinned: true,
  });
}

async function seedBlocklist() {
  console.log('Seeding empty blocklist for today...');
  await db.collection('blocklist').doc(TODAY).set({ uids: [], updatedAt: new Date() });
}


async function main() {
  try {
    await seedUsers();
    await seedDailyToken();
    await seedMenu();
    await seedAnnouncement();
    await seedBlocklist();
    console.log('\n✅ Seed complete! Your Firebase project is ready.\n');
    console.log('Test accounts (all password: mess@2026):');
    USERS.forEach(u => console.log(`  [${u.role.padEnd(12)}] ${u.rollNumber.padEnd(10)} → ${u.email}`));
  } catch (err) {
    console.error('Seed failed:', err);
  }
  process.exit(0);
}

main();
