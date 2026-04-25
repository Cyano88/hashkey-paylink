interface StreamNotFoundProps {
  vaultAddress: string
}

export function StreamNotFound({ vaultAddress }: StreamNotFoundProps) {
  return (
    <div className="mx-auto w-full max-w-md font-inter">
      <div className="rounded-2xl border border-gray-100 bg-white px-8 py-10 shadow-lg text-center space-y-5">

        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gray-100 bg-gray-50">
          <svg className="h-6 w-6 text-gray-300" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>

        <div className="space-y-2">
          <p className="text-[15px] font-semibold text-gray-900">Stream Not Found</p>
          <p className="text-[13px] leading-relaxed text-gray-400">
            No stream exists at this address. It may not have been
            deployed yet, or the link may be incorrect.
          </p>
          <p className="font-mono text-[11px] text-gray-300">
            {vaultAddress.slice(0, 10)}…{vaultAddress.slice(-8)}
          </p>
        </div>

        <a
          href="/"
          className="block w-full rounded-xl bg-gray-900 py-3 text-center text-[14px] font-semibold text-white transition-colors hover:bg-gray-700"
        >
          Create a New Stream
        </a>

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
