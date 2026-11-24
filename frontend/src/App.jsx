import { useEffect, useState, useCallback } from 'react';
import { api, watchAuth, watchInbox } from './api';

const LBL = { P: 'Present', L: 'Late', A: 'Absent', E: 'Excused' };
const ON = { P: 'bg-emerald-600', L: 'bg-amber-600', A: 'bg-red-600', E: 'bg-violet-600' };
const today = () => new Date().toLocaleDateString('en-CA');
const inp = 'border border-stone-300 rounded-md px-3 py-1.5 bg-white w-full';
const btn = 'border border-stone-300 rounded-md px-3 py-1.5 bg-white font-semibold hover:bg-stone-50';
const pri = 'rounded-md px-3 py-1.5 bg-teal-800 text-white font-semibold hover:bg-teal-900';
const dng = ' !text-red-700 !border-red-700';
const th = 'py-2 px-2 text-sm text-stone-500 font-semibold';
const td = 'py-2 px-2 border-t border-stone-200';
const Card = ({ children }) => <div className="bg-white border border-stone-200 rounded-lg p-4 mb-4 overflow-x-auto">{children}</div>;
const Err = ({ m }) => (m ? <p className="text-red-700 my-2">{m}</p> : null);
const H = ({ children }) => <h2 className="font-serif text-2xl font-bold mb-4">{children}</h2>;
const Stat = ({ l, v, c = '' }) => (
  <div className={`bg-white border border-stone-200 border-l-4 ${c} rounded-lg p-3`}>
    <b className="block font-serif text-2xl">{v}</b><span className="text-sm text-stone-500">{l}</span>
  </div>
);
const sched = (c) => [c.days, c.start_time && c.end_time ? `${c.start_time}-${c.end_time}` : ''].filter(Boolean).join(' ') || 'No schedule';
const clabel = (c) => `${c.subject} | ${c.section}`;
const fmt = (d) => new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const shift = (d, n) => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); };
const Badge = ({ s }) => (s ? <span className={`${ON[s]} text-white rounded px-2 py-0.5 text-sm font-semibold`}>{LBL[s]}</span> : <span className="text-stone-400 text-sm">Not marked</span>);
function DayPicker({ date, setDate }) {
  return (
    <div className="flex flex-wrap gap-1">
      <button className={btn} onClick={() => setDate(shift(date, -1))} aria-label="Previous day">◀</button>
      <input type="date" className={inp + ' !w-auto'} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      <button className={btn} onClick={() => setDate(shift(date, 1))} aria-label="Next day">▶</button>
      <button className={btn} onClick={() => setDate(today())}>Today</button>
    </div>
  );
}

function useLoad(fn, deps) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let ok = true; setErr('');
    fn().then((x) => ok && setD(x)).catch((e) => ok && setErr(e.message));
    return () => { ok = false; };
  }, deps);
  return [d, setD, err];
}

function Login({ onDone }) {
  const [reg, setReg] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '', password_confirmation: '' });
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const go = async (e) => {
    e.preventDefault(); setErr(''); setOk('');
    try {
      if (reg) { const r = await api('/register', { method: 'POST', body: f }); setOk(r.message); setReg(false); setF({ ...f, password: '', password_confirmation: '' }); }
      else { const r = await api('/login', { method: 'POST', body: f }); onDone(r.user); }
    } catch (x) { setErr(x.message); }
  };
  return (
    <div className="min-h-screen grid place-items-center bg-stone-100 p-4">
      <form onSubmit={go} className="bg-white border border-stone-200 rounded-lg p-6 w-full max-w-sm space-y-3">
        <h1 className="font-serif text-2xl font-bold">Class Attendance Monitor</h1>
        <p className="text-stone-500">{reg ? 'Create a teacher account. An admin will approve it.' : 'Sign in with your account.'}</p>
        {reg && <input className={inp} placeholder="Full name" value={f.name} onChange={set('name')} required />}
        <input className={inp} type={reg ? 'email' : 'text'} placeholder={reg ? 'Email' : 'Username or email'} autoCapitalize="none" value={f.email} onChange={set('email')} required />
        <input className={inp} type="password" placeholder="Password (min. 8 characters)" value={f.password} onChange={set('password')} required />
        {reg && <input className={inp} type="password" placeholder="Confirm password" value={f.password_confirmation} onChange={set('password_confirmation')} required />}
        <Err m={err} />{ok && <p className="text-emerald-700">{ok}</p>}
        <button className={pri + ' w-full'}>{reg ? 'Create account' : 'Sign in'}</button>
        <button type="button" className="text-teal-800 underline w-full" onClick={() => { setReg(!reg); setErr(''); setOk(''); }}>{reg ? 'Back to sign in' : 'No account yet? Create one'}</button>
      </form>
    </div>
  );
}

