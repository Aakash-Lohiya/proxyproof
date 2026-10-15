import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { HttpError, signToken, publicUser } from '../auth.js';
import { uuid, now } from '../db.js';
import { roleForEmail, domainHelp, STUDENT_DOMAIN, ORGANISER_DOMAIN } from '../roles.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function authRoutes(db, jwtSecret, authenticate) {
  const r = Router();

  r.post('/register', (req, res) => {
    const { name, email, password, studentCode, deviceId, deviceName } = req.body || {};
    if (!name || !email || !password) throw new HttpError(400, 'VALIDATION', 'name, email and password are required');
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'VALIDATION', 'Invalid email');
    if (String(password).length < 6) throw new HttpError(400, 'VALIDATION', 'Password must be at least 6 characters');
    const role = roleForEmail(email);
    if (!role) throw new HttpError(400, 'EMAIL_DOMAIN', domainHelp());
    if (role === 'student' && !deviceId) throw new HttpError(400, 'DEVICE_REQUIRED', 'Students must register from the device they will use');

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists');

    if (role === 'student') {
      const taken = db.prepare('SELECT id FROM users WHERE device_id = ?').get(deviceId);
      if (taken) throw new HttpError(409, 'DEVICE_TAKEN', 'This device is already bound to another student');
    }

    const user = {
      id: uuid(),
      name: String(name).trim(),
      email: email.toLowerCase(),
      password_hash: bcrypt.hashSync(String(password), 10),
      role,
      student_code: role === 'student' ? (studentCode ? String(studentCode).trim() : null) : null,
      device_id: role === 'student' ? deviceId : null,
      device_name: role === 'student' ? (deviceName || null) : null,
      created_at: now(),
    };
    db.prepare(`INSERT INTO users (id,name,email,password_hash,role,student_code,device_id,device_name,created_at)
                VALUES (@id,@name,@email,@password_hash,@role,@student_code,@device_id,@device_name,@created_at)`).run(user);
    res.status(201).json({ token: signToken(user, jwtSecret), user: publicUser(user) });
  });

  // Lets the app show which kind of account an email will get before submitting.
  r.get('/domains', (_req, res) => res.json({ student: STUDENT_DOMAIN, organiser: ORGANISER_DOMAIN }));

  r.post('/login', (req, res) => {
    const { email, password, deviceId, deviceName } = req.body || {};
    if (!email || !password) throw new HttpError(400, 'VALIDATION', 'email and password are required');
    if (!roleForEmail(email)) throw new HttpError(400, 'EMAIL_DOMAIN', domainHelp());
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
    if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
      throw new HttpError(401, 'BAD_CREDENTIALS', 'Email or password is incorrect');
    }

    if (user.role === 'student') {
      if (!deviceId) throw new HttpError(400, 'DEVICE_REQUIRED', 'deviceId is required for students');
      if (!user.device_id) {
        // First sign-in on a student account that has no bound device yet.
        const taken = db.prepare('SELECT id FROM users WHERE device_id = ? AND id != ?').get(deviceId, user.id);
        if (taken) throw new HttpError(409, 'DEVICE_TAKEN', 'This device is already bound to another student');
        db.prepare('UPDATE users SET device_id = ?, device_name = ? WHERE id = ?').run(deviceId, deviceName || null, user.id);
        user.device_id = deviceId;
        user.device_name = deviceName || null;
      } else if (user.device_id !== deviceId) {
        const pending = db.prepare(`SELECT id, created_at FROM device_requests WHERE user_id = ? AND status = 'pending'`).get(user.id);
        const err = new HttpError(403, 'DEVICE_MISMATCH', 'This account is bound to a different device. Request a device switch.');
        err.extra = { boundDeviceName: user.device_name, pendingRequest: pending || null };
        throw err;
      }
    }
    res.json({ token: signToken(user, jwtSecret), user: publicUser(user) });
  });

  // A student who is locked out on a new phone asks for the binding to be moved.
  r.post('/device-change', (req, res) => {
    const { email, password, newDeviceId, newDeviceName } = req.body || {};
    if (!email || !password || !newDeviceId) throw new HttpError(400, 'VALIDATION', 'email, password and newDeviceId are required');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
    if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
      throw new HttpError(401, 'BAD_CREDENTIALS', 'Email or password is incorrect');
    }
    if (user.role !== 'student') throw new HttpError(400, 'NOT_STUDENT', 'Only student accounts are device bound');
    if (user.device_id === newDeviceId) throw new HttpError(400, 'SAME_DEVICE', 'This device is already your bound device');
    const pending = db.prepare(`SELECT * FROM device_requests WHERE user_id = ? AND status = 'pending'`).get(user.id);
    if (pending) return res.json({ request: pending, alreadyPending: true });
    const request = {
      id: uuid(), user_id: user.id, new_device_id: newDeviceId, new_device_name: newDeviceName || null,
      status: 'pending', created_at: now(),
    };
    db.prepare(`INSERT INTO device_requests (id,user_id,new_device_id,new_device_name,status,created_at)
                VALUES (@id,@user_id,@new_device_id,@new_device_name,@status,@created_at)`).run(request);
    res.status(201).json({ request, alreadyPending: false });
  });

  r.get('/me', authenticate, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  return r;
}
