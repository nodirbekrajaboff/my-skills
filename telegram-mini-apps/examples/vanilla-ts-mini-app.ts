/**
 * Complete Vanilla TypeScript Telegram Mini App Lifecycle & API Client
 * Assumes `<script src="https://telegram.org/js/telegram-web-app.js"></script>` in `<head>`
 */

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: any;
    };
  }
}

export class MiniAppController {
  public readonly webapp = window.Telegram?.WebApp;

  public init(options: { fullscreen?: boolean; disableVerticalSwipes?: boolean } = {}): void {
    if (!this.webapp) {
      console.warn("Telegram.WebApp is not available. Running outside Telegram client.");
      return;
    }

    // 1. Dismiss Telegram's loading spinner immediately
    this.webapp.ready();

    // 2. Expand bottom sheet to full height
    if (!this.webapp.isExpanded) {
      this.webapp.expand();
    }

    // 3. Optionally disable vertical swipe-to-close (Bot API 7.7+)
    if (options.disableVerticalSwipes && this.webapp.isVersionAtLeast("7.7")) {
      this.webapp.disableVerticalSwipes();
    }

    // 4. Optionally request Fullscreen Mode (Bot API 8.0+)
    if (options.fullscreen && this.webapp.isVersionAtLeast("8.0")) {
      this.webapp.requestFullscreen();
    }

    // 5. Sync theme colors with Telegram native chrome
    const bgColor = this.webapp.themeParams?.bg_color || "#ffffff";
    this.webapp.setHeaderColor("bg_color");
    this.webapp.setBackgroundColor(bgColor);
    if (this.webapp.isVersionAtLeast("7.8")) {
      this.webapp.setBottomBarColor("bottom_bar_bg_color");
    }
  }

  /**
   * Computes combined device hardware + Telegram floating UI safe area insets
   */
  public getCombinedSafeAreaInsets(): SafeAreaInsets {
    const hw: SafeAreaInsets = this.webapp?.safeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 };
    const ui: SafeAreaInsets = this.webapp?.contentSafeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 };
    return {
      top: hw.top + ui.top,
      bottom: hw.bottom + ui.bottom,
      left: hw.left + ui.left,
      right: hw.right + ui.right,
    };
  }

  /**
   * Sends an authenticated HTTP request to your backend with raw `initData`
   */
  public async apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    if (this.webapp?.initData) {
      headers.set("Authorization", `tma ${this.webapp.initData}`);
    }

    const res = await fetch(path, { ...init, headers });
    if (!res.ok) {
      this.webapp?.HapticFeedback?.notificationOccurred("error");
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  /**
   * Configures the primary bottom action button with safe cleanup
   */
  public bindMainButton(
    text: string,
    onClick: () => Promise<void> | void,
    options?: { hasShineEffect?: boolean; iconCustomEmojiId?: string }
  ): () => void {
    const mainButton = this.webapp?.MainButton;
    if (!mainButton) return () => {};

    const handler = async () => {
      this.webapp?.HapticFeedback?.impactOccurred("light");
      mainButton.showProgress(false);
      try {
        await onClick();
      } finally {
        mainButton.hideProgress();
      }
    };

    mainButton.setParams({
      text,
      is_visible: true,
      is_active: true,
      has_shine_effect: options?.hasShineEffect ?? false,
      ...(options?.iconCustomEmojiId && this.webapp.isVersionAtLeast("9.5")
        ? { icon_custom_emoji_id: options.iconCustomEmojiId }
        : {}),
    });

    mainButton.onClick(handler);

    return () => {
      mainButton.offClick(handler);
      mainButton.hide();
    };
  }
}
