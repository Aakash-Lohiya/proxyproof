import { Router } from 'express';
import { HttpError, requireRole, publicUser } from '../auth.js';
import { uuid, now } from '../db.js';
import { newSecret, newShortId, currentToken, verifyToken, DEFAULT_ROTATION_MS } from '../token.js';
import { sessionSummary } from './courses.js';

export const REJECT_REASONS = {
  SESSION_NOT_FOUND: 'No active session with that id',
  SESSION_ENDED: 'The session has ended',
  NOT_ENROLLED: 'You are not enrolled in this course',
  DEVICE_MISMATCH: 'Request did not come from your registered device',
  DEVICE_ALREADY_USED: 'This device already marked another student in this session',
  TOKEN_STALE: 'Token is stale or invalid (replayed or shared code)',
  TOO_FAR: 'Signal too weak: you do not appear to be in the room',
};

function attendanceRow(db, a) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(a.user_id);
  return {
    id: a.id, sessionId: a.session_id, userId: a.user_id, deviceId: a.device_id,
    markedAt: a.marked_at, method: a.method, rssi: a.rssi, student: publicUser(u),
  };
}

export function sessionRoutes(db, authenticate, realtime, opts = {}) {
  const r = Router();
  const timers = new Map();
  const simulateBeacon = !!opts.simulateBeacon;

  function closeSession(id, closedAt = now()) {
    const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
    if (!s || s.closed_at) return s;
    db.prepare('UPDATE sessions SET closed_at = ? WHERE id = ?').run(closedAt, id);
    clearTimeout(timers.get(id));
    timers.delete(id);
    const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
    realtime.emit(s.short_id, 'session:closed', { session: sessionSummary(db, updated) });
    return updated;
  }

  function scheduleClose(s) {
    const delay = Math.max(0, s.ends_at - now());
    const t = setTimeout(() => closeSession(s.id, s.ends_at), delay);
    if (typeof t.unref === 'function') t.unref();
    timers.set(s.id, t);
  }

  // Recover state after a restart: close expired sessions, re-arm timers for live ones.
  for (const s of db.prepare('SELECT * FROM sessions WHERE closed_at IS NULL').all()) {
    if (s.ends_at <= now()) closeSession(s.id, s.ends_at);
    else scheduleClose(s);
  }

  function liveSession(shortId) {
    const s = db.prepare('SELECT * FROM sessions WHERE short_id = ?').get(String(shortId || '').toLowerCase());
    if (!s) return { s: null, reason: 'SESSION_NOT_FOUND' };
    if (s.closed_at || now() >= s.ends_at) return { s, reason: 'SESSION_ENDED' };
    return { s, reason: null };
  }

  function recordAttempt(s, user, deviceId, reason, rssi) {
    db.prepare(`INSERT INTO mark_attempts (id,session_id,user_id,device_id,reason,rssi,at) VALUES (?,?,?,?,?,?,?)`)
      .run(uuid(), s.id, user?.id || null, deviceId || null, reason, rssi ?? null, now());
    realtime.emit(s.short_id, 'attempt:rejected', {
      reason, message: REJECT_REASONS[reason], rssi: rssi ?? null, at: now(),
      student: user ? { id: user.id, name: user.name, studentCode: user.student_code } : null,
    });
  }

  // ---- Student: automatic mark from a scanned advertisement -----------------
  r.post('/mark', authenticate, requireRole('student'), (req, res) => {
    const { shortId, token, rssi } = req.body || {};
    const rssiNum = Number.isFinite(Number(rssi)) ? Math.round(Number(rssi)) : null;
    const { s, reason } = liveSession(shortId);
    if (reason) {
      if (s) recordAttempt(s, req.user, req.deviceId, reason, rssiNum);
      throw new HttpError(reason === 'SESSION_NOT_FOUND' ? 404 : 410, reason, REJECT_REASONS[reason]);
    }

    const course = db.prepare('SELECT id, name, code FROM courses WHERE id = ?').get(s.course_id);
    const context = { course, session: sessionSummary(db, s) };
    const already = db.prepare('SELECT * FROM attendance WHERE session_id = ? AND user_id = ?').get(s.id, req.user.id);
    if (already) return res.json({ marked: true, alreadyMarked: true, attendance: attendanceRow(db, already), ...context });

    const fail = (code, status = 403) => {
      recordAttempt(s, req.user, req.deviceId, code, rssiNum);
      throw new HttpError(status, code, REJECT_REASONS[code]);
    };

    const enrolled = db.prepare('SELECT 1 FROM enrollments WHERE course_id = ? AND user_id = ?').get(s.course_id, req.user.id);
    if (!enrolled) fail('NOT_ENROLLED');
    if (!req.deviceId || req.deviceId !== req.user.device_id) fail('DEVICE_MISMATCH');
    if (!verifyToken(s, String(token || ''))) fail('TOKEN_STALE');
    if (rssiNum === null || rssiNum < s.rssi_threshold) fail('TOO_FAR');
    const deviceUsed = db.prepare('SELECT 1 FROM attendance WHERE session_id = ? AND device_id = ?').get(s.id, req.deviceId);
    if (deviceUsed) fail('DEVICE_ALREADY_USED', 409);

    const a = {
      id: uuid(), session_id: s.id, user_id: req.user.id, device_id: req.deviceId,
      marked_at: now(), method: 'auto', rssi: rssiNum,
    };
    db.prepare(`INSERT INTO attendance (id,session_id,user_id,device_id,marked_at,method,rssi)
                VALUES (@id,@session_id,@user_id,@device_id,@marked_at,@method,@rssi)`).run(a);
    const row = attendanceRow(db, a);
    realtime.emit(s.short_id, 'attendance:marked', { attendance: row });
    res.status(201).json({ marked: true, alreadyMarked: false, attendance: row, ...context, session: sessionSummary(db, s) });
  });

  // ---- Student: what the active beacon would say (DEV ONLY, for Expo Go / web demos) ----
  // Never enable in production: it lets a student get the token without BLE.
  r.get('/dev/beacon', authenticate, requireRole('student'), (req, res) => {
    if (!simulateBeacon) throw new HttpError(404, 'NOT_FOUND');
    const t = now();
    const rows = db.prepare(`SELECT s.* FROM sessions s JOIN enrollments e ON e.course_id = s.course_id
                             WHERE e.user_id = ? AND s.closed_at IS NULL AND s.ends_at > ?`).all(req.user.id, t);
    res.json({
      beacons: rows.map((s) => ({ shortId: s.short_id, ...currentToken(s, t), rssi: -55 - Math.floor(Math.random() * 10), simulated: true })),
      serverTime: t,
    });
  });

  // ---- Organiser --------------------------------------------------------------
  r.post('/', authenticate, requireRole('organiser'), (req, res) => {
    const { courseId, title, durationSec, rssiThreshold, rotationMs } = req.body || {};
    const c = db.prepare('SELECT * FROM courses WHERE id = ? AND organiser_id = ?').get(courseId, req.user.id);
    if (!c) throw new HttpError(404, 'COURSE_NOT_FOUND');
    const open = db.prepare('SELECT * FROM sessions WHERE course_id = ? AND closed_at IS NULL AND ends_at > ?').get(c.id, now());
    if (open) throw new HttpError(409, 'SESSION_ALREADY_ACTIVE', 'This course already has an active session');

    const dur = Math.min(Math.max(Number(durationSec) || 300, 30), 3 * 60 * 60);
    const rot = Math.min(Math.max(Number(rotationMs) || DEFAULT_ROTATION_MS, 2000), 30000);
    const rssi = Number.isFinite(Number(rssiThreshold)) ? Number(rssiThreshold) : -75;
    let shortId = newShortId();
    while (db.prepare('SELECT 1 FROM sessions WHERE short_id = ?').get(shortId)) shortId = newShortId();
    const t = now();
    const s = {
      id: uuid(), short_id: shortId, course_id: c.id, organiser_id: req.user.id, secret: newSecret(),
      title: title ? String(title).trim() : null, started_at: t, ends_at: t + dur * 1000, closed_at: null,
      duration_sec: dur, rotation_ms: rot, rssi_threshold: rssi,
    };
    db.prepare(`INSERT INTO sessions (id,short_id,course_id,organiser_id,secret,title,started_at,ends_at,closed_at,duration_sec,rotation_ms,rssi_threshold)
                VALUES (@id,@short_id,@course_id,@organiser_id,@secret,@title,@started_at,@ends_at,@closed_at,@duration_sec,@rotation_ms,@rssi_threshold)`).run(s);
    scheduleClose(s);
    res.status(201).json({ session: sessionSummary(db, s), secret: s.secret, serverTime: t, ...currentToken(s, t) });
  });

  r.get('/:id', authenticate, (req, res) => {
    const s = db.prepare('SELECT * FROM sessions WHERE id = ? OR short_id = ?').get(req.params.id, req.params.id);
    if (!s) throw new HttpError(404, 'SESSION_NOT_FOUND');
    const isOwner = req.user.role === 'organiser' && s.organiser_id === req.user.id;
    if (!isOwner) {
      const enrolled = db.prepare('SELECT 1 FROM enrollments WHERE course_id = ? AND user_id = ?').get(s.course_id, req.user.id);
      if (!enrolled) throw new HttpError(403, 'FORBIDDEN');
    }
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(s.course_id);
    const attendance = db.prepare('SELECT * FROM attendance WHERE session_id = ? ORDER BY marked_at').all(s.id).map((a) => attendanceRow(db, a));
    const payload = { session: sessionSummary(db, s), course: { id: course.id, name: course.name, code: course.code }, serverTime: now() };
    if (isOwner) {
      const present = new Set(attendance.map((a) => a.userId));
      const roster = db.prepare(`SELECT u.* FROM users u JOIN enrollments e ON e.user_id = u.id WHERE e.course_id = ? ORDER BY u.name`).all(s.course_id);
      payload.attendance = attendance;
      payload.absent = roster.filter((u) => !present.has(u.id)).map(publicUser);
      payload.attempts = db.prepare(`SELECT a.*, u.name AS user_name, u.student_code FROM mark_attempts a LEFT JOIN users u ON u.id = a.user_id
                                     WHERE a.session_id = ? ORDER BY a.at DESC LIMIT 50`).all(s.id)
        .map((a) => ({ id: a.id, reason: a.reason, message: REJECT_REASONS[a.reason], rssi: a.rssi, at: a.at,
          student: a.user_id ? { id: a.user_id, name: a.user_name, studentCode: a.student_code } : null }));
      if (!s.closed_at && now() < s.ends_at) {
        payload.secret = s.secret;
        Object.assign(payload, currentToken(s));
      }
    } else {
      const mine = attendance.find((a) => a.userId === req.user.id) || null;
      payload.myAttendance = mine;
    }
    res.json(payload);
  });

  r.post('/:id/close', authenticate, requireRole('organiser'), (req, res) => {
    const s = db.prepare('SELECT * FROM sessions WHERE id = ? AND organiser_id = ?').get(req.params.id, req.user.id);
    if (!s) throw new HttpError(404, 'SESSION_NOT_FOUND');
    const closed = closeSession(s.id);
    res.json({ session: sessionSummary(db, closed) });
  });

  r.post('/:id/attendance', authenticate, requireRole('organiser'), (req, res) => {
    const s = db.prepare('SELECT * FROM sessions WHERE id = ? AND organiser_id = ?').get(req.params.id, req.user.id);
    if (!s) throw new HttpError(404, 'SESSION_NOT_FOUND');
    const userId = req.body?.userId;
    const enrolled = db.prepare('SELECT 1 FROM enrollments WHERE course_id = ? AND user_id = ?').get(s.course_id, userId);
    if (!enrolled) throw new HttpError(400, 'NOT_ENROLLED', 'That student is not enrolled in this course');
    const existing = db.prepare('SELECT * FROM attendance WHERE session_id = ? AND user_id = ?').get(s.id, userId);
    if (existing) return res.json({ attendance: attendanceRow(db, existing), alreadyMarked: true });
    const a = { id: uuid(), session_id: s.id, user_id: userId, device_id: null, marked_at: now(), method: 'manual', rssi: null };
    db.prepare(`INSERT INTO attendance (id,session_id,user_id,device_id,marked_at,method,rssi)
                VALUES (@id,@session_id,@user_id,@device_id,@marked_at,@method,@rssi)`).run(a);
    const row = attendanceRow(db, a);
    realtime.emit(s.short_id, 'attendance:marked', { attendance: row });
    res.status(201).json({ attendance: row, alreadyMarked: false });
  });

  r.delete('/:id/attendance/:userId', authenticate, requireRole('organiser'), (req, res) => {
    const s = db.prepare('SELECT * FROM sessions WHERE id = ? AND organiser_id = ?').get(req.params.id, req.user.id);
    if (!s) throw new HttpError(404, 'SESSION_NOT_FOUND');
    const info = db.prepare('DELETE FROM attendance WHERE session_id = ? AND user_id = ?').run(s.id, req.params.userId);
    if (info.changes) realtime.emit(s.short_id, 'attendance:removed', { userId: req.params.userId });
    res.json({ removed: info.changes > 0 });
  });

  r.get('/:id/export.csv', authenticate, requireRole('organiser'), (req, res) => {
    const s = db.prepare('SELECT * FROM sessions WHERE id = ? AND organiser_id = ?').get(req.params.id, req.user.id);
    if (!s) throw new HttpError(404, 'SESSION_NOT_FOUND');
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(s.course_id);
    const roster = db.prepare(`SELECT u.* FROM users u JOIN enrollments e ON e.user_id = u.id WHERE e.course_id = ? ORDER BY u.name`).all(s.course_id);
    const marks = new Map(db.prepare('SELECT * FROM attendance WHERE session_id = ?').all(s.id).map((a) => [a.user_id, a]));
    const esc = (v) => (v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`);
    const lines = [['Student Code', 'Name', 'Email', 'Status', 'Marked At', 'Method', 'RSSI'].map(esc).join(',')];
    for (const u of roster) {
      const a = marks.get(u.id);
      lines.push([u.student_code, u.name, u.email, a ? 'Present' : 'Absent',
        a ? new Date(a.marked_at).toISOString() : '', a ? a.method : '', a ? a.rssi : ''].map(esc).join(','));
    }
    const fname = `${course.name}-${new Date(s.started_at).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`.replace(/[^\w.-]+/g, '_');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(lines.join('\r\n') + '\r\n');
  });

  r.closeSession = closeSession;
  return r;
}
