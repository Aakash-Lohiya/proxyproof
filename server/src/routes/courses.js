import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { HttpError, requireRole, publicUser } from '../auth.js';
import { uuid, now } from '../db.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
function joinCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export function courseRow(db, c) {
  const students = db.prepare('SELECT COUNT(*) AS n FROM enrollments WHERE course_id = ?').get(c.id).n;
  const sessions = db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE course_id = ?').get(c.id).n;
  const organiser = db.prepare('SELECT name FROM users WHERE id = ?').get(c.organiser_id);
  return {
    id: c.id, name: c.name, code: c.code, organiserId: c.organiser_id,
    organiserName: organiser?.name || null, createdAt: c.created_at,
    studentCount: students, sessionCount: sessions,
  };
}

export function courseRoutes(db, authenticate) {
  const r = Router();
  r.use(authenticate);

  r.get('/', (req, res) => {
    const rows = req.user.role === 'organiser'
      ? db.prepare('SELECT * FROM courses WHERE organiser_id = ? ORDER BY created_at DESC').all(req.user.id)
      : db.prepare(`SELECT c.* FROM courses c JOIN enrollments e ON e.course_id = c.id
                    WHERE e.user_id = ? ORDER BY e.joined_at DESC`).all(req.user.id);
    res.json({ courses: rows.map((c) => courseRow(db, c)) });
  });

  r.post('/', requireRole('organiser'), (req, res) => {
    const { name } = req.body || {};
    if (!name || !String(name).trim()) throw new HttpError(400, 'VALIDATION', 'name is required');
    let code = joinCode();
    while (db.prepare('SELECT 1 FROM courses WHERE code = ?').get(code)) code = joinCode();
    const c = { id: uuid(), name: String(name).trim(), code, organiser_id: req.user.id, created_at: now() };
    db.prepare('INSERT INTO courses (id,name,code,organiser_id,created_at) VALUES (@id,@name,@code,@organiser_id,@created_at)').run(c);
    res.status(201).json({ course: courseRow(db, c) });
  });

  r.post('/join', requireRole('student'), (req, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const c = db.prepare('SELECT * FROM courses WHERE code = ?').get(code);
    if (!c) throw new HttpError(404, 'COURSE_NOT_FOUND', 'No course with that join code');
    db.prepare('INSERT OR IGNORE INTO enrollments (course_id,user_id,joined_at) VALUES (?,?,?)').run(c.id, req.user.id, now());
    res.json({ course: courseRow(db, c) });
  });

  r.get('/:id', (req, res) => {
    const c = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
    if (!c) throw new HttpError(404, 'COURSE_NOT_FOUND');
    assertCourseAccess(db, req.user, c);
    const roster = db.prepare(`SELECT u.* FROM users u JOIN enrollments e ON e.user_id = u.id
                               WHERE e.course_id = ? ORDER BY u.name`).all(c.id);
    const sessions = db.prepare('SELECT * FROM sessions WHERE course_id = ? ORDER BY started_at DESC').all(c.id)
      .map((s) => sessionSummary(db, s));
    res.json({
      course: courseRow(db, c),
      roster: req.user.role === 'organiser' ? roster.map(publicUser) : undefined,
      sessions,
    });
  });

  r.post('/:id/enroll', requireRole('organiser'), (req, res) => {
    const c = db.prepare('SELECT * FROM courses WHERE id = ? AND organiser_id = ?').get(req.params.id, req.user.id);
    if (!c) throw new HttpError(404, 'COURSE_NOT_FOUND');
    const email = String(req.body?.email || '').toLowerCase().trim();
    const u = db.prepare(`SELECT * FROM users WHERE email = ? AND role = 'student'`).get(email);
    if (!u) throw new HttpError(404, 'STUDENT_NOT_FOUND', 'No student account with that email');
    db.prepare('INSERT OR IGNORE INTO enrollments (course_id,user_id,joined_at) VALUES (?,?,?)').run(c.id, u.id, now());
    res.json({ student: publicUser(u) });
  });

  r.delete('/:id/enroll/:userId', requireRole('organiser'), (req, res) => {
    const c = db.prepare('SELECT * FROM courses WHERE id = ? AND organiser_id = ?').get(req.params.id, req.user.id);
    if (!c) throw new HttpError(404, 'COURSE_NOT_FOUND');
    db.prepare('DELETE FROM enrollments WHERE course_id = ? AND user_id = ?').run(c.id, req.params.userId);
    res.json({ ok: true });
  });

  return r;
}

export function assertCourseAccess(db, user, course) {
  if (user.role === 'organiser') {
    if (course.organiser_id !== user.id) throw new HttpError(403, 'FORBIDDEN', 'Not your course');
    return;
  }
  const enrolled = db.prepare('SELECT 1 FROM enrollments WHERE course_id = ? AND user_id = ?').get(course.id, user.id);
  if (!enrolled) throw new HttpError(403, 'NOT_ENROLLED', 'You are not enrolled in this course');
}

export function sessionSummary(db, s) {
  const present = db.prepare('SELECT COUNT(*) AS n FROM attendance WHERE session_id = ?').get(s.id).n;
  const enrolled = db.prepare('SELECT COUNT(*) AS n FROM enrollments WHERE course_id = ?').get(s.course_id).n;
  const t = Date.now();
  return {
    id: s.id,
    shortId: s.short_id,
    courseId: s.course_id,
    title: s.title,
    startedAt: s.started_at,
    endsAt: s.ends_at,
    closedAt: s.closed_at,
    durationSec: s.duration_sec,
    rotationMs: s.rotation_ms,
    rssiThreshold: s.rssi_threshold,
    active: !s.closed_at && t < s.ends_at,
    presentCount: present,
    enrolledCount: enrolled,
  };
}