function Dashboard({ admin }) {
  const [date, setDate] = useState(today());
  const [d, , err] = useLoad(() => api('/dashboard', { params: { date } }), [date]);
  const t = { P: 0, L: 0, A: 0, E: 0, N: 0 };
  (d?.classes || []).forEach((c) => Object.keys(t).forEach((k) => (t[k] += c[k])));
  return (
    <>
      <H>{admin ? 'System overview' : 'My classes'}</H>
      <div className="mb-3"><DayPicker date={date} setDate={setDate} /></div>
      <p className="text-stone-500 mb-3">{fmt(date)}</p>
      <Err m={err} />
      {d && <>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <Stat l="Classes" v={d.classes.length} /><Stat l="Present" v={t.P} c="border-l-emerald-600" /><Stat l="Late" v={t.L} c="border-l-amber-600" />
          <Stat l="Absent" v={t.A} c="border-l-red-600" /><Stat l="Excused" v={t.E} c="border-l-violet-600" /><Stat l="Not yet marked" v={t.N} />
        </div>
        <Card>
          <h3 className="font-serif font-bold mb-2">By class on this day</h3>
          {d.classes.length ? (
            <table className="w-full min-w-[640px] text-left">
              <thead><tr><th className={th}>Class</th>{admin && <th className={th}>Teacher</th>}<th className={th}>Schedule</th>{['Students', 'Present', 'Late', 'Absent', 'Excused', 'Unmarked'].map((h) => <th key={h} className={th + ' text-center'}>{h}</th>)}</tr></thead>
              <tbody>{d.classes.map((c) => (
                <tr key={c.id}><td className={td}>{clabel(c)}</td>{admin && <td className={td}>{c.teacher || 'Unassigned'}</td>}<td className={td}>{sched(c)}</td>
                  {[c.total, c.P, c.L, c.A, c.E, c.N].map((v, i) => <td key={i} className={td + ' text-center'}>{v}</td>)}</tr>
              ))}</tbody>
            </table>
          ) : <p className="text-stone-500">{admin ? 'No classes yet. Create sections, subjects and classes under Setup.' : 'No classes assigned to you yet. Ask the admin.'}</p>}
        </Card>
        <Card>
          <h3 className="font-serif font-bold mb-2">Absent on this day ({d.absent.length})</h3>
          {d.absent.length ? d.absent.map((r) => <p key={r.id} className="py-1">{r.name} <span className="text-stone-500">({r.class}{admin ? ' · ' + r.teacher : ''})</span></p>)
            : <p className="text-stone-500">No one is marked absent.</p>}
        </Card>
      </>}
    </>
  );
}

