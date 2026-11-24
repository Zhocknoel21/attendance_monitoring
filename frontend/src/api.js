// Firebase backend. api(path, options) keeps the same calls the screens always used,
// but now runs against Firebase Auth + Firestore. Real permission checks are in firestore.rules.
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, getDocs, onSnapshot, setDoc, updateDoc, deleteDoc, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const app = initializeApp(cfg);
const auth = getAuth(app);
const db = getFirestore(app);

const AUTH = {
  'auth/invalid-credential': 'Wrong email or password.', 'auth/wrong-password': 'Wrong email or password.', 'auth/user-not-found': 'Wrong email or password.',
  'auth/invalid-email': 'Enter a valid email.', 'auth/email-already-in-use': 'That email is already registered.',
  'auth/weak-password': 'Password must be at least 8 characters.', 'auth/too-many-requests': 'Too many attempts. Try again later.',
  'auth/network-request-failed': 'No internet connection.',
};
const fail = (e) => { throw new Error(AUTH[e.code] || (e.code === 'permission-denied' ? 'You do not have permission to do that.' : e.message || 'Something went wrong.')); };

// ---------- small helpers ----------
const col = (n) => collection(db, n);
const ref = (n, id) => doc(db, n, id);
const rows = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
const getAll = async (n) => rows(await getDocs(col(n)));
const one = async (n, id) => { const s = await getDoc(ref(n, id)); return s.exists() ? { id: s.id, ...s.data() } : null; };
const where1 = async (n, ...w) => rows(await getDocs(query(col(n), ...w.map(([f, v]) => where(f, '==', v)))));
const uniq = (a) => [...new Set(a.filter(Boolean))];
const by = (k) => (a, b) => String(a[k] || '').localeCompare(String(b[k] || ''));
const str = (v) => String(v ?? '').trim();
async function batchDo(ops) {
  for (let i = 0; i < ops.length; i += 400) { const b = writeBatch(db); ops.slice(i, i + 400).forEach((f) => f(b)); await b.commit(); }
}
const wipe = async (n, ...w) => batchDo((await where1(n, ...w)).map((x) => (b) => b.delete(ref(n, x.id))));

// ---------- current user ----------
let me = null, meAt = 0;
async function loadMe(force) {
  const u = auth.currentUser;
  if (!u) { me = null; return null; }
  if (!force && me && me.id === u.uid && Date.now() - meAt < 15000) return me;
  me = await one('users', u.uid); meAt = Date.now(); return me;
}
const admin = () => me?.role === 'admin';
const must = () => { if (!admin()) throw new Error('Admins only.'); };

export const watchAuth = (cb) => onAuthStateChanged(auth, async (u) => {
  if (!u) { me = null; return cb(null); }
  try { const p = await loadMe(true); if (p && p.status === 'active') cb(p); else { if (p) await signOut(auth); cb(null); } } catch { cb(null); }
});

async function login(b) {
  // Firebase signs in with an email. A plain username like "admin" is mapped to admin@school.test.
  const id = str(b.email), email = id.includes('@') ? id : `${id.toLowerCase()}@school.test`;
  await signInWithEmailAndPassword(auth, email, b.password);
  const p = await loadMe(true);
  if (!p) { await signOut(auth); throw new Error('This account has no profile yet. Ask the admin.'); }
  if (p.status !== 'active') { await signOut(auth); me = null; throw new Error(p.status === 'pending' ? 'Your account is waiting for admin approval.' : 'Your account is deactivated. Contact the admin.'); }
  return { user: p };
}
async function register(b) {
  if (b.password !== b.password_confirmation) throw new Error('The password confirmation does not match.');
  if ((b.password || '').length < 8) throw new Error('Password must be at least 8 characters.');
  const email = str(b.email).toLowerCase();
  const c = await createUserWithEmailAndPassword(auth, email, b.password);
  await setDoc(ref('users', c.user.uid), { name: str(b.name), email, role: 'teacher', status: 'pending', created_at: serverTimestamp() });
  await signOut(auth); me = null;
  return { message: 'Account created. An admin must approve it before you can sign in.' };
}

