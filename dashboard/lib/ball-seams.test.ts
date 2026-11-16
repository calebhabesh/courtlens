import { describe, expect, it } from "vitest";
import { planStop, seamTransform, SEAM_PERIOD_DEG, SPIN, spinUp, stopAt, type SpinState } from "./ball-seams";

describe("seamTransform", () => {
  it("turns the seams clockwise about the ball's centre, the same again every half turn", () => {
    expect(seamTransform(30)).toBe("rotate(30 14 14)");
    expect(seamTransform(210)).toBe(seamTransform(30));
  });
});

describe("spin", () => {
  it("speeds up to the top speed and holds it", () => {
    let state: SpinState = { angle: 0, velocity: 0 };
    for (let i = 0; i < 120; i++) state = spinUp(state, 1 / 60);
    expect(state.velocity).toBe(SPIN.maxVelocity);
    expect(state.angle).toBeGreaterThanOrEqual(0);
    expect(state.angle).toBeLessThan(SEAM_PERIOD_DEG);
  });

  it("winds down forward to the next resting turn, from its current speed, without turning back", () => {
    for (const start of [{ angle: 10, velocity: 540 }, { angle: 170, velocity: 540 }, { angle: 100, velocity: 30 }, { angle: 90, velocity: 0 }]) {
      const stop = planStop(start)!;
      expect(stop.to % SEAM_PERIOD_DEG).toBe(0);
      expect(stop.to).toBeGreaterThan(start.angle);
      expect(stop.seconds).toBeLessThanOrEqual(SPIN.maxStopSeconds);
      expect(stopAt(stop, 0).velocity).toBeCloseTo(start.velocity, 6);
      let previous = start.angle;
      for (let t = 0; t <= stop.seconds; t += 1 / 120) {
        const { angle } = stopAt(stop, t);
        expect(angle).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = angle;
      }
      expect(stopAt(stop, stop.seconds)).toEqual({ angle: 0, velocity: 0, done: true });
    }
  });

  it("needs no wind-down when it is already at rest", () => {
    expect(planStop({ angle: 0, velocity: 0 })).toBeNull();
  });
});