function Attendance({ classes, admin }) {
  const [date, setDate] = useState(today());
  const [cid, setCid] = useState(classes[0]?.id || '');
  const [rows, setRows, err] = useLoad(() => (cid ? api('/attendance', { params: { date, class_id: cid } }) : Promise.resolve([])), [date, cid]);
  const [e2, setE2] = useState('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState('');
  const [mine, setMine] = useLoad(() => (admin ? Promise.resolve([]) : api('/reports')), []);
  useEffect(() => { setSent(''); }, [cid, date]);
  if (!classes.length) return <><H>Take attendance</H><Card><p className="text-stone-500">No classes available yet.</p></Card></>;
  const mark = async (ids, status) => {
    try {
      await api('/attendance', { method: 'POST', body: { class_id: cid, date, marks: ids.map((id) => ({ student_id: id, status })) } });
      setRows((r) => r.map((x) => (ids.includes(x.id) ? { ...x, status } : x))); setE2(''); setSent('');
    } catch (e) { setE2(e.message); }
  };
  const c = { P: 0, L: 0, A: 0, E: 0, N: 0 };
  (rows || []).forEach((r) => c[r.status || 'N']++);
  const send = async () => {
    try {
      await api('/reports', { method: 'POST', body: { class_id: cid, date, label: clabel(classes.find((x) => x.id === cid) || {}), total: (rows || []).length, ...c, note } });
      setSent('Report sent to the admin.'); setNote(''); setE2(''); setMine(await api('/reports'));
    } catch (e) { setE2(e.message); }
  };
  return (
    <>
      <H>Take attendance</H>
      <div className="flex flex-wrap gap-2 mb-2">
        <select className={inp + ' !w-auto'} value={cid} onChange={(e) => setCid(e.target.value)}>{classes.map((x) => <option key={x.id} value={x.id}>{clabel(x)} ({sched(x)})</option>)}</select>
        <button className={pri} onClick={() => mark(rows.map((r) => r.id), 'P')} disabled={!rows || !rows.length}>Mark all present</button>
      </div>
      <div className="mb-3"><DayPicker date={date} setDate={setDate} /></div>
      <p className="text-stone-500 mb-2">{fmt(date)}: {c.P} present, {c.L} late, {c.A} absent, {c.E} excused, {c.N} unmarked. Changes save automatically.</p>
      <Err m={err || e2} />
      <Card>{rows && !rows.length && <p className="text-stone-500">No students in this section yet.</p>}{(rows || []).map((r) => (
        <div key={r.id} className="flex flex-wrap justify-between items-center gap-2 py-2 border-b border-stone-200 last:border-0">
          <span>{r.name}<small className="block text-stone-500">{r.lrn || 'No ID'}</small></span>
          <span className="flex gap-1">{Object.keys(LBL).map((v) => (
            <button key={v} onClick={() => mark([r.id], r.status === v ? null : v)}
              className={`rounded-md border px-2.5 py-1 text-sm font-semibold ${r.status === v ? ON[v] + ' text-white border-transparent' : 'border-stone-300 text-stone-500 bg-white'}`}>{LBL[v]}</button>
          ))}</span>
        </div>
      ))}</Card>
      {!admin && <Card>
        <h3 className="font-serif font-bold mb-2">Report to admin</h3>
        <p className="text-stone-500 mb-2">Sends this class's attendance for {fmt(date)} to the admin. Sending again updates the same report.</p>
        <textarea className={inp + ' mb-2'} rows="2" maxLength="500" placeholder="Optional note (for example, why students were absent)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className={pri} onClick={send} disabled={!rows || !rows.length}>Send report to admin</button> <span className="ml-2 text-emerald-700">{sent}</span>
        {mine && mine.length > 0 && <div className="mt-3">
          <h4 className="font-semibold mb-1">My recent reports</h4>
          {mine.slice(0, 8).map((r) => <p key={r.id} className="text-sm py-0.5">{r.date} · {r.label} · P {r.P} L {r.L} A {r.A} E {r.E} · <b className={r.read ? 'text-emerald-700' : 'text-amber-700'}>{r.read ? 'Reviewed' : 'Sent'}</b></p>)}
        </div>}
      </Card>}
    </>
  );
}

function Students({ sections, admin }) {
  const blank = { name: '', lrn: '', section_id: '' };
  const [rows, setRows, loadErr] = useLoad(() => api('/students'), []);
  const [f, setF] = useState(blank);
  const [id, setId] = useState(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [arm, setArm] = useState(null);
  const reload = () => api('/students').then(setRows);
  const submit = async (e) => {
    e.preventDefault();
    try { await api(id ? '/students/' + id : '/students', { method: id ? 'PUT' : 'POST', body: f }); setF(blank); setId(null); setErr(''); reload(); }
    catch (x) { setErr(x.message); }
  };
  const del = async (s) => {
    if (arm !== s.id) return setArm(s.id);
    try { await api('/students/' + s.id, { method: 'DELETE' }); setArm(null); reload(); } catch (x) { setErr(x.message); setArm(null); }
  };
  const list = (rows || []).filter((s) => (s.name + ' ' + (s.lrn || '')).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <H>Students</H>
      <p className="text-stone-500 mb-3">Students are records only. They have no login. {admin ? 'You can manage all students.' : 'You can add, edit and remove the students in your own classes.'}</p>
      {sections.length ? <Card>
        <form onSubmit={submit} className="grid gap-2 sm:grid-cols-4 items-end">
          <input className={inp} placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          <input className={inp} placeholder="LRN / Student ID" value={f.lrn || ''} onChange={(e) => setF({ ...f, lrn: e.target.value })} />
          <select className={inp} value={f.section_id} onChange={(e) => setF({ ...f, section_id: e.target.value })} required><option value="">Section</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <div className="flex gap-2"><button className={pri}>{id ? 'Save changes' : 'Add student'}</button>
            {id && <button type="button" className={btn} onClick={() => { setId(null); setF(blank); }}>Cancel</button>}</div>
        </form>
        <Err m={err || loadErr} />
      </Card> : <Card><p className="text-stone-500">{admin ? 'Create a section under Setup first.' : 'No sections assigned to you yet.'}</p></Card>}
      <input className={inp + ' mb-3'} placeholder="Search name or ID" value={q} onChange={(e) => setQ(e.target.value)} />
      <Card>{list.length ? list.map((s) => (
        <div key={s.id} className="flex flex-wrap justify-between items-center gap-2 py-2 border-b border-stone-200 last:border-0">
          <span>{s.name}<small className="block text-stone-500">{s.section} · {s.lrn || 'No ID'}</small></span>
          <span className="flex gap-1">
            <button className={btn} onClick={() => { setId(s.id); setF({ name: s.name, lrn: s.lrn || '', section_id: s.section_id || '' }); scrollTo(0, 0); }}>Edit</button>
            <button className={btn + dng} onClick={() => del(s)}>{arm === s.id ? 'Confirm delete' : 'Delete'}</button>
          </span>
        </div>
      )) : <p className="text-stone-500">{rows ? 'No students yet.' : 'Loading…'}</p>}</Card>
    </>
  );
}

function Mini({ title, kind, fields, rows, show, reload }) {
  const blank = Object.fromEntries(fields.map((x) => [x.k, '']));
  const [f, setF] = useState(blank);
  const [id, setId] = useState(null);
  const [err, setErr] = useState('');
  const [arm, setArm] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try { await api(`/setup/${kind}${id ? '/' + id : ''}`, { method: id ? 'PUT' : 'POST', body: f }); setF(blank); setId(null); setErr(''); reload(); }
    catch (x) { setErr(x.message); }
  };
  const del = async (r) => {
    if (arm !== r.id) return setArm(r.id);
    try { await api(`/setup/${kind}/${r.id}`, { method: 'DELETE' }); setArm(null); reload(); } catch (x) { setErr(x.message); setArm(null); }
  };
  return (
    <Card>
      <h3 className="font-serif font-bold mb-2">{title}</h3>
      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-3 mb-2">
        {fields.map((x) => x.o
          ? <select key={x.k} className={inp} value={f[x.k]} onChange={(e) => setF({ ...f, [x.k]: e.target.value })} required={!x.opt}><option value="">{x.l}{x.opt ? ' (optional)' : ''}</option>{x.o.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
          : <input key={x.k} className={inp} type={x.t || 'text'} title={x.l} placeholder={x.l} value={f[x.k]} onChange={(e) => setF({ ...f, [x.k]: e.target.value })} required={x.k === 'name' || x.k === 'code'} />)}
        <div className="flex gap-2"><button className={pri}>{id ? 'Save' : 'Add'}</button>{id && <button type="button" className={btn} onClick={() => { setId(null); setF(blank); }}>Cancel</button>}</div>
      </form>
      <Err m={err} />
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap justify-between items-center gap-2 py-2 border-t border-stone-200">
          <span>{show(r)}</span>
          <span className="flex gap-1">
            <button className={btn} onClick={() => { setId(r.id); setF(Object.fromEntries(fields.map((x) => [x.k, r[x.k] ?? '']))); }}>Edit</button>
            <button className={btn + dng} onClick={() => del(r)}>{arm === r.id ? 'Confirm delete' : 'Delete'}</button>
          </span>
        </div>
      ))}
    </Card>
  );
}

