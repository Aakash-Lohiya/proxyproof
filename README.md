# ProxyProof — Bluetooth attendance that proxies can't beat

ProxyProof marks students present automatically when their phone hears the organiser's
Bluetooth Low Energy beacon in the room. No codes to type, no photos, and nothing a friend
can do from home. The backend is **Firebase** (Auth + Firestore + security rules) on the free
Spark plan; no server of your own to run.

```
proxyproof/
├── mobile/     Expo SDK 57 · React Native · expo-router · Reanimated · Firebase JS SDK · BLE libs
├── firebase/   Firestore security rules, indexes, emulator config, rule tests
└── server/     (legacy) the original self-hosted Node server, kept for reference only
```

## How it works

1. **Organiser starts a session** (5 min by default). The phone generates a 32-byte secret and a
   4-byte `shortId`, writes the session to Firestore (secret in a private subdocument only the
   organiser can read) and starts broadcasting.
2. **The organiser's phone advertises** (no pairing) a BLE packet with the `shortId` and a token
   that **rotates every 5 s**: `token = HMAC-SHA256(secret, shortId:floor(now/5000))[0..8]`.
3. **A student's phone scans**, decodes the packet and writes a *mark request*
   `sessions/{shortId}/requests/{uid}` = `{ deviceId, token, rssi }`.
4. **Security rules** refuse the request unless the student is enrolled, the session is still
   open, and `deviceId` equals the device bound to their profile.
5. **The organiser's phone verifies** the request (it is the only party holding the secret):
   token within ±1 rotation window, RSSI above the session threshold, device not already used
   by another student. It then writes `attendance/{uid}` or rejects the request with a reason
   that shows up on the student's screen and in the organiser's "rejected attempts" feed.
6. Everything is live through Firestore listeners: the dashboard, the student's status, counts.
7. The organiser home shows any session that is live right now (tap to open the dashboard) and
   the recent lectures with their present/enrolled counts; tapping a past lecture opens its
   record, where marks can still be adjusted and exported.

| Check | Where | Defeats |
|---|---|---|
| Role from email domain (`vitstudent.ac.in` → student, `vit.ac.in` → organiser) | rules | fake organisers |
| Profile bound to one device; only organisers can rebind | rules | logging in on a friend's phone |
| Request must carry the bound `deviceId` | rules | borrowed phones |
| Only enrolled students, only while the session is open | rules | strangers, late marking |
| Token matches the current window ±1 (≤15 s lifetime) | organiser phone | shared / screenshotted / replayed codes |
| RSSI ≥ threshold | organiser phone | marking from the corridor |
| One device marks one student per session | organiser phone | one phone, many accounts |
| Only the organiser writes attendance / closes sessions | rules | self-marking |

## Set up Firebase (once, ~10 minutes)

1. Go to <https://console.firebase.google.com>, **Add project** (any name, Analytics optional).
2. **Build → Authentication → Get started → Email/Password → Enable**.
3. **Build → Firestore Database → Create database** (production mode, any region).
4. **Project settings (gear) → Your apps → Web (</>) → Register app**. Copy the `firebaseConfig`
   values into `mobile/.env`:

   ```
   EXPO_PUBLIC_FIREBASE_API_KEY=...
   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project
   EXPO_PUBLIC_FIREBASE_APP_ID=1:...:web:...
   ```

   (remove the `EXPO_PUBLIC_FIREBASE_EMULATOR=1` line used for local development.)
5. Deploy the security rules and indexes:

   ```bash
   cd firebase
   npx firebase login
   npx firebase use your-project
   npm run deploy
   ```

   Rules are what make the app safe; the app does not work correctly against the default
   "allow all" or "deny all" rules.
6. Rebuild the APK (below) or run `npm run web` in `mobile/`. Phones only need internet now.

## Local development without a Firebase project

The Firebase emulators run everything on your machine (needs JDK 21):

```bash
cd firebase && npm install && npm run emulators     # Auth + Firestore, UI at http://localhost:4000
cd mobile && npm install && npm run web             # .env has EXPO_PUBLIC_FIREBASE_EMULATOR=1
```

