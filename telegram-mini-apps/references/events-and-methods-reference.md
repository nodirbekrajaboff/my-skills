# Complete `Telegram.WebApp` Properties, Methods, Events & Schemas Reference

Exhaustive lookup manual for `window.Telegram.WebApp` fields, methods, events (`onEvent` / `offEvent`), and data types (`WebAppInitData`, `WebAppUser`, `WebAppChat`) through **Bot API 9.6**.

---

## Table of Contents
1. [`Telegram.WebApp` Properties](#1-telegramwebapp-properties)
2. [`Telegram.WebApp` Methods](#2-telegramwebapp-methods)
3. [All Events (`onEvent` / `offEvent`)](#3-all-events-onevent--offevent)
4. [Data Type Schemas (`WebAppInitData`, `WebAppUser`, `WebAppChat`)](#4-data-type-schemas-webappinitdata-webappuser-webappchat)

---

## 1. `Telegram.WebApp` Properties

| Property | Type | Bot API | Description |
| :--- | :--- | :--- | :--- |
| `initData` | `String` | 6.0 | Raw URL-encoded query string passed to the Mini App for backend cryptographic validation. Empty string `""` if opened in a normal browser. |
| `initDataUnsafe` | `WebAppInitData` | 6.0 | Client-side parsed object with `user`, `receiver`, `chat`, `start_param`, `auth_date`, `hash`, `signature`. **Do not trust without backend verification.** |
| `version` | `String` | 6.0 | Bot API version supported by the user's Telegram client (e.g., `"8.0"`, `"9.6"`). |
| `platform` | `String` | 6.0 | Client identifier (`"ios"`, `"android"`, `"tdesktop"`, `"macos"`, `"weba"`, `"webk"`, `"unigram"`, `"unknown"`). |
| `colorScheme` | `"light" \| "dark"` | 6.0 | Current Telegram color scheme (`var(--tg-color-scheme)`). |
| `themeParams` | `ThemeParams` | 6.0 | Active theme palette colors (`bg_color`, `text_color`, `button_color`, etc.). |
| `isActive` | `Boolean` | 8.0 | `true` if the Mini App is currently visible and active (not minimized or in background). |
| `isExpanded` | `Boolean` | 6.0 | `true` if expanded to maximum available bottom-sheet height. |
| `viewportHeight` | `Number` | 6.0 | Real-time visible height of the Mini App in pixels (`var(--tg-viewport-height)`). |
| `viewportStableHeight` | `Number` | 6.0 | Visible height when state animations settle (`var(--tg-viewport-stable-height)`). |
| `headerColor` | `String` | 6.1 | Current `#RRGGBB` header color. |
| `backgroundColor` | `String` | 6.1 | Current `#RRGGBB` background color. |
| `bottomBarColor` | `String` | 7.8 | Current `#RRGGBB` bottom bar background color. |
| `isClosingConfirmationEnabled` | `Boolean` | 6.2 | `true` if closing confirmation dialog is active. |
| `isVerticalSwipesEnabled` | `Boolean` | 7.7 | `true` if vertical swipes can minimize/close the Mini App. |
| `isFullscreen` | `Boolean` | 8.0 | `true` if currently displaying in full-screen mode. |
| `isOrientationLocked` | `Boolean` | 8.0 | `true` if screen orientation is locked. |
| `safeAreaInset` | `SafeAreaInset` | 8.0 | `{ top, bottom, left, right }` device hardware safe area margins in pixels. |
| `contentSafeAreaInset` | `ContentSafeAreaInset` | 8.0 | `{ top, bottom, left, right }` safe area margins free from overlapping Telegram UI buttons. |
| `BackButton` | `BackButton` | 6.1 | Controller for header Back button. |
| `MainButton` | `BottomButton` | 6.0 | Controller for primary bottom action button. |
| `SecondaryButton` | `BottomButton` | 7.10 | Controller for secondary bottom action button. |
| `SettingsButton` | `SettingsButton` | 7.0 | Controller for Settings item in context menu. |
| `HapticFeedback` | `HapticFeedback` | 6.1 | Controller for native vibrations/haptics. |
| `CloudStorage` | `CloudStorage` | 6.9 | Cross-device cloud key-value storage (1024 keys). |
| `BiometricManager` | `BiometricManager` | 7.2 | Hardware Face ID / Touch ID manager. |
| `Accelerometer` | `Accelerometer` | 8.0 | Device linear acceleration sensor (`x`, `y`, `z`). |
| `DeviceOrientation` | `DeviceOrientation` | 8.0 | Physical orientation sensor (`alpha`, `beta`, `gamma`, `absolute`). |
| `Gyroscope` | `Gyroscope` | 8.0 | Angular velocity sensor (`x`, `y`, `z`). |
| `LocationManager` | `LocationManager` | 8.0 | GPS location manager. |
| `DeviceStorage` | `DeviceStorage` | 9.0 | Persistent local storage on the user's device (5 MB). |
| `SecureStorage` | `SecureStorage` | 9.0 | Encrypted local storage on the user's device (5 MB, restorable). |

---

## 2. `Telegram.WebApp` Methods

| Method Signature | Bot API | Description |
| :--- | :--- | :--- |
| `isVersionAtLeast(version: string): boolean` | 6.1 | Returns `true` if the user's client supports at least `version`. |
| `setHeaderColor(color: "bg_color" \| "secondary_bg_color" \| string)` | 6.1 / 6.9 | Sets header color (`#RRGGBB` supported since 6.9). |
| `setBackgroundColor(color: "bg_color" \| "secondary_bg_color" \| string)` | 6.1 | Sets background color (`#RRGGBB` or theme key). |
| `setBottomBarColor(color: "bg_color" \| "secondary_bg_color" \| "bottom_bar_bg_color" \| string)` | 7.8 | Sets bottom bar color. |
| `enableClosingConfirmation()` / `disableClosingConfirmation()` | 6.2 | Toggles confirmation prompt before closing the Mini App. |
| `enableVerticalSwipes()` / `disableVerticalSwipes()` | 7.7 | Toggles vertical swipe gestures to collapse/close the Mini App. |
| `requestFullscreen()` / `exitFullscreen()` | 8.0 | Enters or exits full-screen mode. |
| `lockOrientation()` / `unlockOrientation()` | 8.0 | Locks or unlocks screen rotation. |
| `addToHomeScreen()` | 8.0 | Prompts the user to add a shortcut icon to their device homescreen. |
| `checkHomeScreenStatus([callback: (status) => void])` | 8.0 | Queries homescreen shortcut status (`"unsupported" \| "unknown" \| "added" \| "missed"`). |
| `onEvent(eventType: string, eventHandler: Function)` | 6.0 | Subscribes to a Mini App event. |
| `offEvent(eventType: string, eventHandler: Function)` | 6.0 | Unsubscribes from a Mini App event. |
| `sendData(data: string)` | 6.0 | Sends up to 4096 bytes to the bot in a `web_app_data` service message (Keyboard button launch only) and closes app. |
| `switchInlineQuery(query: string, [choose_chat_types?: ("users" \| "bots" \| "groups" \| "channels")[]])` | 6.7 | Inserts `@botname query` into the input field of the current or user-selected chat. |
| `openLink(url: string, [options?: { try_instant_view?: boolean }])` | 6.0 / 6.4 | Opens an external HTTP/HTTPS link in the external browser (or Instant View). |
| `openTelegramLink(url: string)` | 6.0 | Opens a `https://t.me/...` link natively inside Telegram. |
| `openInvoice(url: string, [callback?: (status: "paid" \| "cancelled" \| "failed" \| "pending") => void])` | 6.1 | Opens a Telegram Stars / payment invoice link (`https://t.me/$...`). |
| `shareToStory(media_url: string, [params?: StoryShareParams])` | 7.8 | Opens the native story editor with the specified photo/video URL, optional `text` (0–200 chars), and `widget_link` (`{ url, name }`). |
| `shareMessage(msg_id: string, [callback?: (sent: boolean) => void])` | 8.0 | Opens native dialog to share a message prepared by the bot via `savePreparedInlineMessage`. |
| `setEmojiStatus(custom_emoji_id: string, [params?: { duration?: number }], [callback?: (success: boolean) => void])` | 8.0 | Prompts user to set custom emoji status (or sets directly if permission granted). |
| `requestEmojiStatusAccess([callback?: (granted: boolean) => void])` | 8.0 | Requests permission for the bot/Mini App to manage the user's emoji status directly. |
| `downloadFile(params: { url: string, file_name: string }, [callback?: (accepted: boolean) => void])` | 8.0 | Prompts native file download confirmation dialog. |
| `hideKeyboard()` | 9.1 | Hides the on-screen software keyboard. |
| `showPopup(params: PopupParams, [callback?: (button_id?: string) => void])` | 6.2 | Opens a native modal popup with 1–3 custom buttons. |
| `showAlert(message: string, [callback?: () => void])` | 6.2 | Opens a native alert modal with an OK button. |
| `showConfirm(message: string, [callback?: (confirmed: boolean) => void])` | 6.2 | Opens a native confirmation modal with OK/Cancel buttons. |
| `showScanQrPopup(params: { text?: string }, [callback?: (text: string) => boolean \| void])` | 6.4 | Opens camera QR scanner; return `true` from callback to close scanner. |
| `closeScanQrPopup()` | 6.4 | Closes the camera QR scanner popup. |
| `readTextFromClipboard([callback?: (text: string \| null) => void])` | 6.4 | Reads text from clipboard (must be called inside a user gesture handler). |
| `requestWriteAccess([callback?: (granted: boolean) => void])` | 6.9 | Prompts user to allow the bot to send them private messages. |
| `requestContact([callback?: (shared: boolean) => void])` | 6.9 | Prompts user to share their phone number with the bot. |
| `requestChat(request_id: number, [callback?: (success: boolean) => void])` | 9.6 | Prompts user to select and share a chat with the bot. |
| `ready()` | 6.0 | Informs Telegram that the Mini App is ready to be displayed. |
| `expand()` | 6.0 | Expands the Mini App bottom sheet to maximum height. |
| `close()` | 6.0 | Closes the Mini App. |

---

## 3. All Events (`onEvent` / `offEvent`)

| Event Name | Bot API | Callback Arguments / Payload | When It Fires |
| :--- | :--- | :--- | :--- |
| `activated` | 8.0 | `()` | Mini App moves to foreground / becomes active (`isActive === true`). |
| `deactivated` | 8.0 | `()` | Mini App is minimized or user switches away (`isActive === false`). |
| `themeChanged` | 6.0 | `()` | User switches light/dark mode or changes palette; read updated `colorScheme` & `themeParams`. |
| `viewportChanged` | 6.0 | `({ isStateStable: boolean })` | Viewport height changes; check `isStateStable` before running heavy layout calculations. |
| `safeAreaChanged` | 8.0 | `()` | Device hardware safe area (`safeAreaInset`) changes (e.g., device rotation). |
| `contentSafeAreaChanged` | 8.0 | `()` | Telegram UI overlay safe area (`contentSafeAreaInset`) changes. |
| `mainButtonClicked` | 6.0 | `()` | User taps `MainButton`. |
| `secondaryButtonClicked` | 7.10 | `()` | User taps `SecondaryButton`. |
| `backButtonClicked` | 6.1 | `()` | User taps header `BackButton`. |
| `settingsButtonClicked` | 7.0 | `()` | User taps Settings item in overflow menu. |
| `invoiceClosed` | 6.1 | `({ url: string, status: "paid" \| "cancelled" \| "failed" \| "pending" })` | An invoice opened via `openInvoice()` is closed. |
| `popupClosed` | 6.2 | `({ button_id: string \| null })` | Native popup closes (`button_id` is `null` if dismissed outside buttons). |
| `qrTextReceived` | 6.4 | `({ data: string })` | QR scanner detects a QR code. |
| `scanQrPopupClosed` | 6.4 | `()` | User closes the QR scanner popup manually. |
| `clipboardTextReceived` | 6.4 | `({ data: string \| null })` | `readTextFromClipboard()` completes. |
| `writeAccessRequested` | 6.9 | `({ status: "allowed" \| "cancelled" })` | User responds to `requestWriteAccess()`. |
| `contactRequested` | 6.9 | `({ status: "sent" \| "cancelled" })` | User responds to `requestContact()`. |
| `biometricManagerUpdated` | 7.2 | `()` | `BiometricManager` finishes initializing or updates state. |
| `biometricAuthRequested` | 7.2 | `({ isAuthenticated: boolean, biometricToken?: string })` | `BiometricManager.authenticate()` finishes. |
| `biometricTokenUpdated` | 7.2 | `({ isUpdated: boolean })` | `BiometricManager.updateBiometricToken()` finishes. |
| `fullscreenChanged` | 8.0 | `()` | Mini App enters or exits fullscreen mode (`isFullscreen`). |
| `fullscreenFailed` | 8.0 | `({ error: "UNSUPPORTED" \| "ALREADY_FULLSCREEN" })` | `requestFullscreen()` fails. |
| `homeScreenAdded` | 8.0 | `()` | User confirms adding Mini App shortcut to homescreen. |
| `homeScreenChecked` | 8.0 | `({ status: "unsupported" \| "unknown" \| "added" \| "missed" })` | `checkHomeScreenStatus()` completes. |
| `accelerometerStarted` / `accelerometerChanged` / `accelerometerStopped` / `accelerometerFailed` | 8.0 | `()` or `({ error: "UNSUPPORTED" })` | Accelerometer lifecycle and sample updates. |
| `deviceOrientationStarted` / `deviceOrientationChanged` / `deviceOrientationStopped` / `deviceOrientationFailed` | 8.0 | `()` or `({ error: "UNSUPPORTED" })` | DeviceOrientation lifecycle and sample updates. |
| `gyroscopeStarted` / `gyroscopeChanged` / `gyroscopeStopped` / `gyroscopeFailed` | 8.0 | `()` or `({ error: "UNSUPPORTED" })` | Gyroscope lifecycle and sample updates. |
| `locationManagerUpdated` | 8.0 | `()` | `LocationManager` finishes initializing or updates permission state. |
| `locationRequested` | 8.0 | `({ locationData: LocationData })` | `LocationManager.getLocation()` returns coordinates. |
| `shareMessageSent` / `shareMessageFailed` | 8.0 | `()` or `({ error: "UNSUPPORTED" \| "MESSAGE_EXPIRED" \| "MESSAGE_SEND_FAILED" \| "USER_DECLINED" \| "UNKNOWN_ERROR" })` | `shareMessage()` completes or fails. |
| `emojiStatusSet` / `emojiStatusFailed` | 8.0 | `()` or `({ error: "UNSUPPORTED" \| "SUGGESTED_EMOJI_INVALID" \| "DURATION_INVALID" \| "USER_DECLINED" \| "SERVER_ERROR" \| "UNKNOWN_ERROR" })` | `setEmojiStatus()` completes or fails. |
| `emojiStatusAccessRequested` | 8.0 | `({ status: "allowed" \| "cancelled" })` | User responds to `requestEmojiStatusAccess()`. |
| `fileDownloadRequested` | 8.0 | `({ status: "downloading" \| "cancelled" })` | User responds to `downloadFile()` prompt. |

---

## 4. Data Type Schemas (`WebAppInitData`, `WebAppUser`, `WebAppChat`)

### `WebAppInitData`
```ts
interface WebAppInitData {
  query_id?: string;        // Unique ID for answerWebAppQuery (Inline, Menu, Attachment launches)
  user?: WebAppUser;        // Current user who opened the Mini App
  receiver?: WebAppUser;    // Chat partner (Attachment Menu in private chats only)
  chat?: WebAppChat;        // Group/supergroup/channel context where Mini App was launched
  chat_type?: "sender" | "private" | "group" | "supergroup" | "channel";
  chat_instance?: string;   // Global identifier for the chat instance
  start_param?: string;     // Value of ?startapp=... (or tgWebAppStartParam)
  can_send_after?: number;  // Seconds until answerWebAppQuery is allowed again
  auth_date: number;        // Unix timestamp when initData was signed by Telegram
  hash: string;             // Hex HMAC-SHA256 signature (for Bot Token verification)
  signature: string;        // Base64URL Ed25519 signature (Bot API 8.0+, for 3rd-party verification)
}
```

### `WebAppUser`
```ts
interface WebAppUser {
  id: number;                        // 64-bit integer user ID
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;            // IETF language tag (e.g. "en", "ru", "uz")
  is_premium?: boolean;              // true if user has Telegram Premium
  added_to_attachment_menu?: boolean;
  allows_write_to_pm?: boolean;      // true if bot can send private messages to this user
  photo_url?: string;                // URL of user's profile photo (Bot API 7.0+)
}
```

### `WebAppChat`
```ts
interface WebAppChat {
  id: number;                        // 64-bit integer chat ID (negative for groups/channels)
  type: "group" | "supergroup" | "channel";
  title: string;
  username?: string;
  photo_url?: string;
}
```
