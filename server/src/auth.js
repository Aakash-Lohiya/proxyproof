import jwt from 'jsonwebtoken';

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export function signToken(user, secret) {
  return jwt.sign(
    { sub: user.id, role: user.role, deviceId: user.device_id || null },
    secret,
    { expiresIn: '30d' },
  );
}

export function authenticate(db, secret) {
  return (req, _res, next) => {
    const header = req.headers.authorization || '';
    const raw = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!raw) return next(new HttpError(401, 'UNAUTHENTICATED', 'Missing bearer token'));
    let payload;
    try {
      payload = jwt.verify(raw, secret);
    } catch {
      return next(new HttpError(401, 'UNAUTHENTICATED', 'Invalid or expired token'));
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user) return next(new HttpError(401, 'UNAUTHENTICATED', 'User no longer exists'));
    // A student's JWT is bound to the device it was issued on. If the bound
    // device changed (approved switch), old tokens stop working.
    if (user.role === 'student' && (payload.deviceId || null) !== (user.device_id || null)) {
      return next(new HttpError(401, 'DEVICE_REBOUND', 'Device binding changed, sign in again'));
    }
    req.user = user;
    req.deviceId = req.headers['x-device-id'] ? String(req.headers['x-device-id']) : null;
    next();
  };
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, 'FORBIDDEN', `Requires role: ${roles.join(' or ')}`));
    }
    next();
  };
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    studentCode: u.student_code,
    deviceId: u.device_id,
    deviceName: u.device_name,
    createdAt: u.created_at,
  };
}