Open two origins so each gets its own device id: `http://localhost:8081` as organiser
(`anyone@vit.ac.in`) and `http://127.0.0.1:8081` as student (`anyone@vitstudent.ac.in`).
Start the session with **Demo mode** on: the organiser also publishes the rotating token to
Firestore so a phone or browser without Bluetooth can be marked. Turn demo mode off for real use.

Rule tests (every anti-proxy invariant, run against the emulator):

```bash
cd firebase && npm test
```

## Running on phones

- **Expo Go:** `npx expo start` in `mobile/`; every screen works, Bluetooth is simulated (use demo mode).
- **Real Bluetooth (Android):** install `ProxyProof.apk` (built below) or `npx expo run:android`.
  Organiser phones must be Android (iOS restricts advertising). Keep the organiser app in the
  foreground during a session: it is the verifier.
- Students need Bluetooth + Location on and must accept the permission prompts.
- If students in the room are rejected as "too far", start the session with the **Hall** preset.

## Building the APK on Windows

```bash
cd mobile
npx expo prebuild --platform android --no-install
cd android && gradlew assembleRelease
```

Output: `mobile/android/app/build/outputs/apk/release/app-release.apk` (also copied to `ProxyProof.apk`).
Things this repo already handles that bit us on Windows:

- **Path length.** The native build exceeds the 260-character limit from a path like
  `D:\Claude Code\...`. `plugins/withShortCxxPath.js` moves the app module's CMake staging
  directory to `<drive>:/x`. If it still fails, enable Win32 long paths.
- **EFS-encrypted AppData.** An SDK installed under an encrypted `%LOCALAPPDATA%` yields "Access is
  denied" while hashing `libc++_shared.so`. Install the SDK on an unencrypted path (`D:\Android\Sdk`)
  and point `android/local.properties` at it.
- **react-native-ble-advertiser** ships a 2019 Gradle file and a typo'd Java package
  (`com.vitorpamplona.bleavertiser`). `scripts/patch-ble-advertiser.mjs` (postinstall) rewrites its
  Gradle config and `react-native.config.js` fixes the autolinked import.
- Prerequisites: JDK 17 for Gradle, JDK 21 for the Firebase emulator, Android cmdline-tools with
  `platform-tools`, `platforms;android-36`, `build-tools;36.0.0`, `ndk;27.1.12297006`, `cmake;3.22.1`.
- `EXPO_PUBLIC_*` values from `mobile/.env` are baked in at build time: build with the real
  Firebase config, not the emulator setting.

## BLE details

- Service UUID `8f5e2a10-7d3c-4b6a-9e1f-0c2d4e6a8b1c`, manufacturer data (company id `0xFFFF`):
  `[0x01, shortId(4), token(4)]` — 9 bytes, inside the 31-byte legacy advertising limit.
- iOS cannot put manufacturer data in a foreground advertisement; the same payload is also
  encoded in the local name (`PP<shortId><token>`) and the scanner decodes either.
- RSSI is reported by the student's phone, so it is a proximity *heuristic*; the rotating token
  and device binding carry the security.

## Firestore data model

| Collection | Who writes | Notes |
|---|---|---|
| `users/{uid}` | owner (create), organisers (device rebind) | `role`, `deviceId`, `deviceName` |
| `deviceRequests/{id}` | student (create), organiser (resolve) | device-switch approvals |
| `courses/{id}` | organiser; students add themselves on join | `studentIds[]`, `roster{uid}` |
| `joinCodes/{CODE}` | organiser | lookup for joining |
| `sessions/{shortId}` | organiser | `endsAt`, `closedAt`, `studentIds[]`, `demoToken` |
| `sessions/{id}/private/secret` | organiser only | HMAC secret |
| `sessions/{id}/requests/{uid}` | student (pending), organiser (resolve) | mark requests |
| `sessions/{id}/attendance/{uid}` | organiser | present records |
| `sessions/{id}/attempts/{id}` | organiser | rejected attempts feed |
