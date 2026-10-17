/**
 * Gesture physics from Apple's "Designing Fluid Interfaces" (WWDC 2018).
 * Springs are described by damping ratio + response (seconds), not mass/stiffness, and are
 * integrated per frame so position AND velocity are always known. That is what makes a
 * motion interruptible: grab it, or give it a new target, and it carries on from the live
 * (x, v) instead of snapping to a start value or losing its speed.
 */

/** Where a flick would come to rest, using UIScrollView's deceleration curve. */
export function project(velocity: number, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary: the further you pull, the less it follows. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

export type SpringParams = {
  /** 1 = critically damped (no overshoot); below 1 overshoots and oscillates. */
  damping: number;
  /** Seconds to approach the target. Not a duration: settle time emerges from the parameters. */
  response: number;
};

/** What Apple ships for a drawer / sheet. */
export const SHEET_SPRING: SpringParams = { damping: 0.8, response: 0.3 };
/** Reduced motion keeps the physics honest but drops the bounce and hurries up. */
export const SHEET_SPRING_REDUCED: SpringParams = { damping: 1, response: 0.15 };

export type SpringState = { x: number; v: number };

/**
 * Advance `state` by `dt` seconds toward `target`, using the exact solution of the damped
 * spring rather than numerical integration. Integrators add their own damping (explicit Euler
 * quietly turned a 0.8 spring into ~0.83), and exactness makes the result independent of the
 * frame rate. Damping at or above 1 is treated as critically damped.
 */
export function stepSpring(state: SpringState, target: number, dt: number, { damping, response }: SpringParams) {
  if (dt <= 0) return;
  const omega = (2 * Math.PI) / response;
  const a = state.x - target;
  const v0 = state.v;

  if (damping >= 1) {
    const c = v0 + omega * a;
    const decay = Math.exp(-omega * dt);
    state.x = target + (a + c * dt) * decay;
    state.v = (c - omega * (a + c * dt)) * decay;
    return;
  }

  const zw = damping * omega;
  const wd = omega * Math.sqrt(1 - damping * damping);
  const b = (v0 + zw * a) / wd;
  const decay = Math.exp(-zw * dt);
  const cos = Math.cos(wd * dt);
  const sin = Math.sin(wd * dt);
  state.x = target + decay * (a * cos + b * sin);
  state.v = decay * ((b * wd - zw * a) * cos - (a * wd + zw * b) * sin);
}

/** Close enough to the target, and slow enough, that the eye reads it as at rest. */
export function isSettled({ x, v }: SpringState, target: number) {
  return Math.abs(x - target) < 0.3 && Math.abs(v) < 8;
}
