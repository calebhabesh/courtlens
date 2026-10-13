import {
  useCallback,
  useState,
  useRef,
  useEffect,
  type ReactNode,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { motion, AnimatePresence, popoverVariants } from "../../lib/motion";
import { Icon, type IconName } from "./icon";

export interface MenuItemProps {
  label: ReactNode;
  icon?: IconName;
  shortcut?: string;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

export function MenuItem({
  label,
  icon,
  shortcut,
  disabled = false,
  onClick,
  className = "",
}: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`ui-menu-item ${className}`}
    >
      {icon && <Icon name={icon} size={14} />}
      <span className="ui-menu-item-label">{label}</span>
      {shortcut && <kbd className="ui-menu-item-shortcut">{shortcut}</kbd>}
    </button>
  );
}

export interface MenuProps {
  trigger: ReactNode;
  align?: "left" | "right";
  hoverIntent?: boolean;
  className?: string;
  children: ReactNode;
}

export function Menu({
  trigger,
  align = "left",
  hoverIntent = false,
  className = "",
  children,
}: MenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const openMenu = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setIsOpen(true);
  };

  const closeMenu = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setIsOpen(false);
  };

  const handleMouseEnter = () => {
    if (!hoverIntent) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(openMenu, 80);
  };

  const handleMouseLeave = () => {
    if (!hoverIntent) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(closeMenu, 150);
  };

  const toggle = (e: MouseEvent) => {
    e.stopPropagation();
    setIsOpen(prev => !prev);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const items = Array.from(
        containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || []
      );
      const index = items.findIndex(el => el === document.activeElement);
      const next = items[(index + 1) % items.length];
      next?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const items = Array.from(
        containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || []
      );
      const index = items.findIndex(el => el === document.activeElement);
      const prev = items[(index - 1 + items.length) % items.length];
      prev?.focus();
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: globalThis.MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen, setIsOpen]);

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      className={`ui-menu-container ${className}`}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={toggle}
        className="ui-menu-trigger"
      >
        {trigger}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="menu"
            variants={popoverVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={`ui-menu-panel ui-menu-align-${align}`}
            onClick={(event) => {
              // Choosing an item closes the menu and returns focus to the trigger.
              if ((event.target as HTMLElement).closest('[role="menuitem"]:not(:disabled)')) {
                closeMenu();
                triggerRef.current?.focus();
              }
            }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export interface PopoverProps {
  trigger: ReactNode;
  align?: "left" | "right";
  className?: string;
  /** Accessible name of the trigger when its content is not text alone. */
  triggerLabel?: string;
  /** Controlled mode: the owner closes the panel after applying a choice. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

export function Popover({ trigger, align = "left", className = "", triggerLabel, open, onOpenChange, children }: PopoverProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const isOpen = open ?? ownOpen;
  const setIsOpen = useCallback((value: boolean) => {
    if (open === undefined) setOwnOpen(value);
    onOpenChange?.(value);
  }, [open, onOpenChange]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: globalThis.MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, setIsOpen]);

  return (
    <div ref={containerRef} className={`ui-popover-container ${className}`}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={triggerLabel}
        onClick={() => setIsOpen(!isOpen)}
        className="ui-popover-trigger"
      >
        {trigger}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            variants={popoverVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={`ui-popover-panel ui-popover-align-${align}`}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
