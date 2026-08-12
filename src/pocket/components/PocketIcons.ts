import { createElement, type HTMLAttributes } from 'react'

export function Loader2({ className = '', ...props }: HTMLAttributes<HTMLSpanElement>) {
  return createElement('span', {
    ...props,
    className: `inline-block shrink-0 rounded-full border-2 border-current border-t-transparent ${className}`,
    role: props.role ?? 'status',
  })
}

export {
  ArrowDownIcon as ArrowDownToLine,
  ArrowLeftIcon as ArrowLeft,
  ArrowLongRightIcon as ArrowRight,
  ArrowRightStartOnRectangleIcon as LogOut,
  ArrowTrendingUpIcon as TrendingUp,
  ArrowUpIcon as ArrowUpFromLine,
  ArrowUpOnSquareIcon as Share2,
  ArrowUpTrayIcon as Download,
  ArrowsRightLeftIcon as ArrowLeftRight,
  ArrowsUpDownIcon as ArrowUpDown,
  BanknotesIcon as Banknote,
  BoltIcon as Lightbulb,
  BuildingLibraryIcon as Landmark,
  CheckCircleIcon as CheckCircle2,
  CheckIcon as Check,
  ChevronDownIcon as ChevronDown,
  ChevronLeftIcon as ChevronLeft,
  ChevronRightIcon as ChevronRight,
  ClipboardDocumentCheckIcon as CheckCheck,
  ClipboardDocumentIcon as Copy,
  ClockIcon as Clock3,
  CreditCardIcon as Wallet,
  DevicePhoneMobileIcon as Phone,
  EnvelopeIcon as Mail,
  ExclamationCircleIcon as AlertCircle,
  InformationCircleIcon as Info,
  LinkIcon as Link2,
  LockClosedIcon as Lock,
  MagnifyingGlassIcon as Search,
  MoonIcon as Moon,
  PencilSquareIcon as Pencil,
  PresentationChartBarIcon as LayoutDashboard,
  QueueListIcon as History,
  SignalIcon as Wifi,
  Squares2X2Icon as Activity,
  BuildingStorefrontIcon as Store,
  SunIcon as Sun,
  TagIcon as Tag,
  UserCircleIcon as UserRound,
  UserGroupIcon as Users,
  WrenchScrewdriverIcon as Sliders,
  XCircleIcon as XCircle,
} from '@heroicons/react/24/outline'

export { CurrencyDollarIcon as Coins, PaperAirplaneIcon as Send, TvIcon as Tv } from '@heroicons/react/24/outline'
