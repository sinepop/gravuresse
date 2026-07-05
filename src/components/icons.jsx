import {
  Send, Settings, X, ChevronDown, Trash2, Download, Upload, Image, Film,
  Sparkles, Grid3X3, Link, Check, AlertTriangle, RefreshCw, Eye, Zap,
  Minus, Square, Copy, Plus, MousePointer, Hand, Pencil, Circle, Type,
  LayoutGrid, Move, Lightbulb, MessageSquare, ExternalLink, BookOpen,
  CreditCard, KeyRound, Globe2, ServerCog, BadgeDollarSign, Star, Undo2, Redo2
} from 'lucide-react'

const ICONS = {
  send: Send,
  gear: Settings,
  close: X,
  chevDown: ChevronDown,
  trash: Trash2,
  download: Download,
  upload: Upload,
  image: Image,
  film: Film,
  sparkle: Sparkles,
  grid: Grid3X3,
  link: Link,
  check: Check,
  alert: AlertTriangle,
  refresh: RefreshCw,
  eye: Eye,
  zap: Zap,
  winMin: Minus,
  winMax: Square,
  winRestore: Copy,
  winClose: X,
  plus: Plus,
  minus: Minus,
  select: MousePointer,
  move: Hand,
  pencil: Pencil,
  rect: Square,
  circle: Circle,
  text: Type,
  layoutGrid: LayoutGrid,
  move4: Move,
  think: Lightbulb,
  copy: Copy,
  chat: MessageSquare,
  external: ExternalLink,
  book: BookOpen,
  card: CreditCard,
  key: KeyRound,
  globe: Globe2,
  server: ServerCog,
  price: BadgeDollarSign,
  star: Star,
  undo: Undo2,
  redo: Redo2,
}

export default function Ic({ n, size = 15, color = 'currentColor', sw = 1.5 }) {
  const Icon = ICONS[n]
  if (!Icon) return null
  return <Icon size={size} color={color} strokeWidth={sw} style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }} />
}