// ---------- classes / sections / subjects ----------
async function ctx() {
  let classes, sections, subjects, users = [];
  if (admin()) [classes, sections, subjects, users] = await Promise.all([getAll('classes'), getAll('sections'), getAll('subjects'), getAll('users')]);
  else {
    classes = await where1('classes', ['teacher_id', me.id]);
    const f = (n, k) => Promise.all(uniq(classes.map((c) => c[k])).map((i) => one(n, i))).then((l) => l.filter(Boolean));
    [sections, subjects] = await Promise.all([f('sections', 'section_id'), f('subjects', 'subject_id')]); users = [me];
  }
  const sm = Object.fromEntries(sections.map((s) => [s.id, s])), jm = Object.fromEntries(subjects.map((s) => [s.id, s])), um = Object.fromEntries(users.map((u) => [u.id, u]));
  const fc = (c) => ({ ...c, subject: jm[c.subject_id] ? `${jm[c.subject_id].code} - ${jm[c.subject_id].name}` : '?', section: sm[c.section_id]?.name || '?', teacher: um[c.teacher_id]?.name || null });
  return { classes: classes.map(fc).sort(by('subject')), sections, subjects, users, sm, jm };
}
async function setupGet() {
  const c = await ctx();
  return { sections: c.sections.sort(by('name')), subjects: c.subjects.sort(by('code')), classes: c.classes,
    teachers: admin() ? c.users.filter((u) => u.role === 'teacher' && u.status === 'active').map((u) => ({ id: u.id, name: u.name })).sort(by('name')) : [] };
}
async function syncTeachers(ids) { // keeps users/{uid}.class_ids etc. in step, which the security rules use
  for (const uid of uniq(ids)) {
    const cs = await where1('classes', ['teacher_id', uid]);
    try { await updateDoc(ref('users', uid), { class_ids: cs.map((c) => c.id), section_ids: uniq(cs.map((c) => c.section_id)), subject_ids: uniq(cs.map((c) => c.subject_id)) }); }
    catch (e) { if (e.code !== 'not-found') throw e; }
  }
}
const KIND = { sections: ['name', 'course'], subjects: ['code', 'name'], classes: ['subject_id', 'section_id', 'teacher_id', 'days', 'start_time', 'end_time'] };
const unique = async (n, f, v, id, msg) => { if ((await where1(n, [f, v])).some((x) => x.id !== id)) throw new Error(msg); };
async function setupWrite(m, kind, id, b) {
  must();
  if (!KIND[kind]) throw new Error('Unknown item.');
  if (m === 'DELETE') {
    const cls = kind === 'classes' ? [await one('classes', id)].filter(Boolean) : await where1('classes', [kind === 'sections' ? 'section_id' : 'subject_id', id]);
    for (const c of cls) await wipe('attendance', ['class_id', c.id]);
    await batchDo(cls.map((c) => (bt) => bt.delete(ref('classes', c.id))));
    if (kind === 'sections') await batchDo((await where1('students', ['section_id', id])).map((s) => (bt) => bt.update(ref('students', s.id), { section_id: '' })));
    await deleteDoc(ref(kind, id));
    await syncTeachers(cls.map((c) => c.teacher_id));
    return { ok: true };
  }
  const d = Object.fromEntries(KIND[kind].map((k) => [k, str(b[k])]));
  if (kind === 'sections') { if (!d.name) throw new Error('The name field is required.'); await unique('sections', 'name', d.name, id, 'That section name already exists.'); }
  if (kind === 'subjects') { if (!d.code || !d.name) throw new Error('Code and subject name are required.'); await unique('subjects', 'code', d.code, id, 'That subject code already exists.'); }
  if (kind === 'classes') {
    if (!d.subject_id || !d.section_id) throw new Error('Choose a subject and a section.');
    for (const t of [d.start_time, d.end_time]) if (t && !/^\d{2}:\d{2}$/.test(t)) throw new Error('Use a valid time.');
  }
  const before = id ? await one(kind, id) : null, r = id ? ref(kind, id) : doc(col(kind));
  await setDoc(r, d);
  if (kind === 'classes') await syncTeachers([before?.teacher_id, d.teacher_id]);
  return { id: r.id, ...d };
}