function Setup({ setup: S, reload }) {
  const opt = (a, f) => a.map((x) => [x.id, f(x)]);
  return (
    <>
      <H>Setup</H>
      <p className="text-stone-500 mb-3">A class is a subject taught to a section by a teacher at a schedule. Teachers only see the classes assigned to them. Deleting a section or subject also removes its classes and their attendance.</p>
      <Mini title="Sections" kind="sections" reload={reload} rows={S.sections} fields={[{ k: 'name', l: 'Section name' }, { k: 'course', l: 'Course / program' }]} show={(r) => r.name + (r.course ? ' · ' + r.course : '')} />
      <Mini title="Subjects" kind="subjects" reload={reload} rows={S.subjects} fields={[{ k: 'code', l: 'Code' }, { k: 'name', l: 'Subject name' }]} show={(r) => `${r.code} · ${r.name}`} />
      <Mini title="Classes and schedules" kind="classes" reload={reload} rows={S.classes}
        fields={[{ k: 'subject_id', l: 'Subject', o: opt(S.subjects, (x) => x.code) }, { k: 'section_id', l: 'Section', o: opt(S.sections, (x) => x.name) }, { k: 'teacher_id', l: 'Teacher', o: opt(S.teachers, (x) => x.name), opt: 1 },
          { k: 'days', l: 'Days (e.g. Mon,Wed)' }, { k: 'start_time', l: 'Start time', t: 'time' }, { k: 'end_time', l: 'End time', t: 'time' }]}
        show={(r) => `${r.subject} · ${r.section} · ${r.teacher || 'No teacher'} · ${sched(r)}`} />
    </>
  );
}

