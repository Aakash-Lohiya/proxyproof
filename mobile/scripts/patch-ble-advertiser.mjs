// react-native-ble-advertiser 0.0.17 ships a 2019-era android/build.gradle (compileSdk 28,
// no namespace) that cannot build with today's Android Gradle Plugin. This rewrites it to
// follow the root project's SDK versions. Runs automatically on `npm install` (postinstall).
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'react-native-ble-advertiser', 'android');
if (!existsSync(root)) {
  console.log('[patch-ble-advertiser] module not installed, skipping');
  process.exit(0);
}

writeFileSync(join(root, 'build.gradle'), `apply plugin: 'com.android.library'

def safeExtGet(prop, fallback) {
    rootProject.ext.has(prop) ? rootProject.ext.get(prop) : fallback
}

android {
    namespace "com.vitorpamplona.bleadvertiser"
    compileSdkVersion safeExtGet('compileSdkVersion', 36)

    defaultConfig {
        minSdkVersion safeExtGet('minSdkVersion', 24)
        targetSdkVersion safeExtGet('targetSdkVersion', 36)
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}

dependencies {
    implementation 'com.facebook.react:react-android'
}
`);

writeFileSync(join(root, 'src', 'main', 'AndroidManifest.xml'), `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
          <uses-permission android:name="android.permission.BLUETOOTH" />
          <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
          <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
          <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
</manifest>
`);

console.log('[patch-ble-advertiser] patched android/build.gradle and AndroidManifest.xml');
