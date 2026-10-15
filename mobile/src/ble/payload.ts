// On-air format. A fixed 128-bit service UUID identifies ProxyProof beacons;
// the manufacturer-data block carries:
//   byte 0      : version (0x01)
//   bytes 1..4  : session shortId (4 bytes, hex on the server)
//   bytes 5..8  : rotating token (4 bytes)
// 9 bytes total, well inside the 31-byte legacy advertising limit.
//
// iOS cannot put manufacturer data in a foreground advertisement, so as a
// fallback the same information is also encoded in the local name: "PP<shortId><token>".

export const SERVICE_UUID = '8f5e2a10-7d3c-4b6a-9e1f-0c2d4e6a8b1c';
export const COMPANY_ID = 0xffff; // reserved "test" company identifier
export const VERSION = 0x01;
export const NAME_PREFIX = 'PP';

export type Beacon = { shortId: string; token: string };

const hexToBytes = (h: string) => (h.match(/.{1,2}/g) || []).map((x) => parseInt(x, 16));
const bytesToHex = (b: ArrayLike<number>) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export function encodeManufacturerData(b: Beacon): number[] {
  return [VERSION, ...hexToBytes(b.shortId), ...hexToBytes(b.token)];
}

export function decodeManufacturerData(bytes: ArrayLike<number>): Beacon | null {
  // react-native-ble-plx hands back the full block including the 2-byte company id.
  let off = 0;
  if (bytes.length === 11) off = 2;
  else if (bytes.length !== 9) return null;
  if (bytes[off] !== VERSION) return null;
  return {
    shortId: bytesToHex(Array.prototype.slice.call(bytes, off + 1, off + 5)),
    token: bytesToHex(Array.prototype.slice.call(bytes, off + 5, off + 9)),
  };
}

export function encodeLocalName(b: Beacon) {
  return `${NAME_PREFIX}${b.shortId}${b.token}`;
}

export function decodeLocalName(name: string | null | undefined): Beacon | null {
  if (!name || !name.startsWith(NAME_PREFIX) || name.length !== NAME_PREFIX.length + 16) return null;
  const body = name.slice(NAME_PREFIX.length).toLowerCase();
  if (!/^[0-9a-f]{16}$/.test(body)) return null;
  return { shortId: body.slice(0, 8), token: body.slice(8) };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out: number[] = [];
  let buf = 0, bits = 0;
  for (const ch of clean) {
    buf = (buf << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xff); }
  }
  return Uint8Array.from(out);
}
