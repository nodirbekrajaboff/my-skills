---
name: telegram-mini-apps
description: Comprehensive guide and reference for building, designing, securing, and integrating Telegram Mini Apps (Web Apps / TMA) using the official `window.Telegram.WebApp` JavaScript SDK and Telegram Bot API (6.0 through 9.6+). Trigger this skill whenever the user creates, modifies, styles, debugs, or asks about a Telegram Mini App, `telegram-web-app.js`, `window.Telegram.WebApp`, `initData` / `initDataUnsafe`, HMAC-SHA256 or Ed25519 `signature` third-party validation, `ThemeParams` and `--tg-theme-*` CSS variables, `viewportHeight` / `safeAreaInset` / `contentSafeAreaInset`, `requestFullscreen`, `MainButton` / `SecondaryButton` / `BottomButton`, `BackButton`, `SettingsButton`, `HapticFeedback`, `CloudStorage`, `DeviceStorage`, `SecureStorage`, `BiometricManager`, `LocationManager`, `Accelerometer` / `Gyroscope` / `DeviceOrientation`, `openInvoice` (Telegram Stars), `shareToStory`, `shareMessage` (`savePreparedInlineMessage`), `setEmojiStatus`, `addToHomeScreen`, or launching WebApps via Keyboard, Inline, Menu Button, Attachment Menu, Direct Links (`startapp`), or Inline Mode.
version: 1.0.0
metadata:
  version: "1.0.0"
  author: nodirbekrajaboff
  updated: "2026-10-21"
---

# Telegram Mini Apps (`Telegram.WebApp`) Skill

