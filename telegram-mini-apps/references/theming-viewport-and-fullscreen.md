# Theming, Viewport, Fullscreen Mode & Safe Area Insets

Telegram Mini Apps adapt dynamically to the user's light/dark theme, custom Telegram color palettes, dynamic bottom-sheet heights, and **Bot API 8.0+ Fullscreen Mode** with hardware and UI safe areas.

---

## Table of Contents
1. [Color Schemes & Complete `ThemeParams` Reference](#1-color-schemes--complete-themeparams-reference)
2. [Chrome Styling: Header, Background & Bottom Bar Colors](#2-chrome-styling-header-background--bottom-bar-colors)
3. [Viewport Height & Vertical Swipes](#3-viewport-height--vertical-swipes)
4. [Fullscreen Mode & Safe Area Insets (Bot API 8.0+)](#4-fullscreen-mode--safe-area-insets-bot-api-80)
5. [Screen Orientation Locking (Bot API 8.0+)](#5-screen-orientation-locking-bot-api-80)

---

## 1. Color Schemes & Complete `ThemeParams` Reference

- **`Telegram.WebApp.colorScheme`**: `"light" | "dark"` (also exposed in CSS as `var(--tg-color-scheme)`).
- **`Telegram.WebApp.themeParams`**: Object containing `#RRGGBB` hex colors. Every key is automatically mirrored to a `--tg-theme-*` CSS custom property on `<html>`.

| `themeParams` Property | CSS Custom Property | Bot API | Purpose & Fallback Guidance |
| :--- | :--- | :--- | :--- |
| `bg_color` | `var(--tg-theme-bg-color)` | 6.0 | Primary page/screen background color |
| `secondary_bg_color` | `var(--tg-theme-secondary-bg-color)` | 6.1 | Grouped list background or card background |
| `text_color` | `var(--tg-theme-text-color)` | 6.0 | Primary body and heading text color |
| `hint_color` | `var(--tg-theme-hint-color)` | 6.0 | Muted text, placeholders, captions |
| `link_color` | `var(--tg-theme-link-color)` | 6.0 | Hyperlinks and interactive inline actions |
| `button_color` | `var(--tg-theme-button-color)` | 6.0 | Primary accent / CTA button background |
| `button_text_color` | `var(--tg-theme-button-text-color)` | 6.0 | Text color on top of `button_color` |
| `header_bg_color` | `var(--tg-theme-header-bg-color)` | 7.0 | Top navigation/header bar background |
| `bottom_bar_bg_color` | `var(--tg-theme-bottom-bar-bg-color)` | 7.8 | Bottom bar container background behind `MainButton` |
| `accent_text_color` | `var(--tg-theme-accent-text-color)` | 7.0 | Highlighted labels, active tabs, badges |
| `section_bg_color` | `var(--tg-theme-section-bg-color)` | 7.0 | Surface color for grouped settings/cards |
| `section_header_text_color` | `var(--tg-theme-section-header-text-color)` | 7.0 | Uppercase/small section title text |
| `section_separator_color` | `var(--tg-theme-section-separator-color)` | 7.6 | Hairline divider color between list rows |
| `subtitle_text_color` | `var(--tg-theme-subtitle-text-color)` | 7.0 | Secondary row descriptions and subheadings |
| `destructive_text_color` | `var(--tg-theme-destructive-text-color)` | 7.0 | Delete buttons, error messages, warnings |

### Reacting to Live Theme Changes
When the user switches between Light and Dark mode (or changes their OS theme), CSS variables update automatically. If you render onto `<canvas>` or sync a JS UI library theme, listen to `themeChanged`:
```ts
Telegram.WebApp.onEvent("themeChanged", () => {
  const isDark = Telegram.WebApp.colorScheme === "dark";
  const bgColor = Telegram.WebApp.themeParams.bg_color;
  // Re-render canvas or update JS theme provider
});
```

---

## 2. Chrome Styling: Header, Background & Bottom Bar Colors

Customize the native Telegram frame surrounding your Mini App so it blends seamlessly with your app's surface:
- **`setHeaderColor(color)`**: Accepts `"bg_color"`, `"secondary_bg_color"`, or any `#RRGGBB` hex string (Bot API 6.9+).
- **`setBackgroundColor(color)`**: Accepts `"bg_color"`, `"secondary_bg_color"`, or any `#RRGGBB` hex string. Sets the background shown behind the WebView during overscroll or initial load.
- **`setBottomBarColor(color)`** *(Bot API 7.8+)*: Accepts `"bg_color"`, `"secondary_bg_color"`, `"bottom_bar_bg_color"`, or any `#RRGGBB` hex string.

```ts
if (Telegram.WebApp.isVersionAtLeast("7.8")) {
  Telegram.WebApp.setHeaderColor("#0f172a");
  Telegram.WebApp.setBackgroundColor("#0f172a");
  Telegram.WebApp.setBottomBarColor("#0f172a");
}
```

---

## 3. Viewport Height & Vertical Swipes

### `viewportHeight` vs. `viewportStableHeight`
- **`viewportHeight`** (`var(--tg-viewport-height)`): Real-time height of the visible area in pixels. Updates continuously (60fps) while the user drags the bottom sheet up/down.
- **`viewportStableHeight`** (`var(--tg-viewport-stable-height)`): Height of the visible area **only after** animations/gestures settle (`isStateStable === true`).

**Best Practice**: Always size your root layout container to `var(--tg-viewport-stable-height, 100vh)` so the layout does not reflow on every touch-move frame:
```css
html, body, #root {
  margin: 0;
  padding: 0;
  height: var(--tg-viewport-stable-height, 100vh);
  background-color: var(--tg-theme-bg-color, #ffffff);
  color: var(--tg-theme-text-color, #000000);
  overflow-x: hidden;
}
```

### Controlling Vertical Swipes (Bot API 7.7+)
If your Mini App has scrollable inner lists, a `<canvas>`, or drag-and-drop interactions, vertical swipes might accidentally collapse or close the Telegram bottom sheet:
- `Telegram.WebApp.disableVerticalSwipes()` — Prevents vertical drag gestures inside the WebView from minimizing/closing the Mini App.
- `Telegram.WebApp.enableVerticalSwipes()` — Re-enables default swipe-to-minimize behavior.
- `Telegram.WebApp.isVerticalSwipesEnabled` (`Boolean`).

---

## 4. Fullscreen Mode & Safe Area Insets (Bot API 8.0+)

Bot API 8.0 introduced true full-screen mode (`requestFullscreen()` / `exitFullscreen()`), hiding the top Telegram header bar and extending your WebView edge-to-edge across the entire device screen.

### Entering and Exiting Fullscreen
```ts
if (Telegram.WebApp.isVersionAtLeast("8.0")) {
  Telegram.WebApp.requestFullscreen();
}

Telegram.WebApp.onEvent("fullscreenChanged", () => {
  console.log("isFullscreen:", Telegram.WebApp.isFullscreen);
});

Telegram.WebApp.onEvent("fullscreenFailed", (event: { error: "UNSUPPORTED" | "ALREADY_FULLSCREEN" }) => {
  console.warn("Fullscreen failed:", event.error);
});
```

### Understanding `safeAreaInset` vs. `contentSafeAreaInset`
In Fullscreen Mode, your WebView renders behind **both** device hardware cutouts AND Telegram's floating close/minimize pill buttons:
1. **`Telegram.WebApp.safeAreaInset`** (`{ top, bottom, left, right }`):
   - **What it measures**: Device OS/hardware obstructions (status bar, Dynamic Island, camera notch, bottom home indicator bar).
   - **CSS Variables**:
     - `var(--tg-safe-area-inset-top, 0px)`
     - `var(--tg-safe-area-inset-bottom, 0px)`
     - `var(--tg-safe-area-inset-left, 0px)`
     - `var(--tg-safe-area-inset-right, 0px)`
2. **`Telegram.WebApp.contentSafeAreaInset`** (`{ top, bottom, left, right }`):
   - **What it measures**: Additional inner margin occupied by **Telegram's overlaid native UI controls** (e.g., the floating "Close / Minimize / Options" pills at the top of a fullscreen Mini App).
   - **CSS Variables**:
     - `var(--tg-content-safe-area-inset-top, 0px)`
     - `var(--tg-content-safe-area-inset-bottom, 0px)`
     - `var(--tg-content-safe-area-inset-left, 0px)`
     - `var(--tg-content-safe-area-inset-right, 0px)`

### Canonical Fullscreen Safe-Area CSS Recipe
Backgrounds should bleed all the way to `0px`, while interactive top headers and bottom toolbars must combine **both** insets:

```css
.app-fullscreen-shell {
  min-height: var(--tg-viewport-stable-height, 100vh);
  box-sizing: border-box;
  /* Add both hardware safe area AND Telegram floating controls safe area */
  padding-top: calc(
    var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px)
  );
  padding-bottom: calc(
    var(--tg-safe-area-inset-bottom, 0px) + var(--tg-content-safe-area-inset-bottom, 0px)
  );
  padding-left: calc(
    var(--tg-safe-area-inset-left, 0px) + var(--tg-content-safe-area-inset-left, 0px)
  );
  padding-right: calc(
    var(--tg-safe-area-inset-right, 0px) + var(--tg-content-safe-area-inset-right, 0px)
  );
}
```

---

## 5. Screen Orientation Locking (Bot API 8.0+)

Mini Apps can lock orientation to whatever orientation the device is currently in, or unlock it so the user can rotate between portrait and landscape:
- `Telegram.WebApp.isOrientationLocked` (`Boolean`)
- `Telegram.WebApp.lockOrientation()` — Locks screen to current orientation.
- `Telegram.WebApp.unlockOrientation()` — Allows free rotation between portrait and landscape.
