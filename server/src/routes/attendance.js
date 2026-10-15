import { Router } from 'express';
import { requireRole, publicUser, HttpError } from '../auth.js';
import { sessionSummary } from './courses.js';

export function attendanceRoutes(db, authenticate) {
  const r = Router();
  r.use(authenticate);

  // Student: per-course history and percentage.
  r.get('/me', requireRole('student'), (req, res) => {
    const courses = db.prepare(`SELECT c.* FROM courses c JOIN enrollments e ON e.course_id = c.id WHERE e.user_id = ? ORDER BY c.name`).all(req.user.id);
    const out = courses.map((c) => {
      const sessions = db.prepare('SELECT * FROM sessions WHERE course_id = ? ORDER BY started_at DESC').all(c.id);
      const rows = sessions.map((s) => {
        const a = db.prepare('SELECT * FROM attendance WHERE session_id = ? AND user_id = ?').get(s.id, req.user.id);
        return { ...sessionSummary(db, s), present: !!a, markedAt: a?.marked_at || null, method: a?.method || null };
      });
      const total = rows.length;
      const present = rows.filter((x) => x.present).length;
      return {
        course: { id: c.id, name: c.name, code: c.code },
        total, present,
        percentage: total ? Math.round((present / total) * 1000) / 10 : null,
        sessions: rows,
      };
    });
    const allTotal = out.reduce((n, c) => n + c.total, 0);
    const allPresent = out.reduce((n, c) => n + c.present, 0);
    res.json({ courses: out, overall: { total: allTotal, present: allPresent, percentage: allTotal ? Math.round((allPresent / allTotal) * 1000) / 10 : null } });
  });

  // Organiser: per-course roster with percentages.
  r.get('/course/:courseId', requireRole('organiser'), (req, res) => {
    const c = db.prepare('SELECT * FROM courses WHERE id = ? AND organiser_id = ?').get(req.params.courseId, req.user.id);
    if (!c) throw new HttpError(404, 'COURSE_NOT_FOUND');
    const sessions = db.prepare('SELECT * FROM sessions WHERE course_id = ? ORDER BY started_at DESC').all(c.id);
    const roster = db.prepare(`SELECT u.* FROM users u JOIN enrollments e ON e.user_id = u.id WHERE e.course_id = ? ORDER BY u.name`).all(c.id);
    const students = roster.map((u) => {
      const present = db.prepare(`SELECT COUNT(*) AS n FROM attendance a JOIN sessions s ON s.id = a.session_id WHERE s.course_id = ? AND a.user_id = ?`).get(c.id, u.id).n;
      return { student: publicUser(u), present, total: sessions.length, percentage: sessions.length ? Math.round((present / sessions.length) * 1000) / 10 : null };
    });
    res.json({ course: { id: c.id, name: c.name, code: c.code }, sessions: sessions.map((s) => sessionSummary(db, s)), students });
  });

  return r;
}