function Reports({ setup: S, admin, init }) {
  const [date, setDate] = useState(init?.date || today());
  const [cid, setCid] = useState(init?.class_id || '');
  const [tid, setTid] = useState('');
  const [rows, , err] = useLoad(() => api('/report', { params: { date, ...(cid && { class_id: cid }), ...(tid && { teacher_id: tid }) } }), [date, cid, tid]);
  const t = { P: 0, L: 0, A: 0, E: 0, N: 0 };
  (rows || []).forEach((r) => t[r.status || 'N']++);
  const csv = () => {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const body = rows.map((r) => [date, r.class, r.teacher, r.name, r.lrn || '', r.status ? LBL[r.status] : 'Not marked'].map(q).join(','));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([['Date,Class,Teacher,Student,ID,Status', ...body].join('\n')], { type: 'text/csv' }));
    a.download = `attendance-${date}.csv`; a.click();
  };
  return (
    <>
      <H>{admin ? 'Daily report (all classes)' : 'Daily class report'}</H>
      <div className="flex flex-wrap gap-2 mb-2">
        <select className={inp + ' !w-auto'} value={cid} onChange={(e) => setCid(e.target.value)}><option value="">All classes</option>{S.classes.map((c) => <option key={c.id} value={c.id}>{clabel(c)}</option>)}</select>
        {admin && <select className={inp + ' !w-auto'} value={tid} onChange={(e) => setTid(e.target.value)}><option value="">All teachers</option>{S.teachers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
        <button className={btn} onClick={csv} disabled={!rows}>Download CSV</button>
      </div>
      <div className="mb-3"><DayPicker date={date} setDate={setDate} /></div>
      <p className="text-stone-500 mb-3">{fmt(date)}</p>
      <Err m={err} />
      {rows && <>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <Stat l="Present" v={t.P} c="border-l-emerald-600" /><Stat l="Late" v={t.L} c="border-l-amber-600" /><Stat l="Absent" v={t.A} c="border-l-red-600" />
          <Stat l="Excused" v={t.E} c="border-l-violet-600" /><Stat l="Not yet marked" v={t.N} />
        </div>
        <Card>
          <table className="w-full min-w-[520px] text-left">
            <thead><tr><th className={th}>Student</th><th className={th}>Class</th>{admin && <th className={th}>Teacher</th>}<th className={th}>Status</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.class_id + '-' + r.id}><td className={td}>{r.name}<small className="block text-stone-500">{r.lrn || ''}</small></td><td className={td}>{r.class}</td>{admin && <td className={td}>{r.teacher}</td>}<td className={td}><Badge s={r.status} /></td></tr>
            ))}</tbody>
          </table>
          {!rows.length && <p className="text-stone-500 py-2">No students to show.</p>}
        </Card>
      </>}
    </>
  );
}

function Roster({ cid, date }) {
  const [rows, , err] = useLoad(() => api('/attendance', { params: { class_id: cid, date } }), [cid, date]);
  if (err) return <Err m={err} />;
  if (!rows) return <p className="text-stone-500">Loading…</p>;
  return rows.length ? (
    <div className="mt-2 border-t border-stone-200">{rows.map((r) => (
      <div key={r.id} className="flex justify-between items-center py-1.5 border-b border-stone-100 last:border-0"><span>{r.name}<small className="ml-2 text-stone-500">{r.lrn || ''}</small></span><Badge s={r.status} /></div>
    ))}</div>
  ) : <p className="text-stone-500">No students in this section.</p>;
}

