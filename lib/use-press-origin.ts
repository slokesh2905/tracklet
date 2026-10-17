"use client";

import { useCallback } from "react";

/** Where the user last pressed, so a dialog can grow out of the control that opened it. */
let lastPress: { x: number; y: number } | null = null;

if (typeof window !== "undefined") {
  window.addEventListener(
    "pointerdown",
    (e) => {
      lastPress = { x: e.clientX, y: e.clientY };
    },
    { capture: true, passive: true }
  );
  // Keyboard-opened dialogs have no meaningful press point; fall back to the centre.
  window.addEventListener("keydown", () => (lastPress = null), { capture: true, passive: true });
}

/** Ref callback: anchors the element's transform-origin to the last press (desktop layout only). */
export function useTransformOriginFromPress(enabled: () => boolean) {
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el || !lastPress || !enabled()) return;
      const rect = el.getBoundingClientRect();
      // Clamp so a far-away press origin can't make the dialog swing wildly.
      const x = Math.min(Math.max(lastPress.x - rect.left, -rect.width), rect.width * 2);
      const y = Math.min(Math.max(lastPress.y - rect.top, -rect.height), rect.height * 2);
      el.style.transformOrigin = `${x}px ${y}px`;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `enabled` is a stable module-level function
    []
  );
}
