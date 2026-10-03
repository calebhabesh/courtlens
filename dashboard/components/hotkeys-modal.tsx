"use client";

import { useEffect, useRef } from "react";

interface HotkeysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  key: string;
  description: string;
  category: "Global" | "Navigation" | "Stats & Table";
}

const SHORTCUTS: ShortcutItem[] = [
  { key: "/", description: "Focus global lookup search", category: "Global" },
  { key: "⌘K / Ctrl+K", description: "Focus global lookup search", category: "Global" },
  { key: "Esc", description: "Close active dropdown, drawer or modal", category: "Global" },
  { key: "?", description: "Open keyboard shortcuts guide", category: "Global" },
  { key: "Tab", description: "Move focus to next interactive control", category: "Global" },
  { key: "F", description: "Focus context bar filters", category: "Navigation" },
  { key: "G", description: "Open definitions and glossary", category: "Navigation" },
  { key: "Z", description: "Toggle between Stats and Comparison tray", category: "Navigation" },
  { key: "T", description: "Expand / collapse Stats table width", category: "Stats & Table" },
  { key: "C", description: "Add focused player to comparison selection", category: "Stats & Table" },
];

export function HotkeysModal({ isOpen, onClose }: HotkeysModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const categories: Array<"Global" | "Navigation" | "Stats & Table"> = [
    "Global",
    "Navigation",
    "Stats & Table"
  ];

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hotkeys-modal-title"
    >
      <div className="modal-card" ref={modalRef} tabIndex={-1}>
        <div className="modal-header">
          <div>
            <h2 id="hotkeys-modal-title" className="modal-title">
              Keyboard Shortcuts
            </h2>
            <p className="modal-subtitle">
              Quick keyboard access across the CourtLoad replica workspace.
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close keyboard shortcuts dialog"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          {categories.map((cat) => (
            <div key={cat} className="hotkeys-section">
              <h3 className="hotkeys-section-title">{cat}</h3>
              <dl className="hotkeys-list">
                {SHORTCUTS.filter((s) => s.category === cat).map((item) => (
                  <div key={item.key} className="hotkeys-row">
                    <dt className="hotkeys-key">
                      <kbd>{item.key}</kbd>
                    </dt>
                    <dd className="hotkeys-desc">{item.description}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <span className="text-xs text-muted">
            Table shortcuts (T, C, A/D) require focus on the table container.
          </span>
          <button type="button" className="button button-small" onClick={onClose}>
            Got it (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
