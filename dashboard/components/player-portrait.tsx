"use client";

import { Icon } from "./ui/icon";
import { useEffect, useRef, useState } from "react";
import { portraitSource, type PortraitWidth } from "@/lib/portrait-source";

type PortraitSize = "sm" | "md" | "lg" | "xl";

// Box size, the largest CSS box each size is drawn at (page CSS enlarges some, e.g. 40px table
// avatars and 64px drawer heroes), and the derivative used when srcset is unsupported.
const SIZES: Record<PortraitSize, { box: number; largest: number; fallback: PortraitWidth }> = {
  sm: { box: 30, largest: 40, fallback: 64 },
  md: { box: 48, largest: 64, fallback: 96 },
  lg: { box: 80, largest: 80, fallback: 192 },
  xl: { box: 144, largest: 144, fallback: 288 }
};

interface PlayerPortraitProps {
  playerId?: string;
  name: string;
  portraitUrl?: string | null;
  size?: PortraitSize;
  className?: string;
  alt?: string;
}

export function PlayerPortrait({
  playerId,
  name,
  portraitUrl,
  size = "sm",
  className = "",
  alt
}: PlayerPortraitProps) {
  const [error, setError] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  // An image that failed before hydration never fires onError; detect it after mount.
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) setError(true);
  }, []);

  // Compute initials
  const initials = name
    .trim()
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");

  const { box, largest, fallback } = SIZES[size];
  const sizeClass = `player-portrait-${size}`;
  const source = portraitSource(portraitUrl, playerId, fallback);

  if (error || !source) {
    return (
      <div
        className={`player-portrait-fallback ${sizeClass} ${className}`}
        title={name}
        role="img"
        aria-label={alt ?? `${name} portrait placeholder`}
      >
        {initials || <Icon name="person" size={16} />}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imageRef}
      src={source.src}
      srcSet={source.srcSet}
      sizes={source.srcSet ? `${largest}px` : undefined}
      alt={alt ?? `${name} portrait`}
      width={box}
      height={box}
      loading={size === "lg" || size === "xl" ? "eager" : "lazy"}
      onError={() => setError(true)}
      className={`player-portrait ${sizeClass} ${className}`}
    />
  );
}
