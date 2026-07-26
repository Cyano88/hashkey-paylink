import { useId } from 'react'

export type CPurseIconProps = {
  className?: string
  size?: number | string
  title?: string
}

export type PocketPillMarkProps = {
  className?: string
  size?: 'sm' | 'md'
  tone?: 'contrast' | 'surface' | 'subtle'
  title?: string
}

/** Scale-independent C-Purse mark. The two empty slices inherit any background. */
export function CPurseIcon({
  className = '',
  size = 64,
  title = 'Pocket',
}: CPurseIconProps) {
  const clipId = `c-purse-${useId().replace(/:/g, '')}`

  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title || undefined}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="256" cy="256" r="208" />
        </clipPath>
      </defs>
      <g fill="currentColor" clipPath={`url(#${clipId})`}>
        <rect x="48" y="48" width="252" height="416" />
        <rect x="320" y="48" width="24" height="416" />
        <rect x="364" y="48" width="100" height="416" />
      </g>
    </svg>
  )
}

export function CPurseHeroMark({ className = '', size = 160 }: CPurseIconProps) {
  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden rounded-[28%] bg-[#0A0A0A] text-white ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <CPurseIcon size="100%" title="" />
    </span>
  )
}

/** Compact checkout mark. Use this instead of the legacy wallet-outline image. */
export function PocketPillMark({
  className = '',
  size = 'md',
  tone = 'surface',
  title = '',
}: PocketPillMarkProps) {
  const dimensions = size === 'sm' ? 'h-5 w-7' : 'h-6 w-9'
  const iconSize = size === 'sm' ? 14 : 17
  const colors = tone === 'contrast'
    ? 'bg-white/[0.12] text-white dark:bg-black/10 dark:text-gray-950'
    : tone === 'subtle'
      ? 'bg-gray-100 text-gray-950 dark:bg-white/10 dark:text-white'
      : 'bg-gray-950 text-white dark:bg-white dark:text-gray-950'

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${dimensions} ${colors} ${className}`}
      aria-hidden={title ? undefined : true}
      aria-label={title || undefined}
    >
      <CPurseIcon size={iconSize} title="" />
    </span>
  )
}
