import {
  useEffect,
  useRef,
  useId,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { motion, AnimatePresence, modalVariants, scrimVariants } from "../../lib/motion";
import { IconButton } from "./button";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  className = "",
  children,
}: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);

  const wasOpenRef = useRef(false);

  // Capture trigger focus and handle Escape
  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      triggerElementRef.current = document.activeElement as HTMLElement;
      // Focus the modal or first focusable child
      requestAnimationFrame(() => {
        const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          panelRef.current?.focus();
        }
      });
    } else if (wasOpenRef.current && triggerElementRef.current) {
      wasOpenRef.current = false;
      triggerElementRef.current.focus();
    }
  }, [isOpen]);

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
      );
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={scrimVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="ui-scrim"
          onClick={onClose}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={`ui-modal-panel ${className}`}
            onClick={e => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            <div className="ui-modal-header">
              <div>
                {title && (
                  <h2 id={titleId} className="ui-modal-title">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id={descId} className="ui-modal-desc text-muted">
                    {description}
                  </p>
                )}
              </div>
              <IconButton
                icon="close"
                label="Close dialog"
                variant="ghost"
                size="sm"
                onClick={onClose}
              />
            </div>
            <div className="ui-modal-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
