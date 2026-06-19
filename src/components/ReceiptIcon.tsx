import type { SVGProps } from 'react'

export function ReceiptIcon({ className = 'h-4 w-4', ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M6 3h9l3 3v13l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1V3Z" />
      <path d="M15 3v4h4" />
      <path d="M8.5 9.5h5" />
      <path d="M16 9.5h1" />
      <path d="M8.5 12h4.5" />
      <path d="M16 12h1" />
      <path d="M8.5 14.5h4" />
      <path d="M16 14.5h1" />
      <path d="M8.5 17h8.5" />
    </svg>
  )
}
