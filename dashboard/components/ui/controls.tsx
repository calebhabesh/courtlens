import type { HTMLAttributes } from "react";

export { Button, IconButton, type ButtonProps, type IconButtonProps } from "./button";
export { Section, type SectionProps } from "./panel";

export function Toolbar({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`toolbar ${className}`} {...props} />;
}
