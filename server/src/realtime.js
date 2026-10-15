import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

/**
 * Socket.IO rooms keyed by session shortId. Organisers (and students, for
 * their own confirmation) join `session:<shortId>` and receive:
 *   attendance:marked   { attendance }
 *   attendance:removed  { userId }
 *   attempt:rejected    { reason, message, student, rssi, at }
 *   session:closed      { session }
 */
export function createRealtime(httpServer, db, jwtSecret) {
  const io = new Server(httpServer, { cors: { origin: true, credentials: true } });

  io.use((socket, next) => {
    try {
      const raw = socket.handshake.auth?.token || '';
      const payload = jwt.verify(raw, jwtSecret);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
      if (!user) return next(new Error('UNAUTHENTICATED'));
      socket.data.user = user;
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('session:join', (shortId, ack) => {
      const s = db.prepare('SELECT * FROM sessions WHERE short_id = ?').get(String(shortId || '').toLowerCase());
      if (!s) return ack?.({ ok: false, error: 'SESSION_NOT_FOUND' });
      const u = socket.data.user;
      const allowed = (u.role === 'organiser' && s.organiser_id === u.id)
        || db.prepare('SELECT 1 FROM enrollments WHERE course_id = ? AND user_id = ?').get(s.course_id, u.id);
      if (!allowed) return ack?.({ ok: false, error: 'FORBIDDEN' });
      socket.join(`session:${s.short_id}`);
      ack?.({ ok: true });
    });
    socket.on('session:leave', (shortId) => socket.leave(`session:${String(shortId || '').toLowerCase()}`));
  });

  return {
    io,
    emit(shortId, event, payload) {
      io.to(`session:${shortId}`).emit(event, payload);
    },
  };
}

/** No-op realtime for tests. */
export const nullRealtime = { emit() {}, io: null };
