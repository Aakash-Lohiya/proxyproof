import express from 'express';
import cors from 'cors';
import { authenticate as makeAuth, HttpError } from './auth.js';
import { authRoutes } from './routes/auth.js';
import { courseRoutes } from './routes/courses.js';
import { sessionRoutes } from './routes/sessions.js';
import { attendanceRoutes } from './routes/attendance.js';
import { adminRoutes } from './routes/admin.js';
import { nullRealtime } from './realtime.js';

export function createApp({ db, jwtSecret, realtime = nullRealtime, simulateBeacon = false }) {
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '64kb' }));

  const authenticate = makeAuth(db, jwtSecret);

  app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'ProxyProof', serverTime: Date.now(), simulateBeacon }));
  app.get('/api/time', (_req, res) => res.json({ serverTime: Date.now() }));

  app.use('/api/auth', authRoutes(db, jwtSecret, authenticate));
  app.use('/api/courses', courseRoutes(db, authenticate));
  const sessions = sessionRoutes(db, authenticate, realtime, { simulateBeacon });
  app.use('/api/sessions', sessions);
  app.use('/api/attendance', attendanceRoutes(db, authenticate));
  app.use('/api/admin', adminRoutes(db, authenticate));

  app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Route not found')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.code, message: err.message, ...(err.extra || {}) });
    }
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'BAD_JSON', message: 'Malformed JSON body' });
    console.error(err);
    res.status(500).json({ error: 'INTERNAL', message: 'Something went wrong' });
  });

  app.closeSession = sessions.closeSession;
  return app;
}
