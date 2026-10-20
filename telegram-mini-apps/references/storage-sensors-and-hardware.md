# Storage, Biometrics, Sensors, Location & Native OS Features

Telegram Mini Apps expose rich native managers for persistent storage, biometric authentication, haptic feedback, motion sensors, GPS location, stories, custom emoji status, homescreen shortcuts, and file downloads.

---

## Table of Contents
1. [Storage Comparison: `CloudStorage` vs `DeviceStorage` vs `SecureStorage`](#1-storage-comparison-cloudstorage-vs-devicestorage-vs-securestorage)
2. [`HapticFeedback` (Tactile Feedback)](#2-hapticfeedback-tactile-feedback)
3. [`BiometricManager` (Face ID / Touch ID)](#3-biometricmanager-face-id--touch-id)
4. [`LocationManager` (GPS Coordinates)](#4-locationmanager-gps-coordinates)
5. [Motion Sensors: `Accelerometer`, `DeviceOrientation`, `Gyroscope`](#5-motion-sensors-accelerometer-deviceorientation-gyroscope)
6. [Homescreen Shortcuts, Stories, Emoji Status, Clipboard & File Downloads](#6-homescreen-shortcuts-stories-emoji-status-clipboard--file-downloads)

---

## 1. Storage Comparison: `CloudStorage` vs `DeviceStorage` vs `SecureStorage`

Never rely solely on browser `window.localStorage` for critical data in a Mini App—mobile OS WebViews can evict standard WebView cache arbitrarily. Use Telegram's native storage APIs instead:

| Feature | `CloudStorage` (Bot API 6.9+) | `DeviceStorage` (Bot API 9.0+) | `SecureStorage` (Bot API 9.0+) |
| :--- | :--- | :--- | :--- |
| **Scope** | Synced across **all devices** for this Telegram user + bot | Local to the **current device** | Encrypted local storage on the **current device** (Keychain / Keystore) |
| **Capacity** | Up to **1,024 keys** per user (key: 1–128 chars; value: 0–4096 chars) | Up to **5 MB** total per user per bot | Up to **10 items** / **5 MB** encrypted per user per bot |
| **Restoration** | Automatic via Telegram cloud | Persists across app restarts | Supports `canRestore` & `restoreItem()` after app reinstall |
| **Best For** | User preferences, cross-device progress, lightweight state | Offline caches, large JSON blobs, device-specific state | Private keys, wallet seeds, sensitive auth/refresh tokens |

### 1.1 `CloudStorage` (`Telegram.WebApp.CloudStorage`, Bot API 6.9+)
- `setItem(key, value, [callback: (err, stored?: boolean) => void])`
- `getItem(key, callback: (err, value?: string) => void)`
- `getItems(keys: string[], callback: (err, values?: Record<string, string>) => void)`
- `removeItem(key, [callback])` / `removeItems(keys: string[], [callback])`
- `getKeys(callback: (err, keys?: string[]) => void)`

### 1.2 `DeviceStorage` (`Telegram.WebApp.DeviceStorage`, Bot API 9.0+)
- `setItem(key, value, [callback: (err, stored?: boolean) => void])`
- `getItem(key, callback: (err, value?: string | null) => void)`
- `removeItem(key, [callback: (err, removed?: boolean) => void])`
- `clear([callback: (err, cleared?: boolean) => void])`

### 1.3 `SecureStorage` (`Telegram.WebApp.SecureStorage`, Bot API 9.0+)
- `setItem(key, value, [callback: (err, stored?: boolean) => void])`
- `getItem(key, callback: (err, value?: string | null, canRestore?: boolean) => void)`
  - If `value === null` and `canRestore === true`, a previously stored secret exists on the device from an earlier installation and can be recovered with user consent via `restoreItem()`.
- `restoreItem(key, [callback: (err, restoredValue?: string) => void])`
- `removeItem(key, [callback])`
- `clear([callback])`

```ts
// Promisified SecureStorage helper with automatic restore prompt
export function getOrRestoreSecureItem(key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const storage = Telegram.WebApp.SecureStorage;
    storage.getItem(key, (err, value, canRestore) => {
      if (err) return reject(new Error(err));
      if (value !== null) return resolve(value);
      if (canRestore) {
        storage.restoreItem(key, (restoreErr, restoredValue) => {
          if (restoreErr) return reject(new Error(restoreErr));
          resolve(restoredValue ?? null);
        });
      } else {
        resolve(null);
      }
    });
  });
}
```

---

## 2. `HapticFeedback` (Tactile Feedback)

Available since **Bot API 6.1** (`Telegram.WebApp.HapticFeedback`). Trigger native iOS/Android Taptic Engine vibrations on user interactions:
- **`impactOccurred(style)`**: `style` is `"light" | "medium" | "heavy" | "rigid" | "soft"`. Use for button taps, collisions, or drag snapping.
- **`notificationOccurred(type)`**: `type` is `"error" | "success" | "warning"`. Use when an operation completes or fails.
- **`selectionChanged()`**: Use when scrolling through a picker wheel, slider, or segmented tab bar.

---

## 3. `BiometricManager` (Face ID / Touch ID)

Available since **Bot API 7.2** (`Telegram.WebApp.BiometricManager`).
**Critical Rule**: Always call `BiometricManager.init(callback)` before inspecting properties or calling `requestAccess` / `authenticate`.

### Properties (valid after `isInited === true`)
- `isInited` (`Boolean`)
- `isBiometricAvailable` (`Boolean`): Hardware is present on the device.
- `biometricType`: `"finger" | "face" | "unknown"`
- `isAccessRequested` (`Boolean`)
- `isAccessGranted` (`Boolean`)
- `isBiometricTokenSaved` (`Boolean`)
- `deviceId` (`String`): Unique device identifier for binding hardware tokens.

### Complete Biometric Authentication Flow
```ts
const bio = Telegram.WebApp.BiometricManager;

bio.init(() => {
  if (!bio.isBiometricAvailable) {
    console.log("Biometrics not supported on this device");
    return;
  }

  const runAuth = () => {
    bio.authenticate({ reason: "Confirm transaction signing" }, (authenticated, biometricToken) => {
      if (authenticated) {
        console.log("Verified! Hardware token:", biometricToken);
      }
    });
  };

  if (!bio.isAccessGranted) {
    bio.requestAccess({ reason: "Enable Face ID for quick wallet unlocks" }, (granted) => {
      if (granted) runAuth();
      else if (bio.isAccessRequested) {
        // User previously denied permission; offer to open native Settings
        bio.openSettings();
      }
    });
  } else {
    runAuth();
  }
});
```
To save or clear the hardware-protected token on the device, call `bio.updateBiometricToken(newToken, callback)` (pass `""` to delete).

---

## 4. `LocationManager` (GPS Coordinates)

Available since **Bot API 8.0** (`Telegram.WebApp.LocationManager`).
**Critical Rule**: Must be initialized via `LocationManager.init(callback)` first.

### Properties & Methods
- `isInited` (`Boolean`), `isLocationAvailable` (`Boolean`), `isAccessRequested` (`Boolean`), `isAccessGranted` (`Boolean`)
- `init([callback])`
- `getLocation(callback: (location: LocationData | null) => void)`
  - `LocationData`: `{ latitude: number, longitude: number, altitude: number | null, course: number | null, speed: number | null, horizontal_accuracy: number | null, vertical_accuracy: number | null, course_accuracy: number | null, speed_accuracy: number | null }`
  - If `location === null`, access was denied or location services are off.
- `openSettings()` — Opens the OS app settings page if the user previously denied permission (`isAccessRequested && !isAccessGranted`).

---

## 5. Motion Sensors: `Accelerometer`, `DeviceOrientation`, `Gyroscope`

Added in **Bot API 8.0** for games and interactive experiences:

| Sensor Object | Properties | Start Parameters | Events Fired |
| :--- | :--- | :--- | :--- |
| **`Telegram.WebApp.Accelerometer`** | `isStarted`, `x`, `y`, `z` (m/s²) | `{ refresh_rate?: number }` (20–1000 ms, default 1000) | `accelerometerStarted`, `accelerometerChanged`, `accelerometerStopped`, `accelerometerFailed` |
| **`Telegram.WebApp.Gyroscope`** | `isStarted`, `x`, `y`, `z` (rad/s) | `{ refresh_rate?: number }` (20–1000 ms, default 1000) | `gyroscopeStarted`, `gyroscopeChanged`, `gyroscopeStopped`, `gyroscopeFailed` |
| **`Telegram.WebApp.DeviceOrientation`** | `isStarted`, `absolute`, `alpha`, `beta`, `gamma` (rad) | `{ refresh_rate?: number, need_absolute?: boolean }` | `deviceOrientationStarted`, `deviceOrientationChanged`, `deviceOrientationStopped`, `deviceOrientationFailed` |

```ts
// Example: Starting the Accelerometer at 60Hz (~16-20ms) and stopping on cleanup
if (Telegram.WebApp.isVersionAtLeast("8.0")) {
  Telegram.WebApp.Accelerometer.start({ refresh_rate: 20 }, (started) => {
    if (started) console.log("Accelerometer running:", Telegram.WebApp.Accelerometer.x);
  });
  // Later on unmount:
  Telegram.WebApp.Accelerometer.stop();
}
```

---

## 6. Homescreen Shortcuts, Stories, Emoji Status, Clipboard & File Downloads

### Homescreen Shortcuts (Bot API 8.0+)
- `Telegram.WebApp.checkHomeScreenStatus((status) => ...)`:
  - `status`: `"unsupported" | "unknown" | "added" | "missed"`
- `Telegram.WebApp.addToHomeScreen()`: Prompts the user to place an icon for this Mini App on their mobile homescreen (fires `homeScreenAdded` on completion).

### Sharing to Telegram Stories (`shareToStory`, Bot API 7.8+)
```ts
Telegram.WebApp.shareToStory("https://example.com/achievement-card.png", {
  text: "Just hit level 50 in @MyGameBot!",
  widget_link: {
    url: "https://t.me/MyGameBot/play?startapp=ref_123",
    name: "Play Now",
  },
});
```

### Setting Custom Emoji Status (`setEmojiStatus`, Bot API 8.0+)
Prompts the user (or sets automatically if `requestEmojiStatusAccess` was granted) to display a custom emoji badge next to their Telegram name:
```ts
Telegram.WebApp.setEmojiStatus(
  "5368324170671202286",
  { duration: 3600 }, // Optional duration in seconds
  (success: boolean) => {
    if (success) console.log("Emoji status updated!");
  }
);
```

### Downloading Files (`downloadFile`, Bot API 8.0+)
Triggers a native confirmation dialog to save a file from an HTTPS URL to the user's device:
```ts
Telegram.WebApp.downloadFile(
  { url: "https://example.com/exports/invoice-2026.pdf", file_name: "invoice-2026.pdf" },
  (accepted: boolean) => {
    if (accepted) console.log("Download started");
  }
);
```

### Reading Clipboard (`readTextFromClipboard`, Bot API 6.4+)
**Note**: Can only be called inside a user-initiated click handler (e.g., `MainButton.onClick` or a DOM `click` listener), mainly for Attachment Menu Mini Apps:
```ts
Telegram.WebApp.readTextFromClipboard((clipboardText: string | null) => {
  if (clipboardText) console.log("Pasted:", clipboardText);
});
```
