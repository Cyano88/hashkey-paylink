import { useId } from 'react'

export type CPurseIconProps = {
  className?: string
  size?: number | string
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