This skill provides complete, up-to-date architectural guidance, UI/UX layout rules, hardware & storage manager APIs, and cryptographic verification patterns for **Telegram Mini Apps (Web Apps)**, derived directly from the official [Telegram Mini Apps Documentation](https://core.telegram.org/bots/webapps) through **Bot API 9.6**.

---

## 1. Progressive Disclosure & Reference Navigation

Load the specific reference manual or starter template matching your current task:

### Reference Manuals (`references/`)
- **[`references/launch-modes-and-bot-integration.md`](references/launch-modes-and-bot-integration.md)**:
  Read when choosing among the **7 Launch Modes** (Keyboard Button `web_app`, Inline Keyboard `web_app`, Bot Menu Button, Inline Mode `InlineQueryResultButton`, Attachment Menu, Direct Link `t.me/bot/app?startapp=...`, Main Mini App `t.me/bot?startapp=...`), parsing `tgWebAppStartParam` / `start_param`, sending data back via `sendData()`, answering with `answerWebAppQuery()`, or preparing shareable messages with `savePreparedInlineMessage()` + `shareMessage()`.
- **[`references/webapp-core-and-ui-controls.md`](references/webapp-core-and-ui-controls.md)**:
  Read when initializing `window.Telegram.WebApp`, checking feature support via `isVersionAtLeast(version)`, controlling `BackButton`, `SettingsButton`, and `BottomButton` (`MainButton` & `SecondaryButton`, including `position`, `hasShineEffect`, and Bot API 9.5 `iconCustomEmojiId`), or triggering native popups (`showPopup`, `showAlert`, `showConfirm`, `showScanQrPopup`), `openLink`, `openTelegramLink`, `openInvoice`, and `hideKeyboard` (Bot API 9.1).
- **[`references/theming-viewport-and-fullscreen.md`](references/theming-viewport-and-fullscreen.md)**:
  Read when styling Mini Apps with `colorScheme`, `ThemeParams` (all 15 palette keys including `bottom_bar_bg_color` and `section_separator_color`), CSS variables (`--tg-theme-*`, `--tg-viewport-height`, `--tg-viewport-stable-height`), **Bot API 8.0 Fullscreen Mode** (`requestFullscreen`, `exitFullscreen`), Safe Area Insets (`safeAreaInset` vs `contentSafeAreaInset`, `--tg-safe-area-inset-*`, `--tg-content-safe-area-inset-*`), Header/Background/BottomBar colors, and Orientation Locking (`lockOrientation`, `unlockOrientation`).
- **[`references/storage-sensors-and-hardware.md`](references/storage-sensors-and-hardware.md)**:
  Read when using **`CloudStorage`** (cross-device sync, 1024 keys), **`DeviceStorage`** (Bot API 9.0 persistent local storage, 5 MB), **`SecureStorage`** (Bot API 9.0 encrypted storage with `canRestore` & `restoreItem`), **`BiometricManager`** (Face ID / Touch ID), **`LocationManager`** (GPS coordinates), **`HapticFeedback`** (`impactOccurred`, `notificationOccurred`, `selectionChanged`), motion sensors (**`Accelerometer`**, **`DeviceOrientation`**, **`Gyroscope`**), Home Screen shortcuts (`addToHomeScreen`, `checkHomeScreenStatus`), Stories (`shareToStory`), Emoji Status (`setEmojiStatus`, `requestEmojiStatusAccess`), or File Downloads (`downloadFile`).
- **[`references/events-and-methods-reference.md`](references/events-and-methods-reference.md)**:
  Read when looking up exact signatures and payload schemas for all `Telegram.WebApp` properties, methods (through Bot API 9.6 `requestChat`), `onEvent(eventType, handler)` / `offEvent(eventType, handler)` listeners, and data types (`WebAppInitData`, `WebAppUser`, `WebAppChat`).
- **[`references/initdata-validation-and-security.md`](references/initdata-validation-and-security.md)**:
  Read when implementing backend authentication: First-Party **HMAC-SHA256** verification (`"WebAppData"` secret key + `hash`), Third-Party **Ed25519** signature verification (`<bot_id>:WebAppData\n...` + `signature` + Telegram Public Keys), replay attack prevention (`auth_date`), or configuring the Telegram Test Environment (`test_mode`).

### Starter Templates (`examples/`)
- **[`examples/vanilla-ts-mini-app.ts`](examples/vanilla-ts-mini-app.ts)**: Complete browser lifecycle setup (`ready()`, `expand()`, safe area CSS bindings, `MainButton` & `BackButton` routing, `HapticFeedback`, and authenticated `initData` fetch wrapper).
- **[`examples/react-mini-app-provider.tsx`](examples/react-mini-app-provider.tsx)**: Zero-dependency React Context + hooks (`useTelegramWebApp`, `useMainButton`, `useBackButton`, reactive theme & viewport/safe-area listeners) with proper cleanup.
- **[`examples/verify-init-data-hmac.ts`](examples/verify-init-data-hmac.ts)**: Constant-time First-Party HMAC-SHA256 `initData` validator using Web Crypto / Node `node:crypto` with `auth_date` expiration check.
- **[`examples/verify-init-data-ed25519.ts`](examples/verify-init-data-ed25519.ts)**: Third-Party Ed25519 `signature` validator (no Bot Token required) supporting both Production and Test DC public keys.
- **[`examples/bot-mini-app-backend.ts`](examples/bot-mini-app-backend.ts)**: Backend integration showing `MenuButtonWebApp`, `InlineKeyboard` launch, `web_app_data` handling, `answerWebAppQuery`, and `savePreparedInlineMessage` for `shareMessage()`.

---

## 2. Launch Mode Decision Matrix

Different ways of opening a Mini App determine which APIs (`sendData`, `query_id`, `chat`, `start_param`) are available at runtime:

| Launch Mode | How it is Triggered | Return Channel to Bot | `initDataUnsafe` Context | Best Used For |
| :--- | :--- | :--- | :--- | :--- |
| **Keyboard Button** (`KeyboardButton.web_app`) | User taps custom reply keyboard button | `Telegram.WebApp.sendData(str)` (up to 4096 bytes; closes app) | Only `auth_date`, `hash`, `signature` (**No `user` field!**) | Simple stateless form inputs in 1-on-1 bot chats |
| **Inline Button** (`InlineKeyboardButton.web_app`) | User taps inline button on a bot message | `answerWebAppQuery(query_id, result)` OR direct HTTP API to your backend | `user`, `query_id`, `auth_date`, `hash`, `signature` | Rich interactive flows, dashboards, checkouts |
| **Bot Menu Button** (`MenuButtonWebApp`) | User taps persistent Menu button in bot chat | `answerWebAppQuery(query_id, result)` OR direct HTTP API to your backend | `user`, `query_id`, `auth_date`, `hash`, `signature` | Primary entry point inside a bot conversation |
| **Direct Link / Main Mini App** (`t.me/bot/app?startapp=X` or `t.me/bot?startapp=X`) | User clicks any `t.me` deep link, profile button, or homescreen icon | Direct HTTP API to your backend (or `shareMessage` / `switchInlineQuery`) | `user`, `chat` / `chat_type` / `chat_instance` (if launched in group/channel), `start_param` | Viral sharing, group/channel collaborative apps, standalone full-screen apps |
| **Inline Mode** (`InlineQueryResultButton`) | User types `@bot ...` in any chat and taps top button | `switchInlineQuery(query)` or `answerWebAppQuery` | `user`, `query_id`, `auth_date`, `hash`, `signature` | Content generators, sticker/meme makers, search tools |
| **Attachment Menu** | User selects bot from paperclip/attachment menu | `answerWebAppQuery(query_id, result)` | `user`, `query_id`, `receiver` (in private chats), `chat` | File/media pickers, location/order sharing in chats |

---

## 3. Bot API Version Feature Matrix (Use with `isVersionAtLeast`)

Always guard newer SDK capabilities with `Telegram.WebApp.isVersionAtLeast(version)` so older Telegram clients degrade gracefully:

| Bot API | Key Mini App Features Added |
| :--- | :--- |
| **6.0** | Initial `Telegram.WebApp`, `initData`, `ThemeParams`, `MainButton`, `expand()`, `close()`, `sendData()`, `openLink()`, `openInvoice()` |
| **6.1 – 6.2** | `BackButton`, `HapticFeedback`, `showPopup()`, `showAlert()`, `showConfirm()`, `enableClosingConfirmation()` |
| **6.4 – 6.7** | `showScanQrPopup()`, `readTextFromClipboard()`, `switchInlineQuery()` |
| **6.9** | `CloudStorage` (1024 keys per user), `requestWriteAccess()`, `requestContact()`, `setHeaderColor()` (arbitrary `#RRGGBB`) |
| **7.0 – 7.2** | `SettingsButton`, `BiometricManager` (Face ID / Touch ID) |
| **7.6 – 7.8** | `section_separator_color`, `bottom_bar_bg_color`, `setBottomBarColor()`, `shareToStory()` |
| **7.10** | `SecondaryButton` (`BottomButton` class, `position`, `hasShineEffect`) |
| **8.0** | **Full-screen Mode** (`requestFullscreen`, `exitFullscreen`, `isFullscreen`), `safeAreaInset`, `contentSafeAreaInset`, `lockOrientation()`, `addToHomeScreen()`, `Accelerometer`, `DeviceOrientation`, `Gyroscope`, `LocationManager`, `shareMessage()`, `setEmojiStatus()`, `downloadFile()`, Ed25519 `signature` in `initData` |
| **9.0** | **`DeviceStorage`** (5 MB local storage) & **`SecureStorage`** (encrypted local storage with `restoreItem`) |
| **9.1** | **`hideKeyboard()`** to dismiss on-screen software keyboard |
| **9.5** | **`BottomButton.iconCustomEmojiId`** (custom emoji icon on `MainButton` / `SecondaryButton`) |
| **9.6** | **`requestChat(request_id, callback)`** to prompt user to select a chat |

---

## 4. Critical Rules & Anti-Patterns Checklist

1. **Call `Telegram.WebApp.ready()` As Early As Possible**:
   Telegram displays a placeholder loading spinner until `Telegram.WebApp.ready()` is invoked. Call `ready()` as soon as your initial above-the-fold UI shells are mounted—waiting for slow network requests makes the app feel sluggish.
2. **Never Trust `initDataUnsafe` on Your Backend**:
   `initDataUnsafe` is a convenience client-side parsed object that any user can tamper with in DevTools. Always send the raw `Telegram.WebApp.initData` string in an HTTP header (e.g., `Authorization: tma <initData>`) and verify its cryptographic `hash` (HMAC-SHA256) or `signature` (Ed25519) + `auth_date` freshness on your server.
3. **Never Expect `user` or `query_id` From Reply `KeyboardButton` Launches**:
   When a Mini App is opened via a standard reply `KeyboardButton` (`web_app`), Telegram only populates `sendData()` capability; `initDataUnsafe.user` and `query_id` are unavailable. If your app requires user identity or backend API calls, launch it via `InlineKeyboardButton`, `MenuButtonWebApp`, or a Direct Link (`t.me/bot/app`).
4. **Combine Both `safeAreaInset` and `contentSafeAreaInset` in Fullscreen Mode**:
   - `safeAreaInset` (`--tg-safe-area-inset-*`) accounts for **device hardware** (iPhone Dynamic Island, camera notch, iOS home indicator bar).
   - `contentSafeAreaInset` (`--tg-content-safe-area-inset-*`) accounts for **Telegram's overlaid native UI chrome** (the floating Close/Minimize pill and header buttons in fullscreen mode).
   - Top-level interactive content in fullscreen mode needs padding equal to `calc(var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px))` so Telegram's floating close button never overlaps your app's buttons.
5. **Use `--tg-viewport-stable-height` for Fixed Layouts**:
   `--tg-viewport-height` fluctuates on every frame while the user drags the bottom sheet or opens the mobile keyboard. Bind full-screen containers and sticky footers to `var(--tg-viewport-stable-height, 100vh)` to prevent jittery layout thrashing.
6. **Always Clean Up `onEvent` Listeners in Component Unmounts**:
   `Telegram.WebApp.onEvent(type, fn)` registers listeners on the global singleton `window.Telegram.WebApp`. In React/Vue/SPA apps, forgetting `Telegram.WebApp.offEvent(type, fn)` in `useEffect` cleanup causes duplicate click triggers (e.g., `mainButtonClicked` firing 5 times on a single tap).
7. **Guard `BiometricManager` and `LocationManager` Behind `.init()`**:
   Both `BiometricManager` and `LocationManager` report `isInited === false` on startup. Calling `requestAccess()`, `authenticate()`, or `getLocation()` before `init(callback)` completes throws an error.
8. **Use `openTelegramLink()` for `t.me` Links and `openLink()` for External URLs**:
   Passing a `https://t.me/...` URL to `openLink()` opens the external system browser instead of navigating natively inside Telegram. Always route `t.me` links through `Telegram.WebApp.openTelegramLink(url)`.
