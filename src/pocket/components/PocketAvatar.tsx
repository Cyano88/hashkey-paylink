import { UserRound } from './PocketIcons'
import { cn } from '../../lib/utils'

export const POCKET_AVATARS = [1, 2, 3, 4] as const

export default function PocketAvatar({ avatarId = 1, className = '' }: { avatarId?: number; className?: string }) {
  const valid = POCKET_AVATARS.includes(avatarId as typeof POCKET_AVATARS[number])
  return (
    <span className={cn('relative inline-flex shrink-0 overflow-hidden rounded-full bg-gray-100 text-gray-400 dark:bg-white/[0.08]', className)}>
      {valid ? <img src={`/pocket/avatars/avatar-${avatarId}.jpeg`} alt="" className="h-full w-full object-cover" /> : <UserRound className="m-auto h-1/2 w-1/2" />}
    </span>
  )
}
