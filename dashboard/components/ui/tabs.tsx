import {
  createContext,
  useContext,
  useId,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "../../lib/motion";

interface TabsContextValue {
  value: string;
  onChange: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs compound components must be rendered within a Tabs provider.");
  }
  return context;
}

export interface TabsProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  children: ReactNode;
}

export function Tabs({ value, onChange, id, className = "", children }: TabsProps) {
  const autoId = useId();
  const baseId = id || autoId;

  return (
    <TabsContext.Provider value={{ value, onChange, baseId }}>
      <div className={`ui-tabs ${className}`}>{children}</div>
    </TabsContext.Provider>
  );
}

export interface TabsListProps {
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}

export function TabsList({ className = "", children, "aria-label": ariaLabel }: TabsListProps) {
  const { value, onChange } = useTabs();

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const tabButtons = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')
    );
    const currentIndex = tabButtons.findIndex(b => b.getAttribute("data-value") === value);
    if (currentIndex === -1) return;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      const nextTab = tabButtons[(currentIndex + 1) % tabButtons.length];
      const val = nextTab.getAttribute("data-value");
      if (val) onChange(val);
      nextTab.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prevTab = tabButtons[(currentIndex - 1 + tabButtons.length) % tabButtons.length];
      const val = prevTab.getAttribute("data-value");
      if (val) onChange(val);
      prevTab.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      const firstTab = tabButtons[0];
      const val = firstTab.getAttribute("data-value");
      if (val) onChange(val);
      firstTab.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      const lastTab = tabButtons[tabButtons.length - 1];
      const val = lastTab.getAttribute("data-value");
      if (val) onChange(val);
      lastTab.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={`ui-tabs-list ${className}`}
    >
      {children}
    </div>
  );
}

export interface TabTriggerProps {
  value: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

export function TabTrigger({ value: tabValue, disabled = false, className = "", children }: TabTriggerProps) {
  const { value, onChange, baseId } = useTabs();
  const isSelected = value === tabValue;

  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-tab-${tabValue}`}
      aria-controls={`${baseId}-panel-${tabValue}`}
      aria-selected={isSelected}
      tabIndex={isSelected ? 0 : -1}
      disabled={disabled}
      data-value={tabValue}
      data-active={isSelected}
      onClick={() => !disabled && onChange(tabValue)}
      className={`ui-tab-trigger ${isSelected ? "ui-tab-trigger-active" : ""} ${className}`}
    >
      {children}
      {isSelected && (
        <motion.span
          layoutId={`tab-indicator-${baseId}`}
          className="ui-tab-indicator"
          transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.9 }}
        />
      )}
    </button>
  );
}

export interface TabsContentProps {
  value: string;
  className?: string;
  children: ReactNode;
}

export function TabsContent({ value: tabValue, className = "", children }: TabsContentProps) {
  const { value, baseId } = useTabs();
  if (value !== tabValue) return null;

  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${tabValue}`}
      aria-labelledby={`${baseId}-tab-${tabValue}`}
      tabIndex={0}
      className={`ui-tabs-content ${className}`}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={tabValue}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } }}
          exit={{ opacity: 0, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