// ---------- students (records only) ----------
async function sectionMap() {
  const l = admin() ? await getAll('sections') : (await Promise.all((me.section_ids || []).map((i) => one('sections', i)))).filter(Boolean);
  return Object.fromEntries(l.map((s) => [s.id, s]));
}
async function studentsGet() {
  const [st, sm] = await Promise.all([admin() ? getAll('students') : Promise.all((me.section_ids || []).map((s) => where1('students', ['section_id', s]))).then((x) => x.flat()), sectionMap()]);
  return st.sort(by('name')).map((s) => ({ id: s.id, name: s.name, lrn: s.lrn, section_id: s.section_id, section: sm[s.section_id]?.name || '-' }));
}
async function studentWrite(m, id, b) {
  if (m === 'DELETE') {
    const s = await one('students', id);
    if (!admin() && !(me.section_ids || []).includes(s?.section_id)) throw new Error('This student is not in your classes.');
    await deleteDoc(ref('students', id)); return { ok: true };
  }
  const d = { name: str(b.name), lrn: str(b.lrn), section_id: str(b.section_id) };
  if (!d.name) throw new Error('The name field is required.');
  if (!d.section_id) throw new Error('The section field is required.');
  const mine = me.section_ids || [];
  if (!admin() && !mine.includes(d.section_id)) throw new Error('That section is not assigned to you.');
  if (d.lrn) {
    const dup = admin() ? await where1('students', ['lrn', d.lrn]) : (await Promise.all(mine.map((s) => where1('students', ['section_id', s], ['lrn', d.lrn])))).flat();
    const x = dup.find((y) => y.id !== id); if (x) throw new Error('That ID already belongs to ' + x.name + '.');
  }
  const old = id ? await one('students', id) : null, r = id ? ref('students', id) : doc(col('students'));
  await setDoc(r, { ...d, created_at: old?.created_at ?? serverTimestamp() });
  return { id: r.id, ...d };
}

// ---------- attendance (per class) ----------
async function attGet(q) {
  const c = await one('classes', q.class_id);
  if (!c) throw new Error('This class is not available to you.');
  const [st, rec] = await Promise.all([where1('students', ['section_id', c.section_id]), where1('attendance', ['class_id', c.id], ['date', q.date])]);
  const m = Object.fromEntries(rec.map((r) => [r.student_id, r.status]));
  return st.sort(by('name')).map((s) => ({ id: s.id, name: s.name, lrn: s.lrn, status: m[s.id] || null }));
}
const attMark = async (b) => {
  await batchDo(b.marks.map((x) => {
    const r = ref('attendance', `${b.class_id}_${b.date}_${x.student_id}`);
    return x.status ? (bt) => bt.set(r, { class_id: b.class_id, student_id: x.student_id, date: b.date, month: b.date.slice(0, 7), status: x.status, marked_by: me.id, updated_at: serverTimestamp() }) : (bt) => bt.delete(r);
  }));
  return { ok: true };
};

