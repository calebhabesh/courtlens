"use client";

import { Modal } from "./ui/modal";

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
  { key: "G", description: "Open definitions and glossary", category: "Navigation" },
  { key: "Z", description: "Open comparison for selected players", category: "Stats & Table" },
  { key: "W / E", description: "Compact / standard row density", category: "Stats & Table" },
  { key: "A / D", description: "Scroll table horizontally", category: "Stats & Table" },
  { key: "T", description: "Expand / collapse Stats table height", category: "Stats & Table" },
  { key: "F", description: "Show / hide Stats table filters", category: "Stats & Table" },
  { key: "C", description: "Add focused player to comparison selection", category: "Stats & Table" },
];

export function HotkeysModal({ isOpen, onClose }: HotkeysModalProps) {
  const categories: Array<"Global" | "Navigation" | "Stats & Table"> = [
    "Global",
    "Navigation",
    "Stats & Table"
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Keyboard Shortcuts"
      description="Quick keyboard access across the CourtLens replica workspace."
      className="hotkeys-modal"
    >
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
      <div className="modal-footer">
        <span className="text-xs text-muted">
          Table shortcuts (T, C, Z, W/E, A/D) require focus on the table container.
        </span>
        <button type="button" className="button button-small" onClick={onClose}>
          Got it (Esc)
        </button>
      </div>
    </Modal>
  );
}
