"use client";

import { useEffect } from "react";

/**
 * Press feedback on pointer-DOWN for every button, link and card, never on release.
 *
 * This sets `data-pressed` on whatever the user presses and clears it on release, cancel,
 * or when the pointer drags away (and re-applies it if they drag back). The look lives in
 * globals.css. JS rather than `:active` because iOS Safari doesn't apply `:active` on touch
 * reliably, and `:active` can't express "dragged away, then back".
 *
 * Opt out with data-press="off"; show a background highlight instead of a scale with
 * data-press="highlight" (list rows); scale an ancestor instead (a stretched card link) with
 * data-press-delegate="<selector>".
 */
const PRESSABLE = 'a[href], button, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], summary, [data-press]';
/** Menu rows and options highlight on their own; scaling them would fight the menu. */
const SELF_HIGHLIGHTING = '[role^="menuitem"], [role="option"]';
const DISABLED = ':disabled, [aria-disabled="true"], [data-press="off"]';
/** Hit padding around the target, and the movement after which a touch is a drag, not a press. */
const SLOP = 10;

type Mode = "scale" | "fade" | "highlight";

type Press = {
  el: HTMLElement;
  visual: HTMLElement;
  mode: Mode;
  pointerId: number;
  x: number;
  y: number;
  touch: boolean;
  /** A touch that travelled past SLOP is scrolling or dragging something, so it can't press. */
  dragged: boolean;
  inside: boolean;
};

type PressInit = Pick<Press, "pointerId" | "x" | "y" | "touch">;

function resolve(target: EventTarget | null): { el: HTMLElement; visual: HTMLElement; mode: Mode } | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>(PRESSABLE);
  if (!el || el.matches(DISABLED) || el.matches(SELF_HIGHLIGHTING)) return null;

  const delegate = el.dataset.pressDelegate;
  const visual = (delegate ? el.closest<HTMLElement>(delegate) : null) ?? el;
  // Transforms don't apply to inline boxes (a link inside a sentence), so those dim instead.
  const mode: Mode =
    el.dataset.press === "highlight" ? "highlight" : getComputedStyle(visual).display === "inline" ? "fade" : "scale";
  return { el, visual, mode };
}

function within(rect: DOMRect, x: number, y: number) {
  return x >= rect.left - SLOP && x <= rect.right + SLOP && y >= rect.top - SLOP && y <= rect.bottom + SLOP;
}

export default function PressFeedback() {
  useEffect(() => {
    let press: Press | null = null;

    const show = (on: boolean) => {
      if (!press) return;
      if (on) press.visual.setAttribute("data-pressed", press.mode);
      else press.visual.removeAttribute("data-pressed");
    };

    function end() {
      show(false);
      press = null;
    }

    function begin(target: EventTarget | null, init: PressInit) {
      end();
      const hit = resolve(target);
      if (!hit) return;
      press = { ...hit, ...init, dragged: false, inside: true };
      show(true);
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      begin(e.target, { pointerId: e.pointerId, x: e.clientX, y: e.clientY, touch: e.pointerType !== "mouse" });
    };

    const onMove = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.pointerId || press.dragged) return;
      if (press.touch && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) {
        press.dragged = true;
        show(false);
        return;
      }
      // Dragging off cancels the press; dragging back onto the target resumes it.
      const inside = within(press.visual.getBoundingClientRect(), e.clientX, e.clientY);
      if (inside !== press.inside) {
        press.inside = inside;
        show(inside);
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.pointerId) return;
      const { el, inside, dragged, x, y } = press;
      end();
      // The press shrinks the target, so a release in its outer few pixels can land just outside
      // and lose the click. If the user never left the target, deliver it. A mouse that travelled
      // was dragging something (a swipe row moves with it), not tapping.
      const missed = e.target instanceof Node && !el.contains(e.target) && !resolve(e.target);
      const still = Math.hypot(e.clientX - x, e.clientY - y) <= SLOP;
      if (e.type === "pointerup" && inside && !dragged && still && missed && el.isConnected) el.click();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || press) return;
      const activates = e.key === "Enter" || (e.key === " " && !(e.target instanceof HTMLAnchorElement));
      if (activates) begin(e.target, { pointerId: -1, x: 0, y: 0, touch: false });
    };
    const onKeyUp = () => {
      if (press?.pointerId === -1) end();
    };

    const opts = { capture: true, passive: true } as const;
    document.addEventListener("pointerdown", onDown, opts);
    document.addEventListener("pointermove", onMove, opts);
    document.addEventListener("pointerup", onUp, opts);
    document.addEventListener("pointercancel", onUp, opts);
    document.addEventListener("keydown", onKeyDown, opts);
    document.addEventListener("keyup", onKeyUp, opts);
    document.addEventListener("dragstart", end, opts);
    document.addEventListener("contextmenu", end, opts);
    window.addEventListener("blur", end);
    document.documentElement.dataset.pressReady = "";

    return () => {
      end();
      document.removeEventListener("pointerdown", onDown, opts);
      document.removeEventListener("pointermove", onMove, opts);
      document.removeEventListener("pointerup", onUp, opts);
      document.removeEventListener("pointercancel", onUp, opts);
      document.removeEventListener("keydown", onKeyDown, opts);
      document.removeEventListener("keyup", onKeyUp, opts);
      document.removeEventListener("dragstart", end, opts);
      document.removeEventListener("contextmenu", end, opts);
      window.removeEventListener("blur", end);
      delete document.documentElement.dataset.pressReady;
    };
  }, []);

  return null;
}
