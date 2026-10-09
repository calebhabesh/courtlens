import {
  useEffect,
  useRef,
  useId,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { motion, AnimatePresence, getDrawerVariants, scrimVariants } from "../../lib/motion";
import { IconButton } from "./button";
import { OverlayPortal } from "./overlay-portal";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  side?: "right" | "left" | "bottom";
  className?: string;
  children: ReactNode;
}

export function Drawer({
  isOpen,
  onClose,
  title,
  side = "right",
  className = "",
  children,
}: DrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      triggerRef.current = document.activeElement as HTMLElement;
      requestAnimationFrame(() => {
        panelRef.current?.focus();
      });
    } else if (wasOpenRef.current && triggerRef.current) {
      wasOpenRef.current = false;
      triggerRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isOpen, onClose]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === "Tab") {
      const focusables = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        ) || []
      ).filter(element => !element.closest("[inert]"));
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const drawerVariants = getDrawerVariants(side);

  return (
    <OverlayPortal>
      <AnimatePresence>
        {isOpen && (
          <div className="ui-drawer-root">
            <motion.div
              variants={scrimVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="ui-scrim"
              onClick={onClose}
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              tabIndex={-1}
              variants={drawerVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={`ui-drawer-panel ui-drawer-${side} ${className}`}
              onKeyDown={handleKeyDown}
            >
              <div className="ui-drawer-header">
                {title && (
                  <h2 id={titleId} className="ui-drawer-title">
                    {title}
                  </h2>
                )}
                <IconButton
                  icon="close"
                  label="Close drawer"
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                />
              </div>
              <div className="ui-drawer-body">{children}</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </OverlayPortal>
  );
}
