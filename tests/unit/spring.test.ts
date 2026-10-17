import { describe, expect, it } from "vitest";
import {
  isSettled,
  project,
  rubberband,
  SHEET_SPRING,
  SHEET_SPRING_REDUCED,
  stepSpring,
  type SpringParams,
  type SpringState,
} from "@/lib/spring";

/** Run a spring at 60fps and record every frame. */
function simulate(from: number, to: number, params: SpringParams, v = 0, seconds = 2) {
  const s: SpringState = { x: from, v };
  const frames = [s.x];
  for (let t = 0; t < seconds; t += 1 / 60) {
    stepSpring(s, to, 1 / 60, params);
    frames.push(s.x);
  }
  return frames;
}

describe("project", () => {
  it("throws further the faster the flick, in the flick's direction", () => {
    expect(project(1000)).toBeCloseTo(499, 0);
    expect(project(-1000)).toBeCloseTo(-499, 0);
    expect(project(0)).toBe(0);
  });
});

describe("rubberband", () => {
  it("follows less the further past the edge, and never past its dimension", () => {
    expect(rubberband(100, 600)).toBeLessThan(100);
    expect(rubberband(400, 600) - rubberband(300, 600)).toBeLessThan(rubberband(100, 600));
    expect(rubberband(10_000, 96)).toBeLessThan(96);
  });
});

describe("the sheet spring (damping 0.8, response 0.3)", () => {
  it("is Apple's drawer spring", () => {
    expect(SHEET_SPRING).toEqual({ damping: 0.8, response: 0.3 });
  });

  it("overshoots by the textbook amount, then settles", () => {
    const frames = simulate(0, 300, SHEET_SPRING);
    const peak = Math.max(...frames);
    // overshoot fraction = exp(-pi * zeta / sqrt(1 - zeta^2)) ≈ 1.5% of the 300px travel
    expect(peak - 300).toBeGreaterThan(3);
    expect(peak - 300).toBeLessThan(6);
    expect(Math.abs(frames.at(-1)! - 300)).toBeLessThan(0.3);
  });

  it("approaches in about its response time", () => {
    const frames = simulate(0, 300, SHEET_SPRING);
    const framesTo90 = frames.findIndex((x) => x >= 270);
    expect(framesTo90 / 60).toBeGreaterThan(0.1);
    expect(framesTo90 / 60).toBeLessThan(0.3);
  });

  it("does not bounce when critically damped (reduced motion), and is quicker", () => {
    const calm = simulate(0, 300, SHEET_SPRING_REDUCED);
    expect(Math.max(...calm)).toBeLessThanOrEqual(300.001);
    const bouncy = simulate(0, 300, SHEET_SPRING);
    expect(calm.findIndex((x) => x >= 270)).toBeLessThan(bouncy.findIndex((x) => x >= 270));
  });

  it("gives the same answer whatever the frame rate", () => {
    const a: SpringState = { x: 0, v: 0 };
    const b: SpringState = { x: 0, v: 0 };
    for (let i = 0; i < 24; i++) stepSpring(a, 300, 1 / 120, SHEET_SPRING); // 0.2s at 120fps
    for (let i = 0; i < 6; i++) stepSpring(b, 300, 1 / 30, SHEET_SPRING); // 0.2s at 30fps
    expect(Math.abs(a.x - b.x)).toBeLessThan(1e-6);
    expect(Math.abs(a.v - b.v)).toBeLessThan(1e-6);
  });
});

describe("interruption", () => {
  it("re-targeting carries velocity: no jump in position, speed not reset", () => {
    const s: SpringState = { x: 0, v: 0 };
    for (let i = 0; i < 6; i++) stepSpring(s, 400, 1 / 60, SHEET_SPRING); // closing toward 400...
    const before = { ...s };
    expect(Math.abs(before.v)).toBeGreaterThan(300);

    stepSpring(s, 0, 0, SHEET_SPRING); // ...re-aimed at 0: no time has passed, nothing changes
    expect(s).toEqual(before);

    stepSpring(s, 0, 1e-3, SHEET_SPRING); // a millisecond later
    expect(Math.abs(s.x - before.x)).toBeLessThan(Math.abs(before.v) * 1e-3 + 0.01); // continuous
    expect(Math.abs(s.v)).toBeGreaterThan(Math.abs(before.v) * 0.5); // still moving, not restarted from rest
  });

  it("a flick hands its velocity to the spring", () => {
    const still: SpringState = { x: 0, v: 0 };
    const flicked: SpringState = { x: 0, v: 2000 };
    for (let i = 0; i < 3; i++) {
      stepSpring(still, 300, 1 / 60, SHEET_SPRING);
      stepSpring(flicked, 300, 1 / 60, SHEET_SPRING);
    }
    expect(flicked.x).toBeGreaterThan(still.x);
  });

  it("a sheet released mid-pull against the top comes back without leaving the extension", () => {
    // rubber-banded 80px above rest, released at rest: must never go further up than it started
    const frames = simulate(-80, 0, SHEET_SPRING);
    expect(Math.min(...frames)).toBeGreaterThanOrEqual(-80);
    expect(Math.abs(frames.at(-1)!)).toBeLessThan(0.3);
  });
});

describe("isSettled", () => {
  it("needs both position and speed to be near rest", () => {
    expect(isSettled({ x: 100.1, v: 2 }, 100)).toBe(true);
    expect(isSettled({ x: 100.1, v: 200 }, 100)).toBe(false);
    expect(isSettled({ x: 130, v: 0 }, 100)).toBe(false);
  });
});
