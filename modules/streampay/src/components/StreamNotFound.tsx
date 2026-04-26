interface StreamNotFoundProps {
  vaultAddress: string
}

export function StreamNotFound({ vaultAddress }: StreamNotFoundProps) {
  return (
    <div className="w-full max-w-[420px] mx-auto">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-8 sm:px-8 sm:py-10 text-center space-y-5">

        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gray-100 bg-gray-50">
          <svg className="h-6 w-6 text-gray-300" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>

        <div className="space-y-2">
          <p className="text-[15px] font-bold text-gray-900">Stream Not Found</p>
          <p className="text-[13px] leading-relaxed text-gray-400">
            No stream exists at this address. It may not have been deployed yet, or the link may be incorrect.
          </p>
          <p className="font-mono text-[11px] text-gray-300 break-all">
            {vaultAddress.slice(0, 10)}…{vaultAddress.slice(-8)}
          </p>
        </div>

        <button
          onClick={() => window.location.href = '/'}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[14px] font-semibold text-white min-h-[48px] transition-colors active:scale-[0.98]"
          style={{ background: '#111827' }}
        >
          Create a New Stream
        </button>

        <div className="flex items-center justify-center gap-1.5 pt-1">
          <img src="/hash-logo.png" alt="" className="h-3 w-3 opacity-20" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-300">
            Powered by Hash PayLink
          </span>
        </div>
      </div>
    </div>
  )
}
