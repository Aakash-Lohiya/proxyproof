// Client-side mirror of server/src/token.js so the organiser's phone can rotate
// tokens without a network round-trip every few seconds.
import { hmacSha256, utf8, toHex } from './crypto/sha256';

export function windowFor(ms: number, rotationMs: number) {
  return Math.floor(ms / rotationMs);
}

// NB: the server keys the HMAC with the hex secret *as a string* (node:crypto
// createHmac('sha256', secretHex)), so we must do the same, not decode it.
export function tokenFor(secretHex: string, shortId: string, window: number): string {
  return toHex(hmacSha256(utf8(secretHex), utf8(`${shortId}:${window}`))).slice(0, 8);
}

/** Cryptographically random hex (expo-crypto on device, WebCrypto on web). */
export function randomHex(bytes: number): string {
  let arr: Uint8Array;
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const buf = new Uint8Array(new ArrayBuffer(bytes));
    globalThis.crypto.getRandomValues(buf);
    arr = buf;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    arr = require('expo-crypto').getRandomBytes(bytes);
  }
  return toHex(arr);
}
export const newSecret = () => randomHex(32);
export const newShortId = () => randomHex(4);

/** Keeps a running estimate of (serverTime - localTime). */
export class ClockSync {
  offset = 0;
  update(serverTime: number, requestStartedAt: number, requestEndedAt = Date.now()) {
    const rtt = requestEndedAt - requestStartedAt;
    this.offset = serverTime + rtt / 2 - requestEndedAt;
  }
  now() {
    return Date.now() + this.offset;
  }
}