function Teachers() {
  const [date, setDate] = useState(today());
  const [open, setOpen] = useState(null);
  const [rows, , err] = useLoad(() => api('/teachers', { params: { date } }), [date]);
  return (
    <>
      <H>Teachers</H>
      <div className="mb-2"><DayPicker date={date} setDate={setDate} /></div>
      <p className="text-stone-500 mb-3">{fmt(date)}. Each teacher's classes, students and attendance for this day. Manage the accounts under Accounts.</p>
      <Err m={err} />
      {rows && !rows.length && <Card><p className="text-stone-500">No teacher accounts yet. Approve sign-ups in Inbox or create one in Accounts.</p></Card>}
      {(rows || []).map((t) => {
        const sec = {}; t.classes.forEach((c) => (sec[c.section_id] = c.total));
        const n = Object.values(sec).reduce((a, b) => a + b, 0);
        return (
          <Card key={t.id}>
            <div className="flex flex-wrap justify-between gap-2 mb-1">
              <span className="font-semibold">{t.name}<small className="block font-normal text-stone-500">{t.email}</small></span>
              <span className="text-sm text-stone-500">{t.status === 'active' ? '' : t.status === 'pending' ? 'Pending approval · ' : 'Deactivated · '}{t.classes.length} class(es) · {n} student(s)</span>
            </div>
            {t.classes.length ? t.classes.map((c) => (
              <div key={c.id} className="py-2 border-t border-stone-200">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <span>{clabel(c)}<small className="block text-stone-500">{sched(c)}</small></span>
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <b className="text-emerald-700">Present {c.P}</b><b className="text-amber-700">Late {c.L}</b><b className="text-red-700">Absent {c.A}</b><b className="text-violet-700">Excused {c.E}</b><span className="text-stone-500">Unmarked {c.N}</span>
                    <button className={btn} onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? 'Hide students' : 'Show students'}</button>
                  </span>
                </div>
                {open === c.id && <Roster cid={c.id} date={date} />}
              </div>
            )) : <p className="text-stone-500">No classes assigned. Assign one under Setup.</p>}
          </Card>
        );
      })}
    </>
  );
}

function Inbox({ inbox, onOpen }) {
  const [all, setAll] = useState(false);
  const [tick, setTick] = useState(0);
  const [hist, , herr] = useLoad(() => (all ? api('/reports') : Promise.resolve(null)), [all, tick]);
  const [err, setErr] = useState('');
  const run = (p) => p.then(() => { setErr(''); setTick((x) => x + 1); }).catch((x) => setErr(x.message));
  const list = all && hist ? hist : inbox.reports;
  const when = (r) => (r.sent_at?.toDate ? r.sent_at.toDate().toLocaleString() : '');
  return (
    <>
      <H>Inbox</H>
      <Err m={err || herr} />
      <Card>
        <h3 className="font-serif font-bold mb-2">Teacher sign-ups waiting for approval ({inbox.pending.length})</h3>
        {inbox.pending.length ? inbox.pending.map((u) => (
          <div key={u.id} className="flex flex-wrap justify-between items-center gap-2 py-2 border-t border-stone-200">
            <span>{u.name}<small className="block text-stone-500">{u.email}</small></span>
            <span className="flex gap-1">
              <button className={pri} onClick={() => run(api('/users/' + u.id, { method: 'PUT', body: { status: 'active' } }))}>Approve</button>
              <button className={btn} onClick={() => run(api('/users/' + u.id, { method: 'PUT', body: { status: 'rejected' } }))}>Reject</button>
            </span>
          </div>
        )) : <p className="text-stone-500">No pending sign-ups.</p>}
      </Card>
      <Card>
        <div className="flex flex-wrap justify-between gap-2 mb-2">
          <h3 className="font-serif font-bold">Reports from teachers ({list.length})</h3>
          <label className="text-sm text-stone-600"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show reviewed too</label>
        </div>
        {list.length ? list.map((r) => (
          <div key={r.id} className="flex flex-wrap justify-between items-center gap-2 py-2 border-t border-stone-200">
            <span><b>{r.teacher_name}</b> · {r.label}
              <small className="block text-stone-500">{fmt(r.date)} · Present {r.P}, Late {r.L}, Absent {r.A}, Excused {r.E}, Unmarked {r.N} (of {r.total}) · sent {when(r)}</small>
              {r.note && <small className="block text-stone-700">Note: {r.note}</small>}</span>
            <span className="flex gap-1">
              <button className={btn} onClick={() => onOpen({ date: r.date, class_id: r.class_id })}>View students</button>
              {!r.read && <button className={pri} onClick={() => run(api('/reports/' + r.id, { method: 'PUT' }))}>Mark reviewed</button>}
            </span>
          </div>
        )) : <p className="text-stone-500">No new reports.</p>}
      </Card>
    </>
  );
}