// ---------- dashboard & reports ----------
const Z = () => ({ P: 0, L: 0, A: 0, E: 0 });
const todayStr = () => new Date().toLocaleDateString('en-CA');
const code = (c, cl) => `${c.jm[cl.subject_id]?.code || '?'} | ${cl.section}`;
// One day, per student: status of every student in the selected classes.
async function rep(date, classId, teacherId, c0) {
  const c = c0 || (await ctx());
  let cls = c.classes;
  if (classId) cls = cls.filter((x) => x.id === classId);
  if (teacherId && admin()) cls = cls.filter((x) => x.teacher_id === teacherId);
  const cache = {}, out = [];
  for (const cl of cls) {
    const [st, rec] = await Promise.all([(cache[cl.section_id] ??= where1('students', ['section_id', cl.section_id])), where1('attendance', ['class_id', cl.id], ['date', date])]);
    const m = Object.fromEntries(rec.map((r) => [r.student_id, r.status]));
    [...st].sort(by('name')).forEach((s) => out.push({ class_id: cl.id, class: code(c, cl), teacher: cl.teacher || 'Unassigned', id: s.id, name: s.name, lrn: s.lrn, status: m[s.id] || null }));
  }
  return out;
}
async function dash(q) {
  const date = q.date || todayStr(), c = await ctx(), cache = {}, absent = [];
  const classes = await Promise.all(c.classes.map(async (cl) => {
    const [st, rec] = await Promise.all([(cache[cl.section_id] ??= where1('students', ['section_id', cl.section_id])), where1('attendance', ['class_id', cl.id], ['date', date])]);
    const m = Object.fromEntries(rec.map((r) => [r.student_id, r.status])), x = { ...Z(), N: 0 };
    st.forEach((s) => { const k = m[s.id] || 'N'; x[k]++; if (k === 'A') absent.push({ id: s.id + cl.id, name: s.name, class: code(c, cl), teacher: cl.teacher || 'Unassigned' }); });
    return { ...cl, total: st.length, ...x };
  }));
  return { classes, absent: absent.sort(by('name')) };
}
async function teachersGet(q) { // admin: every teacher with their classes and that day's counts
  must();
  const [d, us] = await Promise.all([dash(q), getAll('users')]);
  return us.filter((u) => u.role === 'teacher').sort(by('name')).map((u) => ({ id: u.id, name: u.name, email: u.email, status: u.status, classes: d.classes.filter((c) => c.teacher_id === u.id) }));
}

// ---------- reports from teachers to the admin ----------
async function reportSend(b) {
  if (admin()) throw new Error('Only teachers send reports.');
  const n = (v) => Math.max(0, Math.floor(Number(v) || 0));
  await setDoc(ref('reports', `${b.class_id}_${b.date}`), { class_id: b.class_id, date: b.date, label: str(b.label).slice(0, 120), teacher_id: me.id, teacher_name: me.name,
    total: n(b.total), P: n(b.P), L: n(b.L), A: n(b.A), E: n(b.E), N: n(b.N), note: str(b.note).slice(0, 500), read: false, sent_at: serverTimestamp() });
  return { ok: true };
}
async function reportsGet() {
  const l = admin() ? await getAll('reports') : await where1('reports', ['teacher_id', me.id]);
  return l.sort((a, b) => (b.sent_at?.seconds || 0) - (a.sent_at?.seconds || 0)).slice(0, 100);
}
async function reportRead(id) { must(); await updateDoc(ref('reports', id), { read: true }); return { ok: true }; }

// Live notifications for the admin: new sign-ups and unread teacher reports.
export function watchInbox(cb) {
  let u = [], r = [];
  const push = () => cb({ pending: u, reports: r });
  const a = onSnapshot(query(col('users'), where('status', '==', 'pending')), (s) => { u = rows(s); push(); }, () => {});
  const b = onSnapshot(query(col('reports'), where('read', '==', false)), (s) => { r = rows(s).sort((x, y) => (y.sent_at?.seconds || 0) - (x.sent_at?.seconds || 0)); push(); }, () => {});
  return () => { a(); b(); };
}

// ---------- settings ----------
const DEF = { school_name: 'Class Attendance Monitor', school_year: '', low_rate: '85' };
const settingsGet = async () => { const { id, ...s } = (await one('settings', 'app')) || {}; return { ...DEF, ...s }; };
async function settingsSave(b) {
  must();
  if (!str(b.school_name)) throw new Error('The school name is required.');
  await setDoc(ref('settings', 'app'), { school_name: str(b.school_name), school_year: str(b.school_year) }, { merge: true });
  return settingsGet();
}

