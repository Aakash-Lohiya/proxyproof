// Rotating session tokens.
//
// token(window) = first 8 hex chars of HMAC-SHA256(secret, `${shortId}:${window}`)
// where window = floor(unixMillis / rotationMs).
//
// The organiser's phone computes the same value locally (it receives the secret
// when it starts the session) and puts it in the BLE advertisement. The server
// accepts the current window plus one window either side to absorb clock skew
// and scan latency, so a token lives for at most ~3 rotations (15 s by default)
// and a code that is shared over chat or replayed later is useless.
import { createHmac, randomBytes } from 'node:crypto';

export const DEFAULT_ROTATION_MS = 5000;
export const TOKEN_HEX_LEN = 8; // 32 bits -> fits in 4 bytes of advertisement payload

export function newSecret() {
  return randomBytes(32).toString('hex');
}

export function newShortId() {
  return randomBytes(4).toString('hex'); // 8 hex chars -> 4 bytes on air
}

export function windowFor(ms, rotationMs = DEFAULT_ROTATION_MS) {
  return Math.floor(ms / rotationMs);
}

export function tokenFor(secret, shortId, window) {
  return createHmac('sha256', secret)
    .update(`${shortId}:${window}`)
    .digest('hex')
    .slice(0, TOKEN_HEX_LEN);
}

export function currentToken(session, nowMs = Date.now()) {
  const window = windowFor(nowMs, session.rotation_ms);
  return {
    token: tokenFor(session.secret, session.short_id, window),
    window,
    rotatesAt: (window + 1) * session.rotation_ms,
  };
}

/** Returns true when `token` matches the current window or its neighbours. */
export function verifyToken(session, token, nowMs = Date.now(), skewWindows = 1) {
  if (typeof token !== 'string' || token.length !== TOKEN_HEX_LEN) return false;
  const w = windowFor(nowMs, session.rotation_ms);
  for (let d = -skewWindows; d <= skewWindows; d++) {
    if (tokenFor(session.secret, session.short_id, w + d) === token.toLowerCase()) return true;
  }
  return false;
}