function Accounts({ me }) {
  const blank = { name: '', email: '', password: '', role: 'teacher' };
  const [rows, setRows, err] = useLoad(() => api('/users'), []);
  const [f, setF] = useState(blank);
  const [e2, setE2] = useState('');
  const [arm, setArm] = useState(null);
  const create = async (e) => {
    e.preventDefault();
    try { const u = await api('/users', { method: 'POST', body: f }); setRows((r) => [...r, u]); setF(blank); setE2(''); } catch (x) { setE2(x.message); }
  };
  const patch = async (u, d) => {
    try { await api('/users/' + u.id, { method: 'PUT', body: d }); setRows((r) => r.map((x) => (x.id === u.id ? { ...x, ...d } : x))); setE2(''); } catch (x) { setE2(x.message); }
  };
  const del = async (u) => {
    if (arm !== u.id) return setArm(u.id);
    try { await api('/users/' + u.id, { method: 'DELETE' }); setRows((r) => r.filter((x) => x.id !== u.id)); setArm(null); setE2(''); } catch (x) { setE2(x.message); setArm(null); }
  };
  const tag = { active: 'text-emerald-700', pending: 'text-amber-700', rejected: 'text-red-700' };
  const nm = { active: 'Active', pending: 'Pending', rejected: 'Deactivated' };
  return (
    <>
      <H>Accounts</H>
      <Card>
        <h3 className="font-serif font-bold mb-2">Create account</h3>
        <form onSubmit={create} className="grid gap-2 sm:grid-cols-5 items-end">
          <input className={inp} placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          <input className={inp} type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
          <input className={inp} type="password" placeholder="Password (min. 8)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
          <select className={inp} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="teacher">Teacher</option><option value="admin">Administrator</option></select>
          <button className={pri}>Create</button>
        </form>
      </Card>
      <p className="text-stone-500 mb-3">Teachers who sign up themselves appear as pending until you approve them.</p>
      <Err m={err || e2} />
      <Card>{(rows || []).map((u) => (
        <div key={u.id} className="flex flex-wrap justify-between items-center gap-2 py-2 border-b border-stone-200 last:border-0">
          <span>{u.name}{u.id === me.id && ' (you)'}<small className="block text-stone-500">{u.email}</small></span>
          <span className="flex flex-wrap items-center gap-1">
            <b className={'text-sm mr-1 ' + tag[u.status]}>{nm[u.status]}</b>
            <select className="border border-stone-300 rounded-md px-2 py-1 bg-white" value={u.role} disabled={u.id === me.id} onChange={(e) => patch(u, { role: e.target.value })}>
              <option value="teacher">Teacher</option><option value="admin">Administrator</option>
            </select>
            {u.id !== me.id && <>
              {u.status !== 'active' && <button className={pri} onClick={() => patch(u, { status: 'active' })}>{u.status === 'pending' ? 'Approve' : 'Reactivate'}</button>}
              {u.status === 'pending' && <button className={btn} onClick={() => patch(u, { status: 'rejected' })}>Reject</button>}
              {u.status === 'active' && <button className={btn} onClick={() => patch(u, { status: 'rejected' })}>Deactivate</button>}
              <button className={btn + dng} onClick={() => del(u)}>{arm === u.id ? 'Confirm delete' : 'Delete'}</button>
            </>}
          </span>
        </div>
      ))}</Card>
    </>
  );
}

