// BLE abstraction. Native modules (react-native-ble-plx for scanning,
// react-native-ble-advertiser for broadcasting) only exist in a development
// build. In Expo Go or on the web we fall back to a simulated transport that
// talks to the server's dev-only beacon endpoint, so the whole flow can be
// demoed without hardware.
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { api } from '../api';
import { Beacon, SERVICE_UUID, COMPANY_ID, encodeManufacturerData, decodeManufacturerData, decodeLocalName, base64ToBytes, encodeLocalName } from './payload';

export type Sighting = Beacon & { rssi: number; at: number; simulated: boolean };
export type Transport = 'native' | 'simulated';

export const hasNativeScanner = Platform.OS !== 'web' && !!NativeModules.BlePlx;
export const hasNativeAdvertiser = Platform.OS !== 'web' && !!NativeModules.BLEAdvertiser;

export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const api31 = Number(Platform.Version) >= 31;
  const perms = api31
    ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
       PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]
    : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const result = await PermissionsAndroid.requestMultiple(perms.filter(Boolean) as any);
  return Object.values(result).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
}

// ---------------------------------------------------------------------------
// Advertiser (organiser side)
// ---------------------------------------------------------------------------
export interface Advertiser {
  transport: Transport;
  start(beacon: Beacon): Promise<void>;
  update(beacon: Beacon): Promise<void>;
  stop(): Promise<void>;
}

class NativeAdvertiser implements Advertiser {
  transport: Transport = 'native';
  private mod: any;
  private running = false;
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    this.mod = require('react-native-ble-advertiser');
    this.mod.setCompanyId(COMPANY_ID);
  }
  async start(b: Beacon) {
    await requestBlePermissions();
    await this.broadcast(b);
  }
  async update(b: Beacon) {
    if (this.running) await this.mod.stopBroadcast().catch(() => {});
    await this.broadcast(b);
  }
  private async broadcast(b: Beacon) {
    await this.mod.broadcast(SERVICE_UUID, encodeManufacturerData(b), {
      advertiseMode: 2 /* LOW_LATENCY */, txPowerLevel: 3 /* HIGH */, connectable: false, includeDeviceName: false,
    });
    this.running = true;
  }
  async stop() {
    if (!this.running) return;
    this.running = false;
    await this.mod.stopBroadcast().catch(() => {});
  }
}

class SimulatedAdvertiser implements Advertiser {
  transport: Transport = 'simulated';
  current: Beacon | null = null;
  async start(b: Beacon) { this.current = b; }
  async update(b: Beacon) { this.current = b; }
  async stop() { this.current = null; }
}

export function createAdvertiser(): Advertiser {
  return hasNativeAdvertiser ? new NativeAdvertiser() : new SimulatedAdvertiser();
}

// ---------------------------------------------------------------------------
// Scanner (student side)
// ---------------------------------------------------------------------------
export interface Scanner {
  transport: Transport;
  start(onSighting: (s: Sighting) => void, onError: (msg: string) => void): Promise<void>;
  stop(): Promise<void>;
}

class NativeScanner implements Scanner {
  transport: Transport = 'native';
  private manager: any;
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BleManager } = require('react-native-ble-plx');
    this.manager = new BleManager();
  }
  async start(onSighting: (s: Sighting) => void, onError: (msg: string) => void) {
    const ok = await requestBlePermissions();
    if (!ok) return onError('Bluetooth permission denied');
    const state = await this.manager.state();
    if (state !== 'PoweredOn') onError('Turn on Bluetooth to be detected');
    this.manager.startDeviceScan([SERVICE_UUID], { allowDuplicates: true }, (error: any, device: any) => {
      if (error) return onError(error.message || 'Scan error');
      if (!device) return;
      let beacon: Beacon | null = null;
      if (device.manufacturerData) beacon = decodeManufacturerData(base64ToBytes(device.manufacturerData));
      if (!beacon) beacon = decodeLocalName(device.localName || device.name);
      if (!beacon) return;
      onSighting({ ...beacon, rssi: device.rssi ?? -100, at: Date.now(), simulated: false });
    });
  }
  async stop() {
    this.manager.stopDeviceScan();
  }
}

/** No BLE hardware (Expo Go / web): picks up tokens that organisers publish for sessions started in demo mode. */
class SimulatedScanner implements Scanner {
  transport: Transport = 'simulated';
  private timer: ReturnType<typeof setInterval> | null = null;
  async start(onSighting: (s: Sighting) => void, onError: (msg: string) => void) {
    const tick = async () => {
      try {
        const beacons = await api.demoBeacons();
        for (const b of beacons) onSighting({ shortId: b.shortId, token: b.token, rssi: b.rssi, at: Date.now(), simulated: true });
      } catch (e: any) {
        onError(e?.message || 'Simulated scan failed');
      }
    };
    await tick();
    this.timer = setInterval(tick, 2500);
  }
  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export function createScanner(): Scanner {
  return hasNativeScanner ? new NativeScanner() : new SimulatedScanner();
}

export { encodeLocalName };
