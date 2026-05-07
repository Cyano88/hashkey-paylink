import type { ReactNode } from 'react'

export function DocPage({ children }: { children: ReactNode }) {
  return <div className="animate-fade-in space-y-10">{children}</div>
}

export function DocHeader({ title, description, badge }: { title: string; description: string; badge?: string }) {
  return (
    <div className="pb-8 border-b border-gray-200 dark:border-gray-800">
      {badge && (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 mb-3">
          {badge}
        </span>
      )}
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">{title}</h1>
      <p className="mt-3 text-lg text-gray-500 dark:text-gray-400 leading-relaxed">{description}</p>
    </div>
  )
}

export function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h2>
      <div className="space-y-3 text-gray-600 dark:text-gray-400 leading-relaxed">{children}</div>
    </section>
  )
}

export function SubSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">{title}</h3>
      <div className="space-y-2 text-gray-600 dark:text-gray-400 leading-relaxed">{children}</div>
    </div>
  )
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 rounded text-sm font-mono bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
      {children}
    </code>
  )
}

export function CodeBlock({ children, lang = 'bash' }: { children: string; lang?: string }) {
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs text-gray-400 dark:text-gray-500 font-mono uppercase tracking-wide">{lang}</span>
      </div>
      <pre className="p-4 overflow-x-auto bg-gray-950 text-gray-100 text-sm font-mono leading-relaxed whitespace-pre">
        {children}
      </pre>
    </div>
  )
}

export function InfoBox({ children, type = 'info' }: { children: ReactNode; type?: 'info' | 'warning' | 'tip' }) {
  const styles = {
    info:    'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300',
    warning: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300',
    tip:     'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300',
  }
  const labels = { info: 'Note', warning: 'Warning', tip: 'Tip' }

  return (
    <div className={`rounded-xl border px-4 py-3.5 text-sm ${styles[type]}`}>
      <span className="font-semibold">{labels[type]}: </span>
      {children}
    </div>
  )
}

export function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800/60">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {rows.map((row, i) => (
            <tr key={i} className="bg-white dark:bg-gray-900/40">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono text-xs align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Divider() {
  return <hr className="border-gray-200 dark:border-gray-800" />
}

export function NavFooter({ prev, next }: {
  prev?: { label: string; path: string }
  next?: { label: string; path: string }
}) {
  return (
    <div className="flex items-center justify-between pt-8 mt-8 border-t border-gray-200 dark:border-gray-800">
      {prev ? (
        <a href={prev.path} className="flex flex-col gap-0.5 text-sm group">
          <span className="text-gray-400 text-xs">Previous</span>
          <span className="text-blue-600 dark:text-blue-400 group-hover:underline font-medium">← {prev.label}</span>
        </a>
      ) : <div />}
      {next ? (
        <a href={next.path} className="flex flex-col gap-0.5 text-sm text-right group">
          <span className="text-gray-400 text-xs">Next</span>
          <span className="text-blue-600 dark:text-blue-400 group-hover:underline font-medium">{next.label} →</span>
        </a>
      ) : <div />}
    </div>
  )
}
