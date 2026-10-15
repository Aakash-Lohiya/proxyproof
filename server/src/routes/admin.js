import { Router } from 'express';
import { HttpError, requireRole, publicUser } from '../auth.js';
import { now } from '../db.js';

// Device-switch approvals. Organisers act as admins here.
export function adminRoutes(db, authenticate) {
  const r = Router();
  r.use(authenticate, requireRole('organiser'));

  r.get('/device-requests', (req, res) => {
    const status = req.query.status || 'pending';
    const rows = db.prepare(`SELECT d.*, u.name, u.email, u.student_code, u.device_name AS current_device_name
                             FROM device_requests d JOIN users u ON u.id = d.user_id
                             WHERE d.status = ? ORDER BY d.created_at DESC`).all(status);
    res.json({ requests: rows.map((d) => ({
      id: d.id, status: d.status, createdAt: d.created_at, resolvedAt: d.resolved_at,
      newDeviceName: d.new_device_name, currentDeviceName: d.current_device_name,
      student: { id: d.user_id, name: d.name, email: d.email, studentCode: d.student_code },
    })) });
  });

  r.post('/device-requests/:id/:action', (req, res) => {
    const { id, action } = req.params;
    if (!['approve', 'reject'].includes(action)) throw new HttpError(400, 'VALIDATION', 'action must be approve or reject');
    const d = db.prepare(`SELECT * FROM device_requests WHERE id = ? AND status = 'pending'`).get(id);
    if (!d) throw new HttpError(404, 'REQUEST_NOT_FOUND', 'No pending request with that id');
    const t = now();
    if (action === 'approve') {
      const clash = db.prepare('SELECT id FROM users WHERE device_id = ? AND id != ?').get(d.new_device_id, d.user_id);
      if (clash) throw new HttpError(409, 'DEVICE_TAKEN', 'That device is already bound to another student');
      db.prepare('UPDATE users SET device_id = ?, device_name = ? WHERE id = ?').run(d.new_device_id, d.new_device_name, d.user_id);
    }
    db.prepare(`UPDATE device_requests SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?`)
      .run(action === 'approve' ? 'approved' : 'rejected', t, req.user.id, id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(d.user_id);
    res.json({ ok: true, status: action === 'approve' ? 'approved' : 'rejected', student: publicUser(user) });
  });

  return r;
}
