// Stable per-install device identity. The server binds each student to one
// device id; a different id means "new device" and needs admin approval.
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { getItem, setItem } from './storage';
import { randomHex } from './token';

const KEY = 'pp.deviceId';
const randomId = () => randomHex(16);

let cached: { id: string; name: string } | null = null;

export async function getDevice(): Promise<{ id: string; name: string }> {
  if (cached) return cached;
  let id = await getItem(KEY);
  if (!id) {
    // Android ID is stable for the app signing key + device; iOS gets a keychain-persisted UUID.
    const androidId = Platform.OS === 'android' ? Application.getAndroidId?.() : null;
    id = androidId ? `android:${androidId}` : `${Platform.OS}:${randomId()}`;
    await setItem(KEY, id);
  }
  let name: string;
  if (Platform.OS === 'web') {
    const ua = globalThis.navigator?.userAgent || '';
    name = /Mobile/.test(ua) ? 'Web (mobile)' : 'Web browser';
  } else {
    name = `${Platform.OS === 'ios' ? 'iPhone' : 'Android'} · ${Application.applicationName ?? 'ProxyProof'}`;
  }
  cached = { id, name };
  return cached;
}