// ---------- accounts (admin only) ----------
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status });
async function usersRoute(m, id, b) {
  must();
  if (m === 'GET') return (await getAll('users')).map(pub).sort((a, b2) => (b2.status === 'pending') - (a.status === 'pending') || a.name.localeCompare(b2.name));
  if (m === 'POST') {
    const name = str(b.name), email = str(b.email).toLowerCase();
    if (!name || !email) throw new Error('Name and email are required.');
    if ((b.password || '').length < 8) throw new Error('Password must be at least 8 characters.');
    if (!['admin', 'teacher'].includes(b.role)) throw new Error('Choose a role.');
    // A second Firebase app creates the login so the admin stays signed in.
    const sec = getApps().find((a) => a.name === 'sec') || initializeApp(cfg, 'sec'), sa = getAuth(sec);
    const c = await createUserWithEmailAndPassword(sa, email, b.password); await signOut(sa);
    await setDoc(ref('users', c.user.uid), { name, email, role: b.role, status: 'active', created_at: serverTimestamp() });
    return { id: c.user.uid, name, email, role: b.role, status: 'active' };
  }
  if (id === me.id) throw new Error(m === 'PUT' ? 'You cannot change your own account here.' : 'You cannot delete your own account.');
  if (m === 'PUT') {
    const d = {};
    if (b.status) { if (!['active', 'pending', 'rejected'].includes(b.status)) throw new Error('Invalid status.'); d.status = b.status; }
    if (b.role) { if (!['admin', 'teacher'].includes(b.role)) throw new Error('Invalid role.'); d.role = b.role; }
    await updateDoc(ref('users', id), d); return { id, ...d };
  }
  const cls = await where1('classes', ['teacher_id', id]); // classes keep existing, just lose their teacher
  await batchDo(cls.map((c) => (bt) => bt.update(ref('classes', c.id), { teacher_id: '' })));
  await deleteDoc(ref('users', id)); return { ok: true };
}

async function loadSample() {
  must();
  if ((await getAll('sections')).length) throw new Error('Sample data can only be loaded into an empty system.');
  const mk = async (n, d) => { const r = doc(col(n)); await setDoc(r, d); return r.id; };
  const secs = [], subs = [];
  for (const n of ['Grade 10 - Rizal', 'Grade 10 - Bonifacio']) secs.push(await mk('sections', { name: n, course: 'Junior High' }));
  for (const [code, name] of [['MATH10', 'Mathematics 10'], ['SCI10', 'Science 10']]) subs.push(await mk('subjects', { code, name }));
  for (const s of secs) for (const j of subs) await mk('classes', { subject_id: j, section_id: s, teacher_id: '', days: 'Mon,Wed,Fri', start_time: '08:00', end_time: '09:00' });
  const names = ['Santos, Maria', 'Reyes, Jose', 'Cruz, Ana', 'Garcia, Luis', 'Lopez, Carla', 'Mendoza, Paolo'];
  for (let i = 0; i < names.length; i++) await mk('students', { name: names[i], lrn: `10${i + 1}0${i + 7}`, section_id: secs[i < 3 ? 0 : 1], created_at: serverTimestamp() });
  return { ok: true };
}

// ---------- router ----------
async function route(m, p, b, q) {
  const k = `${m} ${p[0]}`;
  if (k === 'POST login') return login(b);
  if (k === 'POST register') return register(b);
  if (k === 'POST logout') { await signOut(auth); me = null; return { ok: true }; }
  await loadMe();
  if (!me || me.status !== 'active') throw new Error('Please sign in again.');
  switch (p[0]) {
    case 'me': return me;
    case 'setup': return m === 'GET' ? setupGet() : setupWrite(m, p[1], p[2], b);
    case 'students': return m === 'GET' ? studentsGet() : studentWrite(m, p[1], b);
    case 'attendance': return m === 'GET' ? attGet(q) : attMark(b);
    case 'dashboard': return dash(q);
    case 'report': return rep(q.date || todayStr(), q.class_id, q.teacher_id);
    case 'teachers': return teachersGet(q);
    case 'reports': return m === 'GET' ? reportsGet() : m === 'POST' ? reportSend(b) : reportRead(p[1]);
    case 'settings': return m === 'GET' ? settingsGet() : settingsSave(b);
    case 'users': return usersRoute(m, p[1], b);
    case 'sample': return loadSample();
    default: throw new Error('Unknown request.');
  }
}
export async function api(path, { method = 'GET', body = {}, params = {} } = {}) {
  try { return await route(method, path.split('/').filter(Boolean), body, params); } catch (e) { return fail(e); }
}