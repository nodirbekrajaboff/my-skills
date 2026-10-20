/**
 * Zero-Dependency React Provider & Hooks for Telegram Mini Apps
 * Includes proper event listener cleanup to prevent duplicate handler execution.
 */

import React, { createContext, useContext, useEffect, useState } from "react";

interface SafeArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface TelegramMiniAppContextValue {
  webApp: any | null;
  colorScheme: "light" | "dark";
  isFullscreen: boolean;
  viewportStableHeight: number;
  combinedSafeArea: SafeArea;
}

const TelegramMiniAppContext = createContext<TelegramMiniAppContextValue>({
  webApp: null,
  colorScheme: "light",
  isFullscreen: false,
  viewportStableHeight: typeof window !== "undefined" ? window.innerHeight : 800,
  combinedSafeArea: { top: 0, bottom: 0, left: 0, right: 0 },
});

function readCombinedSafeArea(tg: any): SafeArea {
  const s = tg?.safeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const c = tg?.contentSafeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 };
  return {
    top: s.top + c.top,
    bottom: s.bottom + c.bottom,
    left: s.left + c.left,
    right: s.right + c.right,
  };
}

export const TelegramMiniAppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const tg = typeof window !== "undefined" ? (window as any).Telegram?.WebApp ?? null : null;

  const [colorScheme, setColorScheme] = useState<"light" | "dark">(tg?.colorScheme ?? "light");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(Boolean(tg?.isFullscreen));
  const [viewportStableHeight, setViewportStableHeight] = useState<number>(
    tg?.viewportStableHeight ?? (typeof window !== "undefined" ? window.innerHeight : 800)
  );
  const [combinedSafeArea, setCombinedSafeArea] = useState<SafeArea>(() => readCombinedSafeArea(tg));

  useEffect(() => {
    if (!tg) return;

    tg.ready();
    tg.expand();

    const handleThemeChanged = () => setColorScheme(tg.colorScheme);
    const handleViewportChanged = (e?: { isStateStable?: boolean }) => {
      if (e?.isStateStable) {
        setViewportStableHeight(tg.viewportStableHeight);
      }
    };
    const handleSafeAreaChanged = () => setCombinedSafeArea(readCombinedSafeArea(tg));
    const handleFullscreenChanged = () => setIsFullscreen(Boolean(tg.isFullscreen));

    tg.onEvent("themeChanged", handleThemeChanged);
    tg.onEvent("viewportChanged", handleViewportChanged);
    tg.onEvent("safeAreaChanged", handleSafeAreaChanged);
    tg.onEvent("contentSafeAreaChanged", handleSafeAreaChanged);
    tg.onEvent("fullscreenChanged", handleFullscreenChanged);

    return () => {
      tg.offEvent("themeChanged", handleThemeChanged);
      tg.offEvent("viewportChanged", handleViewportChanged);
      tg.offEvent("safeAreaChanged", handleSafeAreaChanged);
      tg.offEvent("contentSafeAreaChanged", handleSafeAreaChanged);
      tg.offEvent("fullscreenChanged", handleFullscreenChanged);
    };
  }, [tg]);

  return (
    <TelegramMiniAppContext.Provider
      value={{ webApp: tg, colorScheme, isFullscreen, viewportStableHeight, combinedSafeArea }}
    >
      {children}
    </TelegramMiniAppContext.Provider>
  );
};

export function useTelegramWebApp() {
  return useContext(TelegramMiniAppContext);
}

/**
 * Declarative hook for managing Telegram.WebApp.MainButton in React screens
 */
export function useMainButton(
  text: string,
  onClick: () => void | Promise<void>,
  options: { isVisible?: boolean; isActive?: boolean; hasShineEffect?: boolean } = {}
) {
  const { webApp } = useTelegramWebApp();
  const { isVisible = true, isActive = true, hasShineEffect = false } = options;

  useEffect(() => {
    const mainBtn = webApp?.MainButton;
    if (!mainBtn || !isVisible) {
      mainBtn?.hide();
      return;
    }

    mainBtn.setParams({
      text,
      is_visible: true,
      is_active: isActive,
      has_shine_effect: hasShineEffect,
    });

    const handleClick = async () => {
      webApp.HapticFeedback?.impactOccurred("light");
      mainBtn.showProgress(false);
      try {
        await onClick();
      } finally {
        mainBtn.hideProgress();
      }
    };

    mainBtn.onClick(handleClick);
    return () => {
      mainBtn.offClick(handleClick);
      mainBtn.hide();
    };
  }, [webApp, text, onClick, isVisible, isActive, hasShineEffect]);
}

/**
 * Declarative hook for showing Telegram.WebApp.BackButton on nested routes
 */
export function useBackButton(onBack: () => void, enabled = true) {
  const { webApp } = useTelegramWebApp();

  useEffect(() => {
    const backBtn = webApp?.BackButton;
    if (!backBtn || !enabled) {
      backBtn?.hide();
      return;
    }

    backBtn.show();
    backBtn.onClick(onBack);

    return () => {
      backBtn.offClick(onBack);
      backBtn.hide();
    };
  }, [webApp, onBack, enabled]);
}
