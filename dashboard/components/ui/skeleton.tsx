import type { HTMLAttributes } from "react";

export type SkeletonVariant = "text" | "rect" | "circle";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  variant = "rect",
  width,
  height,
  className = "",
  style,
  ...props
}: SkeletonProps) {
  const customStyles: Record<string, string | number> = {};

  if (width !== undefined) {
    customStyles["--skeleton-width"] = typeof width === "number" ? `${width}px` : width;
  }
  if (height !== undefined) {
    customStyles["--skeleton-height"] = typeof height === "number" ? `${height}px` : height;
  }

  return (
    <div
      className={`ui-skeleton ui-skeleton-${variant} ${className}`}
      data-skeleton="true"
      style={{
        ...customStyles,
        ...style,
      }}
      aria-hidden="true"
      {...props}
    />
  );
}
