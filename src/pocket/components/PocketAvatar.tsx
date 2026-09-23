import { UserRound } from './PocketIcons'
import { cn } from '../../lib/utils'

// Accept existing profile records without displaying legacy image selections.
export default function PocketAvatar({ className = '' }: { avatarId?: number; className?: string }) {
  return <span aria-hidden="true" className={cn('inline-flex shrink-0 items-center justify-center text-gray-500 dark:text-zinc-500', className)}>
    <UserRound className="h-full w-full stroke-[1.5]" />
  </span>
}
