import {
  Download, Copy, Play, Pause, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Star, ChevronDown,
  Menu, MessageCircle, Search, Settings, X, PanelLeft, SquarePen, Square, Trash2,
  Check, ChevronUp, Loader2, Info, AlertTriangle, Command, SlidersHorizontal, MoreHorizontal, Sparkles, Filter, Calendar, Database
} from "lucide-react";

const icons = {
  download: Download, copy: Copy, play: Play, pause: Pause, left: ChevronLeft, right: ChevronRight,
  up: ArrowUp, down: ArrowDown, star: Star, "chevron-down": ChevronDown, menu: Menu, message: MessageCircle,
  search: Search, settings: Settings, close: X, sidebar: PanelLeft, compose: SquarePen, stop: Square,
  trash: Trash2, check: Check, "chevron-up": ChevronUp, loader: Loader2, info: Info, alert: AlertTriangle,
  command: Command, sliders: SlidersHorizontal, more: MoreHorizontal, "more-horizontal": MoreHorizontal, sparkles: Sparkles, filter: Filter,
  calendar: Calendar, database: Database
};

export type IconName = keyof typeof icons;

/** Interface decoration; the enclosing action supplies its accessible name. */
export function Icon({ name, className = "", size = 16 }: { name: IconName; className?: string; size?: number }) {
  const Glyph = icons[name];
  return <Glyph className={`ui-icon ${className}`} size={size} strokeWidth={2} aria-hidden="true" focusable="false" />;
}
