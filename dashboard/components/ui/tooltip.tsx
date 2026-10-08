import {
  useState,
  useRef,
  useId,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "../../lib/motion";

export interface TooltipProps {
  content: ReactNode;
  delayMs?: number;
  className?: string;
  children: ReactNode;
}

export function Tooltip({
  content,
  delayMs = 300,
  className = "",
  children,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const id = useId();

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delayMs);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  const handleFocus = () => {
    setIsVisible(true);
  };

  const handleBlur = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  return (
    <div
      className={`ui-tooltip-wrapper ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      aria-describedby={isVisible ? id : undefined}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            id={id}
            role="tooltip"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.14, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, y: 2, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } }}
            className="ui-tooltip"
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
