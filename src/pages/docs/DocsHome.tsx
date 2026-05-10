import { Link } from 'react-router-dom'
import { Zap, Shield, Globe, Database, Bot, Code2 } from 'lucide-react'
import { DocPage, DocHeader } from './components'

const cards = [
  {
    icon: Zap,
    title: 'Getting Started',
    description: 'Create your first payment link in under a minute. No account, no backend required.',
    path: '/docs/getting-started',
    color: 'text-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
  },
  {
    icon: Globe,
    title: 'Supported Chains',
    description: 'Base, HashKey, Arc, Starknet, Solana, and Arbitrum — all gasless for the payer.',
    path: '/docs/chains/base',
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
  },
  {
    icon: Database,
    title: '0G Storage',
    description: 'Every payment is permanently archived on 0G decentralized storage with on-chain proof.',
    path: '/docs/0g-storage',
    color: 'text-purple-500',
    bg: 'bg-purple-50 dark:bg-purple-950/40',
  },
  {
    icon: Bot,
    title: 'Access Mode',
    description: 'Gate AI agents, APIs, and web services behind a verified USDC payment.',
    path: '/docs/access-mode',
    color: 'text-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
  },
  {
    icon: Code2,
    title: 'SDK',
    description: 'Drop a <PayLinkButton> into any React app or use the URL API with zero dependencies.',
    path: '/docs/sdk',
    color: 'text-rose-500',
    bg: 'bg-rose-50 dark:bg-rose-950/40',
  },
  {
    icon: Shield,
    title: 'Security',
    description: 'Non-custodial, EIP-712 typed signatures, open-source smart contracts.',
    path: '/docs/security',
    color: 'text-gray-500',
    bg: 'bg-gray-50 dark:bg-gray-800/60',
  },
]

export default function DocsHome() {
  return (
    <DocPage>
      <DocHeader
        title="Hash PayLink Documentation"
        description="Stateless, non-custodial USDC payment infrastructure. Turn a single URL into a complete multi-chain checkout — no accounts, no backend, no gas friction."
      />

      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">What is Hash PayLink?</h2>
        <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
          Hash PayLink is a payment infrastructure platform that generates shareable URLs and QR codes for collecting USDC across five blockchains. Payers never need gas tokens — the platform sponsors all fees. Merchants receive funds directly on-chain with no custodian involved.
        </p>
        <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
          Every payment made through a multi-payer collection link is permanently archived to <strong className="text-gray-800 dark:text-gray-200">0G decentralized storage</strong> and anchored on-chain via the <code className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">PayLinkArchive</code> smart contract. This creates immutable payment proofs that AI agents, APIs, and external services can verify trustlessly — no Hash PayLink server required.
        </p>
        <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
          The platform hosts two products on a single service: <strong className="text-gray-800 dark:text-gray-200">Hash PayLink</strong> for payment collection, and <strong className="text-gray-800 dark:text-gray-200">StreamPay</strong> for USDC payroll streaming and creator paywalls.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Explore the docs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cards.map(({ icon: Icon, title, description, path, color, bg }) => (
            <Link
              key={path}
              to={path}
              className="group flex gap-4 p-5 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white dark:bg-gray-900/40 hover:shadow-card transition-all"
            >
              <div className={`shrink-0 h-9 w-9 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon className={`h-4.5 w-4.5 ${color}`} />
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {title}
                </p>
                <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5 leading-relaxed">{description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 p-6 space-y-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Key facts</h2>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li>• <strong className="text-gray-800 dark:text-gray-200">Platform fee:</strong> 0.2% (20 bps), deducted atomically on-chain</li>
          <li>• <strong className="text-gray-800 dark:text-gray-200">Chains:</strong> Base · HashKey · Arc · Starknet · Solana · Arbitrum</li>
          <li>• <strong className="text-gray-800 dark:text-gray-200">Asset:</strong> USDC across Base, Arc, Starknet, Solana, and Arbitrum</li>
          <li>• <strong className="text-gray-800 dark:text-gray-200">Archive contract:</strong> <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a</code> — 0G Mainnet (Chain ID 16661)</li>
          <li>• <strong className="text-gray-800 dark:text-gray-200">SDK:</strong> <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">@hashpaylink/sdk</code> on npm</li>
          <li>• <strong className="text-gray-800 dark:text-gray-200">Live at:</strong> <a href="https://hashpaylink.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">hashpaylink.com</a></li>
        </ul>
      </div>
    </DocPage>
  )
}