function Settings({ cfg, reload }) {
  const [f, setF] = useState({ school_name: cfg.school_name || '', school_year: cfg.school_year || '', low_rate: cfg.low_rate || 85 });
  const [msg, setMsg] = useState('');
  const sample = async () => {
    try { await api('/sample', { method: 'POST' }); await reload(); setMsg('Sample data loaded. Assign teachers to the classes under Setup.'); } catch (x) { setMsg(x.message); }
  };
  const save = async (e) => {
    e.preventDefault();
    try { await api('/settings', { method: 'PUT', body: f }); await reload(); setMsg('Saved.'); } catch (x) { setMsg(x.message); }
  };
  return (
    <>
      <H>Settings</H>
      <Card>
        <form onSubmit={save} className="grid gap-3 max-w-md">
          <label>School name<input className={inp} value={f.school_name} onChange={(e) => setF({ ...f, school_name: e.target.value })} required /></label>
          <label>School year<input className={inp} placeholder="2026-2027" value={f.school_year} onChange={(e) => setF({ ...f, school_year: e.target.value })} /></label>
          <div><button className={pri}>Save settings</button> <button type="button" className={btn + ' ml-2'} onClick={sample}>Load sample data</button> <span className="ml-2 text-stone-500">{msg}</span></div>
        </form>
      </Card>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('Dashboard');
  const [setup, setSetup] = useState(null);
  const [cfg, setCfg] = useState({});
  const [inbox, setInbox] = useState({ pending: [], reports: [] });
  const [jump, setJump] = useState(null);
  const n = inbox.pending.length + inbox.reports.length;
  const reload = useCallback(() => Promise.all([api('/setup'), api('/settings')]).then(([a, b]) => { setSetup(a); setCfg(b); }).catch(() => {}), []);
  useEffect(() => watchAuth((u) => { setUser(u); setReady(true); }), []);
  useEffect(() => { if (user) reload(); }, [user]);
  useEffect(() => (user?.role === 'admin' ? watchInbox(setInbox) : undefined), [user]);
  useEffect(() => { document.title = (n ? `(${n}) ` : '') + 'Class Attendance Monitor'; }, [n]);
  if (!ready) return null;
  if (!user) return <Login onDone={(u) => { setTab('Dashboard'); setUser(u); }} />;
  const admin = user.role === 'admin';
  const tabs = admin ? ['Dashboard', 'Attendance', 'Students', 'Teachers', 'Inbox', 'Setup', 'Accounts', 'Reports', 'Settings'] : ['Dashboard', 'Attendance', 'Students', 'Reports'];
  const logout = async () => { try { await api('/logout', { method: 'POST' }); } catch {} setSetup(null); setUser(null); };
  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <header className="sticky top-0 z-10 bg-white border-b border-stone-200 flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2">
        <h1 className="font-serif font-bold text-lg">{cfg.school_name || 'Class Attendance Monitor'}</h1>
        <nav className="flex gap-1 flex-wrap">{tabs.map((t) => (
          <button key={t} onClick={() => { setTab(t); setJump(null); }} className={`px-3 py-1.5 rounded-md font-semibold ${tab === t ? 'bg-teal-50 text-teal-800' : 'text-stone-500'}`}>{t}{t === 'Inbox' && n > 0 && <span className="ml-1 rounded-full bg-red-600 text-white text-xs px-1.5 py-0.5">{n}</span>}</button>
        ))}</nav>
        <span className="ml-auto text-sm text-stone-500">{user.name} ({admin ? 'Administrator' : 'Teacher'}) <button className="underline ml-2" onClick={logout}>Sign out</button></span>
      </header>
      {admin && n > 0 && tab !== 'Inbox' && (
        <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 text-amber-900 flex flex-wrap items-center gap-x-3">
          <span>🔔 {inbox.pending.length > 0 && `${inbox.pending.length} teacher sign-up(s) waiting for approval. `}{inbox.reports.length > 0 && `${inbox.reports.length} new report(s) from teachers.`}</span>
          <button className="underline font-semibold" onClick={() => setTab('Inbox')}>Open Inbox</button>
        </div>
      )}
      <main className="max-w-5xl mx-auto p-4 pb-16">
        {!setup ? <p>Loading…</p> : <>
          {tab === 'Dashboard' && <Dashboard admin={admin} />}
          {tab === 'Attendance' && <Attendance key={setup.classes.length} classes={setup.classes} admin={admin} />}
          {tab === 'Students' && <Students sections={setup.sections} admin={admin} />}
          {tab === 'Reports' && <Reports key={JSON.stringify(jump)} setup={setup} admin={admin} init={jump} />}
          {admin && tab === 'Teachers' && <Teachers />}
          {admin && tab === 'Inbox' && <Inbox inbox={inbox} onOpen={(j) => { setJump(j); setTab('Reports'); }} />}
          {admin && tab === 'Setup' && <Setup setup={setup} reload={reload} />}
          {admin && tab === 'Accounts' && <Accounts me={user} />}
          {admin && tab === 'Settings' && <Settings cfg={cfg} reload={reload} />}
        </>}
      </main>
    </div>
  );
}