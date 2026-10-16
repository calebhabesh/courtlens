import {
  Download, Copy, Play, Pause, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Star, ChevronDown,
  Menu, MessageCircle, Search, Settings, X, PanelLeft, SquarePen, Square, Trash2,
  Check, ChevronUp, Loader2, Info, AlertTriangle, Command, SlidersHorizontal, MoreHorizontal, Sparkles, Filter, Calendar, Database,
  CornerDownLeft, History, FileText, ArrowLeftRight, Lock, Plus, User, Table2, BarChart3, TrendingUp, LayoutGrid,
  Save, Scale, RefreshCw, Camera, Zap, RotateCcw, ExternalLink, HelpCircle, Maximize2, Keyboard, Eye, EyeOff, Columns3,
  ChartNoAxesColumn, ChartNoAxesCombined, ChartScatter, Minimize2, Pin, PinOff, UserRound, Users, CirclePlus, CircleCheck,
  GraduationCap, ArrowDownAZ, ArrowDownZA, Activity, Banknote, Trophy, Medal, UserRoundPen, UserRoundX
} from "lucide-react";

// D26: Lucide only, always through this wrapper (lint bans `lucide-react` elsewhere). One stroke
// width; sizes 14 (dense/inline), 16 (default) and 20 (headers, empty states); color follows the
// surrounding text. Add an icon here instead of typing an arrow, check mark or emoji.
const icons = {
  download: Download, copy: Copy, play: Play, pause: Pause, left: ChevronLeft, right: ChevronRight,
  up: ArrowUp, down: ArrowDown, star: Star, "chevron-down": ChevronDown, menu: Menu, message: MessageCircle,
  search: Search, settings: Settings, close: X, sidebar: PanelLeft, compose: SquarePen, stop: Square,
  trash: Trash2, check: Check, "chevron-up": ChevronUp, loader: Loader2, info: Info, alert: AlertTriangle,
  command: Command, sliders: SlidersHorizontal, more: MoreHorizontal, "more-horizontal": MoreHorizontal, sparkles: Sparkles, filter: Filter,
  calendar: Calendar, database: Database, enter: CornerDownLeft, history: History, page: FileText,
  swap: ArrowLeftRight, lock: Lock, plus: Plus, user: User, table: Table2, chart: BarChart3, trend: TrendingUp,
  cards: LayoutGrid, save: Save, scale: Scale, refresh: RefreshCw, camera: Camera, zap: Zap, reset: RotateCcw,
  external: ExternalLink, help: HelpCircle, expand: Maximize2, keyboard: Keyboard, eye: Eye, "eye-off": EyeOff,
  columns: Columns3, "chart-column": ChartNoAxesColumn, "chart-line": ChartNoAxesCombined, scatter: ChartScatter,
  collapse: Minimize2, pin: Pin, unpin: PinOff, person: UserRound, users: Users, "circle-plus": CirclePlus,
  "circle-check": CircleCheck, graduation: GraduationCap,
  "sort-az": ArrowDownAZ, "sort-za": ArrowDownZA, activity: Activity, banknote: Banknote, trophy: Trophy,
  medal: Medal, "user-edit": UserRoundPen, "user-clear": UserRoundX
};

export type IconName = keyof typeof icons;
export type IconSize = 14 | 16 | 20;

/**
 * Interface decoration; the enclosing action supplies its accessible name. `filled` is only for an
 * active state of an outline glyph (a favorited star), never decoration.
 */
export function Icon({ name, className = "", size = 16, filled = false }: { name: IconName; className?: string; size?: IconSize; filled?: boolean }) {
  const Glyph = icons[name];
  return <Glyph className={`ui-icon ui-icon-${size} ${filled ? "ui-icon-filled" : ""} ${className}`} size={size} strokeWidth={2} aria-hidden="true" focusable="false" />;
}
