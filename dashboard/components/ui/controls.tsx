import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { Icon } from "./icon";

export function Button({ variant = "default", className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "quiet" }) {
  return <button type={type} className={`button ${variant === "default" ? "" : `button-${variant}`} ${className}`} {...props} />;
}

export function IconButton({ label, icon, className = "", ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & { label: string; icon: Parameters<typeof Icon>[0]["name"] }) {
  return <Button className={`icon-button ${className}`} aria-label={label} title={label} {...props}><Icon name={icon} /></Button>;
}

export function Section({ title, description, actions, children, className = "", ...props }: Omit<HTMLAttributes<HTMLElement>, "title"> & { title: string; description?: string; actions?: ReactNode }) {
  return <section className={`panel ${className}`} {...props}><div className="panel-header"><div><h2 className="panel-title">{title}</h2>{description && <p className="text-muted">{description}</p>}</div>{actions}</div>{children}</section>;
}

export function Toolbar({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`toolbar ${className}`} {...props} />;
}
