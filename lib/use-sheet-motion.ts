"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import { cssTimeToMs } from "@/lib/spring-css";
import {
  isSettled,
  project,
  rubberband,
  SHEET_SPRING,
  SHEET_SPRING_REDUCED,
  stepSpring,
  type SpringState,
} from "@/lib/spring";

/**
 * iOS-style bottom sheet motion for a Radix dialog: one spring (damping 0.8, response 0.3)
 * drives opening, drag release, and dismissing, so every moment is interruptible.
 *
 *  - Opens by springing up from below the screen.
 *  - Follows the finger 1:1 from where it was grabbed; pulling past the top rubber-bands.
 *  - On release, projects where the flick is heading to choose dismiss vs. return, then hands
 *    the finger's velocity to the spring so there is no seam between dragging and animating.
 *  - Escape, backdrop tap and the close button run the same spring, re-targeting from the
 *    sheet's live position and velocity.
 *  - Touching a moving sheet grabs it. Mid-dismiss, that reverses it.
 *
 * Touch events (not pointer events) so the browser can't claim the gesture for scrolling
 * once we've decided to drag; mouse is handled with pointer events + capture.
 */

/**
 * The sheet is pinned to the bottom edge, so a bouncy spring or a rubber-band pull would open a
 * gap beneath it. The sheet is extended this far below the screen to cover that excursion;
 * the rubber-band is also capped to it.
 */
export const SHEET_EXTENSION = 96;
/** Movement before a touch commits to dragging (vs. tapping or scrolling). */
const HYSTERESIS = 10;
const VELOCITY_WINDOW_MS = 100;
const NO_DRAG = "input, textarea, select, [contenteditable], [data-no-drag]";

type Options = {
  /** Checked when the sheet mounts, so a dialog can be a sheet on phones only. */
  enabled: () => boolean;
  /** Called once the sheet has finished leaving the screen: close it for real. */
  onClosed: () => void;
};

type Controller = {
  active: boolean;
  dismiss: () => void;
  destroy: () => void;
};

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

