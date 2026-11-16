"use client";

import { useEffect, useRef } from "react";
import { planStop, REST_SEAM_PATH, seamTransform, spinUp, stopAt, type SpinState, type SpinStop } from "@/lib/ball-seams";
import { BrandMark } from "./brand-mark";

/**
 * The header and footer mark: pointing at (or focusing) the brand link spins the ball clockwise in
 * place inside the lens, speeding up to a steady spin; leaving lets it wind down and stop with the
 * seams back where they rest. Reduced motion keeps it still; touch never starts it.
 */
export function SpinningBrandMark({ size = 24 }: { size?: number }) {
  const markRef = useRef<HTMLSpanElement>(null);
  const seamsRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const seams = seamsRef.current;
    const trigger = markRef.current?.closest("a");
    if (!seams || !trigger) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let state: SpinState = { angle: 0, velocity: 0 };
    let mode: "idle" | "spinning" | "stopping" = "idle";
    let stop: SpinStop | null = null;
    let stopStarted = 0;
    let frame = 0;
    let last = 0;

    const draw = () => {
      if (mode === "idle") seams.removeAttribute("transform");
      else seams.setAttribute("transform", seamTransform(state.angle));
    };

    const tick = (now: number) => {
      // A background tab or long frame never jumps the ball more than 50 ms of travel.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (mode === "spinning") state = spinUp(state, dt);
      else if (mode === "stopping" && stop) {
        const next = stopAt(stop, (now - stopStarted) / 1000);
        state = { angle: next.angle, velocity: next.velocity };
        if (next.done) {
          mode = "idle";
          state = { angle: 0, velocity: 0 };
        }
      }
      draw();
      frame = mode === "idle" ? 0 : requestAnimationFrame(tick);
    };

    const run = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (reduceMotion.matches) return;
      // Pointing again while it winds down picks the spin up from its current speed.
      mode = "spinning";
      stop = null;
      run();
    };

    const release = () => {
      if (mode !== "spinning") return;
      stop = planStop(state);
      if (!stop) {
        mode = "idle";
        draw();
        return;
      }
      mode = "stopping";
      stopStarted = performance.now();
      run();
    };

    const onPointerEnter = (event: PointerEvent) => { if (event.pointerType !== "touch") start(); };
    const onFocus = () => { if (trigger.matches(":focus-visible")) start(); };
    trigger.addEventListener("pointerenter", onPointerEnter);
    trigger.addEventListener("pointerleave", release);
    trigger.addEventListener("focus", onFocus);
    trigger.addEventListener("blur", release);
    return () => {
      trigger.removeEventListener("pointerenter", onPointerEnter);
      trigger.removeEventListener("pointerleave", release);
      trigger.removeEventListener("focus", onFocus);
      trigger.removeEventListener("blur", release);
      cancelAnimationFrame(frame);
      seams.removeAttribute("transform");
    };
  }, []);

  return (
    <span ref={markRef} className="brand-mark-svg" aria-hidden="true">
      <BrandMark
        size={size}
        framed={false}
        seams={<path ref={seamsRef} className="brand-seams" d={REST_SEAM_PATH} fill="none" stroke="#0c0d10" strokeWidth="1.2" />}
      />
    </span>
  );
}
