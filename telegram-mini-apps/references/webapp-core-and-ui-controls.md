# `Telegram.WebApp` Core Lifecycle, Native Buttons & Popups

To connect a web page to the Telegram client, place the official script in `<head>` **before** any other scripts:

```html
<script src="https://telegram.org/js/telegram-web-app.js"></script>
```

Once loaded, `window.Telegram.WebApp` is globally available.

---

## Table of Contents
1. [App Initialization & Version Guards](#1-app-initialization--version-guards)
2. [`BackButton` (Header Navigation)](#2-backbutton-header-navigation)
3. [`BottomButton`: `MainButton` & `SecondaryButton`](#3-bottombutton-mainbutton--secondarybutton)
4. [`SettingsButton` (Context Menu)](#4-settingsbutton-context-menu)
5. [Native Popups, Alerts, Confirms & QR Scanner](#5-native-popups-alerts-confirms--qr-scanner)
6. [Closing Confirmation, Keyboard Dismissal & External Navigation](#6-closing-confirmation-keyboard-dismissal--external-navigation)

---

## 1. App Initialization & Version Guards

### Standard Startup Sequence
```ts
const webapp = window.Telegram?.WebApp;

if (webapp) {
  // 1. Hide Telegram's loading skeleton as soon as your shell mounts
  webapp.ready();

  // 2. Optionally expand the bottom sheet to full available height
  if (!webapp.isExpanded) {
    webapp.expand();
  }
}
```

### Checking Feature Support (`isVersionAtLeast`)
Telegram users may be on slightly older mobile or desktop clients. Always check `webapp.isVersionAtLeast(version)` before calling methods added in recent Bot API releases:

```ts
if (webapp.isVersionAtLeast("8.0")) {
  webapp.requestFullscreen();
} else {
  webapp.expand();
}
```

---

## 2. `BackButton` (Header Navigation)

Available since **Bot API 6.1** (`Telegram.WebApp.BackButton`). Controls the native back arrow in the top-left of the Mini App header. When hidden, Telegram displays the **Close (`×`)** button instead.

### Fields & Methods
- `isVisible` (`Boolean`): Whether the button is currently shown (default `false`).
- `onClick(callback)` / `offClick(callback)`: Registers or removes a click listener (alias for `WebApp.onEvent('backButtonClicked', callback)`).
- `show()` / `hide()`: Shows or hides the back button.

### Router Integration Pattern
```ts
const backBtn = Telegram.WebApp.BackButton;

function syncBackButtonWithHistory(canGoBack: boolean) {
  if (canGoBack) {
    backBtn.show();
  } else {
    backBtn.hide();
  }
}

const handleBack = () => window.history.back();
backBtn.onClick(handleBack);
// Always call backBtn.offClick(handleBack) on cleanup!
```

---

## 3. `BottomButton`: `MainButton` & `SecondaryButton`

Telegram provides two native action buttons in the bottom bar, both instances of the **`BottomButton`** class:
- **`Telegram.WebApp.MainButton`** (Bot API 6.0+): Primary CTA button.
- **`Telegram.WebApp.SecondaryButton`** (Bot API 7.10+): Secondary action button rendered alongside `MainButton`.

### `BottomButton` Properties
| Property | Type | Description |
| :--- | :--- | :--- |
| `type` | `"main" \| "secondary"` | Read-only button type identifier. |
| `text` | `String` | Current button text (`"Continue"` default for `MainButton`, `"Cancel"` for `SecondaryButton`). |
| `color` | `String` | Button background color (`themeParams.button_color` for `MainButton`, `themeParams.bottom_bar_bg_color` for `SecondaryButton`). |
| `textColor` | `String` | Button text color (`themeParams.button_text_color` for `MainButton`, `themeParams.button_color` for `SecondaryButton`). |
| `isVisible` | `Boolean` | Whether the button is visible (default `false`). |
| `isActive` | `Boolean` | Whether the button is enabled/clickable (default `true`). |
| `hasShineEffect` | `Boolean` | *(Bot API 7.10+)* Enables a subtle animated shimmer effect across the button. |
| `position` | `"left" \| "right" \| "top" \| "bottom"` | *(Bot API 7.10+, `SecondaryButton` only)* Position of `SecondaryButton` relative to `MainButton` (default `"left"`). |
| ` isProgressVisible` | `Boolean` | Read-only flag indicating whether the loading spinner is active. |
| `iconCustomEmojiId` | `String` | *(Bot API 9.5+)* Custom emoji ID displayed as an icon on the button. |

### `BottomButton` Methods (Chainable)
- `setText(text)` — Updates the button label.
- `onClick(callback)` / `offClick(callback)` — Attaches/detaches click handler (`mainButtonClicked` or `secondaryButtonClicked`).
- `show()` / `hide()` — Toggles button visibility.
- `enable()` / `disable()` — Toggles `isActive` state.
- `showProgress([leaveActive])` / `hideProgress()` — Shows/hides the native loading spinner. Pass `leaveActive = false` (default) to prevent double-submits while a request is in flight.
- `setParams(params)` — Batch-updates multiple properties in one call:
  ```ts
  Telegram.WebApp.MainButton.setParams({
    text: "Pay 250 Stars",
    color: "#2cab37",
    text_color: "#ffffff",
    has_shine_effect: true,
    icon_custom_emoji_id: "5368324170671202286", // Bot API 9.5+
    is_active: true,
    is_visible: true,
  });

  if (Telegram.WebApp.isVersionAtLeast("7.10")) {
    Telegram.WebApp.SecondaryButton.setParams({
      text: "Cancel",
      position: "left",
      is_visible: true,
    });
  }
  ```

---

## 4. `SettingsButton` (Context Menu)

Available since **Bot API 7.0** (`Telegram.WebApp.SettingsButton`). Controls whether a **"Settings"** item appears inside the Mini App's three-dot overflow menu (`⋮`).
- `isVisible` (`Boolean`)
- `onClick(callback)` / `offClick(callback)`
- `show()` / `hide()`

---

## 5. Native Popups, Alerts, Confirms & QR Scanner

Always prefer Telegram's native modal methods over browser `window.alert()` / `window.confirm()`, which look out of place and can fail in mobile WebViews.

### `showPopup(params, [callback])` (Bot API 6.2+)
Displays a native dialog with up to **3 buttons**:
- `title` (`String`, optional, 0–64 chars)
- `message` (`String`, required, 1–256 chars)
- `buttons` (`PopupButton[]`, 1–3 items):
  - `{ id?: string, type?: "default" | "ok" | "close" | "cancel" | "destructive", text?: string }`
  - Note: `text` is required for `"default"` and `"destructive"` types (0–64 chars).

```ts
Telegram.WebApp.showPopup(
  {
    title: "Delete Workspace?",
    message: "This action cannot be undone and all files will be removed.",
    buttons: [
      { id: "delete", type: "destructive", text: "Delete Forever" },
      { id: "cancel", type: "cancel" },
    ],
  },
  (buttonId) => {
    if (buttonId === "delete") {
      performDelete();
    }
  }
);
```

### `showAlert(message, [callback])` & `showConfirm(message, [callback])`
```ts
Telegram.WebApp.showAlert("Profile saved!", () => {
  console.log("User dismissed alert");
});

Telegram.WebApp.showConfirm("Discard unsaved changes?", (confirmed: boolean) => {
  if (confirmed) Telegram.WebApp.close();
});
```

### `showScanQrPopup(params, [callback])` & `closeScanQrPopup()` (Bot API 6.4+)
Opens the native camera QR scanner. Return `true` from the callback (or call `closeScanQrPopup()`) to automatically close the scanner once a valid QR code is scanned:
```ts
Telegram.WebApp.showScanQrPopup({ text: "Point camera at wallet QR code" }, (qrText: string) => {
  if (qrText.startsWith("ton://")) {
    handleTonAddress(qrText);
    return true; // Returning true closes the QR scanner popup immediately
  }
  return false; // Keep scanning
});
```

---

## 6. Closing Confirmation, Keyboard Dismissal & External Navigation

### Preventing Accidental Swipe-to-Close (Bot API 6.2+)
When the user is filling out a multi-step form or playing a game, prevent accidental vertical swipe gestures from closing the Mini App:
```ts
Telegram.WebApp.enableClosingConfirmation();
// Or disable vertical swipes entirely (Bot API 7.7+):
if (Telegram.WebApp.isVersionAtLeast("7.7")) {
  Telegram.WebApp.disableVerticalSwipes();
}
```

### Dismissing Software Keyboard (`hideKeyboard`, Bot API 9.1+)
```ts
if (Telegram.WebApp.isVersionAtLeast("9.1")) {
  Telegram.WebApp.hideKeyboard();
}
```

### Opening External vs. Telegram Links
- **External Websites**: `Telegram.WebApp.openLink(url, { try_instant_view?: boolean })`
  Opens `url` in the system browser (or Telegram Instant View if `try_instant_view: true` on supported articles).
- **Internal Telegram Links (`https://t.me/...`)**: `Telegram.WebApp.openTelegramLink(url)`
  Opens channels, bots, other Mini Apps, or share links natively inside the Telegram app without switching to an external browser.