function createController(el: HTMLElement, latest: { current: Options }): Controller {
  if (!latest.current.enabled()) {
    return { active: false, dismiss: () => latest.current.onClosed(), destroy: () => {} };
  }

  // Radix renders each overlay immediately before its content.
  const prev = el.previousElementSibling;
  const overlay = prev instanceof HTMLElement && prev.dataset.slot?.endsWith("overlay") ? prev : null;

  // Remember the stylesheet's values once, so re-attaching (React strict mode) can't stack the extension.
  const computed = getComputedStyle(el);
  el.dataset.sheetPadding ??= computed.paddingBottom;
  el.dataset.sheetMaxHeight ??= computed.maxHeight;
  el.style.bottom = `-${SHEET_EXTENSION}px`;
  el.style.paddingBottom = `calc(${el.dataset.sheetPadding} + ${SHEET_EXTENSION}px)`;
  // --vv-max (set while a keyboard is open) keeps the sheet inside the part of the screen still visible.
  if (el.dataset.sheetMaxHeight !== "none") {
    el.style.maxHeight = `calc(min(${el.dataset.sheetMaxHeight}, var(--vv-max, ${el.dataset.sheetMaxHeight})) + ${SHEET_EXTENSION}px)`;
  }
  // The dialog's duration-200 / duration-300 classes make every property transition (the
  // default transition-property is `all`). Left on, each per-frame transform write would be
  // smoothed by a hidden CSS transition, so the sheet would lag the finger and keep sliding
  // after being grabbed. The spring owns this motion; nothing else may animate it.
  el.style.transition = "none";

  const state: SpringState = { x: 0, v: 0 };
  let target = 0;
  let raf = 0;
  let last = 0;
  let mode: "idle" | "pending" | "drag" | "ignore" = "idle";
  let closing = false;
  let fadeTimer: ReturnType<typeof setTimeout> | undefined;
  let startX = 0;
  let startY = 0;
  let originY = 0;
  let history: Array<{ y: number; t: number }> = [];

  const height = () => el.offsetHeight;

  function apply() {
    el.style.transform = state.x === 0 ? "" : `translate3d(0, ${state.x}px, 0)`;
    if (overlay) overlay.style.opacity = state.x <= 0 ? "" : String(1 - clamp01(state.x / height()));
  }

  function tick(now: number) {
    const dt = Math.min(Math.max((now - last) / 1000, 0), 1 / 20);
    last = now;
    stepSpring(state, target, dt, reducedMotion() ? SHEET_SPRING_REDUCED : SHEET_SPRING);
    if (isSettled(state, target)) {
      state.x = target;
      state.v = 0;
      raf = 0;
      apply();
      if (target > 0) close();
      return;
    }
    apply();
    raf = requestAnimationFrame(tick);
  }

  /** Aim the spring somewhere new. Without a velocity it keeps the one it already has. */
  function run(to: number, velocity?: number) {
    target = to;
    if (velocity !== undefined) state.v = velocity;
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  /** The sheet is already off screen (or faded out): close it without a second exit animation. */
  function close() {
    el.dataset.sheetExited = "";
    latest.current.onClosed();
  }

  function dismiss(velocity?: number) {
    if (closing || mode === "drag") return;
    closing = true;
    if (reducedMotion()) {
      // No travel: fade in place, then close.
      const settleMs = cssTimeToMs(getComputedStyle(el).getPropertyValue("--spring-fast-duration")) || 0;
      el.style.transition = "opacity var(--spring-fast-duration) var(--spring-fast)";
      el.style.opacity = "0";
      fadeTimer = setTimeout(close, settleMs);
      return;
    }
    run(height(), velocity);
  }

  /** Take over from whatever is moving the sheet, from exactly where it is on screen now. */
  function grab(y: number) {
    cancelAnimationFrame(raf);
    raf = 0;
    clearTimeout(fadeTimer);
    el.style.transition = "none";
    el.style.opacity = "";
    closing = false;
    originY = y - state.x;
    state.v = 0;
    mode = "drag";
    el.style.userSelect = "none";
  }

  function begin(x: number, y: number, t: number, targetEl: Element) {
    // Already leaving because the parent closed it; there is nothing to catch.
    if (el.dataset.state === "closed") return;
    history = [{ y, t }];

    if (raf || closing) {
      grab(y); // caught mid-flight: follow the finger from the live position
      return;
    }
    if (targetEl.closest(NO_DRAG)) {
      mode = "ignore";
      return;
    }
    for (let n: Element | null = targetEl; n && n !== el.parentElement; n = n.parentElement) {
      if (n.scrollTop > 0) {
        mode = "ignore"; // let scrolled content scroll back to the top first
        return;
      }
    }
    startX = x;
    startY = y;
    mode = "pending";
  }

  /** Returns true while the sheet is being dragged (the caller then blocks native scrolling). */
  function move(x: number, y: number, t: number) {
    if (mode === "pending") {
      const dx = x - startX;
      const dy = y - startY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < HYSTERESIS) return false;
      const scrollable = el.scrollHeight > el.clientHeight + 1;
      // Sideways, or upward on content that can scroll: not ours.
      if (Math.abs(dy) <= Math.abs(dx) || (dy < 0 && scrollable)) {
        mode = "ignore";
        return false;
      }
      grab(y);
    }
    if (mode !== "drag") return false;

    const raw = y - originY;
    // Past the top the sheet follows less and less, and never further than the extension.
    state.x = raw >= 0 ? raw : -rubberband(-raw, SHEET_EXTENSION);
    apply();
    history.push({ y, t });
    while (history.length > 2 && t - history[0]!.t > VELOCITY_WINDOW_MS) history.shift();
    return true;
  }

  function end(t: number, cancelled: boolean) {
    const wasDragging = mode === "drag";
    mode = "idle";
    el.style.userSelect = "";
    if (!wasDragging) return;

    const first = history[0]!;
    const lastPoint = history.at(-1)!;
    const stale = t - lastPoint.t > VELOCITY_WINDOW_MS; // finger stopped before lifting
    let velocity = cancelled || stale || lastPoint.t === first.t ? 0 : ((lastPoint.y - first.y) / (lastPoint.t - first.t)) * 1000;
    // Released while rubber-banded: the sheet itself is barely moving, and carrying an upward
    // finger speed would throw it past the extension.
    if (state.x <= 0) velocity = 0;

    // Decide from where the flick is heading, not from where the finger let go.
    if (state.x + project(velocity) > height() / 2) dismiss(Math.max(velocity, 0));
    else run(0, velocity);
  }

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0]!;
    begin(touch.clientX, touch.clientY, e.timeStamp, e.target as Element);
  };
  const onTouchMove = (e: TouchEvent) => {
    const touch = e.touches[0];
    if (touch && move(touch.clientX, touch.clientY, e.timeStamp)) e.preventDefault();
  };
  const onTouchEnd = (e: TouchEvent) => end(e.timeStamp, e.type === "touchcancel");

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button === 0) begin(e.clientX, e.clientY, e.timeStamp, e.target as Element);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || mode === "idle") return;
    const wasDragging = mode === "drag";
    if (move(e.clientX, e.clientY, e.timeStamp) && !wasDragging) el.setPointerCapture(e.pointerId);
  };
  const onPointerEnd = (e: PointerEvent) => {
    if (e.pointerType === "mouse") end(e.timeStamp, e.type === "pointercancel");
  };

  el.addEventListener("touchstart", onTouchStart, { passive: true });
  el.addEventListener("touchmove", onTouchMove, { passive: false });
  el.addEventListener("touchend", onTouchEnd);
  el.addEventListener("touchcancel", onTouchEnd);
  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerEnd);
  el.addEventListener("pointercancel", onPointerEnd);

  // Open by springing up from below. (With reduced motion the CSS fade-in does the opening.)
  if (!reducedMotion()) {
    el.dataset.sheet = "driven"; // switches off the CSS enter animation (globals.css)
    state.x = height();
    apply();
    run(0, 0);
  }

  return {
    active: true,
    dismiss: () => dismiss(),
    destroy() {
      cancelAnimationFrame(raf);
      clearTimeout(fadeTimer);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerEnd);
      el.removeEventListener("pointercancel", onPointerEnd);
    },
  };
}

export function useSheetMotion(options: Options) {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  const controller = useRef<Controller | null>(null);

  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const c = createController(el, latest);
    controller.current = c;
    return () => {
      c.destroy();
      if (controller.current === c) controller.current = null;
    };
  }, []);

  /** Animate the sheet away along the spring, then close it. Falls back to closing at once. */
  const dismiss = useCallback(() => {
    const c = controller.current;
    if (c) c.dismiss();
    else latest.current.onClosed();
  }, []);

  /** True when this content is behaving as a sheet (so Escape/backdrop/close should animate). */
  const isSheet = useCallback(() => controller.current?.active === true, []);

  return { ref, dismiss, isSheet };
}
