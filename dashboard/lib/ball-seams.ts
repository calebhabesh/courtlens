// The spin of the brand mark's basketball: the seams turn clockwise in place inside the lens while
// the brand link is pointed at, and wind down to rest after. Coordinates are the mark's 32×32 viewBox.

/** The ball in the mark: centre and radius. */
export const BALL = { cx: 14, cy: 14, r: 8.4 } as const;

/**
 * The mark's seams: horizontal, vertical and the two curved seams across the top and bottom, fitted
 * to a regulation ball photographed face-on (the curves leave the rim 46° above and below the
 * horizontal seam and cross the vertical one 0.28 of the radius from the centre).
 */
export const REST_SEAM_PATH = "M5.6 14h16.8M14 5.6v16.8M8.16 7.96C11.52 12.83 16.48 12.83 19.84 7.96M8.16 20.04C11.52 15.17 16.48 15.17 19.84 20.04";

/** The seams look the same again every half turn (the two curved seams swap places). */
export const SEAM_PERIOD_DEG = 180;

/** The SVG transform that turns the seams `angleDeg` clockwise about the ball's centre. */
export function seamTransform(angleDeg: number): string {
  return `rotate(${Math.round((angleDeg % SEAM_PERIOD_DEG) * 100) / 100} ${BALL.cx} ${BALL.cy})`;
}

export interface SpinState {
  /** Turn of the ball, degrees, within one seam period. */
  angle: number;
  /** Degrees per second. */
  velocity: number;
}

/** Top speed (1.5 turns a second), how fast it gets there, and the gentlest stop. */
export const SPIN = { maxVelocity: 540, acceleration: 1080, deceleration: 1080, maxStopSeconds: 1.6 } as const;

/** One frame of spinning up toward top speed. */
export function spinUp(state: SpinState, dt: number): SpinState {
  const velocity = Math.min(SPIN.maxVelocity, state.velocity + SPIN.acceleration * dt);
  return { angle: (state.angle + velocity * dt) % SEAM_PERIOD_DEG, velocity };
}

export interface SpinStop {
  from: number;
  to: number;
  velocity: number;
  seconds: number;
}

/**
 * Plans the wind-down from `state`: the ball keeps turning the same way and comes to rest at the
 * next resting turn it can reach without stopping harder than `SPIN.deceleration`.
 */
export function planStop(state: SpinState): SpinStop | null {
  const { angle, velocity } = state;
  if (velocity <= 0 && angle % SEAM_PERIOD_DEG === 0) return null;
  const coast = (velocity * velocity) / (2 * SPIN.deceleration);
  const to = Math.ceil((angle + coast) / SEAM_PERIOD_DEG) * SEAM_PERIOD_DEG;
  const distance = to - angle;
  // A steady slowdown covers the distance in 2d/v; a slow flick that would crawl is capped.
  const seconds = velocity > 0 ? Math.min(SPIN.maxStopSeconds, (2 * distance) / velocity) : SPIN.maxStopSeconds;
  return { from: angle, to, velocity, seconds };
}

/**
 * The ball's state `elapsed` seconds into a stop: a cubic that leaves at the spin's speed and
 * arrives at rest, never turning back (its start slope is at most twice the average).
 */
export function stopAt(stop: SpinStop, elapsed: number): SpinState & { done: boolean } {
  const T = stop.seconds;
  if (elapsed >= T) return { angle: stop.to % SEAM_PERIOD_DEG, velocity: 0, done: true };
  const s = elapsed / T;
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2;
  const angle = h00 * stop.from + h10 * T * stop.velocity + h01 * stop.to;
  const slope = (6 * s ** 2 - 6 * s) * stop.from + (3 * s ** 2 - 4 * s + 1) * T * stop.velocity + (-6 * s ** 2 + 6 * s) * stop.to;
  return { angle, velocity: slope / T, done: false };
}
