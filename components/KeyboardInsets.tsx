"use client";

import { useEffect } from "react";

/** Below this the "keyboard" is just browser chrome sliding in and out. */
const MIN_KEYBOARD = 120;

/**
 * Publishes how much of the screen the on-screen keyboard covers, so bottom sheets can sit on top of it.
 *
 *  --kb-inset  the height the keyboard covers (unset when it is closed)
 *  --vv-max    the tallest a sheet may be and still fit above it
 *
 * iOS Safari leaves the layout viewport alone when the keyboard opens, so a sheet pinned to the bottom
 * ends up underneath it. Android Chrome resizes the layout viewport instead (see `interactiveWidget`
 * in the root layout), where the covered height is already 0 and these stay unset.
 */
export default function KeyboardInsets() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;

    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      if (covered > MIN_KEYBOARD) {
        root.style.setProperty("--kb-inset", `${Math.round(covered)}px`);
        root.style.setProperty("--vv-max", `${Math.round(vv.height * 0.94)}px`);
      } else {
        root.style.removeProperty("--kb-inset");
        root.style.removeProperty("--vv-max");
      }
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.removeProperty("--kb-inset");
      root.style.removeProperty("--vv-max");
    };
  }, []);

  return null;
}
