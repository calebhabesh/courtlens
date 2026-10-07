import { Download, Copy, Play, Pause, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Star, ChevronDown, Menu, MessageCircle, Search, Settings, X, PanelLeft, SquarePen, Square, Trash2 } from "lucide-react";

const icons = { download: Download, copy: Copy, play: Play, pause: Pause, left: ChevronLeft, right: ChevronRight, up: ArrowUp, down: ArrowDown, star: Star, "chevron-down": ChevronDown, menu: Menu, message: MessageCircle, search: Search, settings: Settings, close: X, sidebar: PanelLeft, compose: SquarePen, stop: Square, trash: Trash2 };

/** Interface decoration; the enclosing action supplies its accessible name. */
export function Icon({ name, className = "" }: { name: keyof typeof icons; className?: string }) {
  const Glyph = icons[name];
  return <Glyph className={`ui-icon ${className}`} size={16} strokeWidth={2} aria-hidden="true" focusable="false" />;
}
