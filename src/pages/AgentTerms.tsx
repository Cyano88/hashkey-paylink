import { useEffect, useState } from 'react'
import { FileText, ShieldCheck } from 'lucide-react'

type LegalProfile = {
  entityName: string
  entityType: string
  jurisdiction: string
  entityId?: string
  einLast4?: string
  registeredAgent?: string
  registeredAgentAddress?: string
  termsUrl: string
  operatorRole: string
}

type GovernanceProfile = {
  governanceVersion: string
  modelId?: string
  promptHash?: string
  configHash?: string
  operatingAgreementHash?: string
  updatedAt?: string
}

export default function AgentTerms() {
  const [legal, setLegal] = useState<LegalProfile | null>(null)
  const [governance, setGovernance] = useState<GovernanceProfile | null>(null)

  useEffect(() => {
    fetch('/api/agent-legal-profile?agent=hashpaylink-agent')
      .then(res => res.json())
      .then(data => {
        if (data?.ok) {
          setLegal(data.legal)
          setGovernance(data.governance)
        }
      })
      .catch(() => undefined)
  }, [])

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#1c1c20] sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 dark:border-blue-900/30 dark:bg-blue-900/20">
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Agent service terms</p>
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Hash PayLink Agent</h1>
            <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              x402 purchases are service requests to the named operator. The software agent fulfills the request by returning paid API output and a Circle Gateway x402 receipt.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-xs font-semibold text-gray-900 dark:text-white">Legal counterparty</p>
            <dl className="mt-2 space-y-1 text-xs">
              <Row label="Name" value={legal?.entityName ?? 'Not configured'} />
              <Row label="Type" value={legal?.entityType ?? 'Not configured'} />
              <Row label="Jurisdiction" value={legal?.jurisdiction ?? 'Not configured'} />
              <Row label="Entity ID" value={legal?.entityId ?? 'Not configured'} />
              <Row label="EIN" value={legal?.einLast4 ? `***-${legal.einLast4}` : 'Not configured'} />
            </dl>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-xs font-semibold text-gray-900 dark:text-white">Agent governance</p>
            <dl className="mt-2 space-y-1 text-xs">
              <Row label="Version" value={governance?.governanceVersion ?? 'unversioned'} />
              <Row label="Model" value={governance?.modelId ?? 'Not configured'} />
              <Row label="Prompt hash" value={governance?.promptHash ?? 'Not configured'} />
              <Row label="Config hash" value={governance?.configHash ?? 'Not configured'} />
              <Row label="Agreement hash" value={governance?.operatingAgreementHash ?? 'Not configured'} />
            </dl>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
          This page is operational metadata, not legal advice. The legal entity fields should be configured only after entity formation and counsel review.
        </div>

        <div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-3 text-[11px] font-semibold text-gray-400 dark:border-white/10 dark:text-gray-500">
          <ShieldCheck className="h-4 w-4" />
          Circle Gateway x402 receipts link each paid API call to this operator metadata and the current governance version.
        </div>
      </section>
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-gray-400">{label}</dt>
      <dd className="truncate font-mono text-gray-700 dark:text-gray-200">{value}</dd>
    </div>
  )
}
