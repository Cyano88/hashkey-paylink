import { Link } from 'react-router-dom'
import { Bot, Code2, Database, Globe, MessageCircle, Radio, Shield, Store, Zap } from 'lucide-react'
import { DocPage, DocHeader } from './components'

const cards = [
  {
    icon: Zap,
    title: 'Getting Started',
    description: 'Create your first hosted payment link from /app in under a minute.',
    path: '/docs/getting-started',
    color: 'text-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
  },
  {
    icon: Globe,
    title: 'Supported Chains',
    description: 'Base, Arbitrum, Arc Testnet, and Solana payment rails.',
    path: '/docs/chains/base',
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
  },
  {
    icon: MessageCircle,
    title: 'PolyDesk',
    description: 'Polymarket funding, portfolio alerts, LP Scout, and World Cup market context from Telegram.',
    path: '/polymarket',
    color: 'text-cyan-500',
    bg: 'bg-cyan-50 dark:bg-cyan-950/40',
  },
  {
    icon: Radio,
    title: 'HashpayStream',
    description: 'Creator checkout for USDC-paid content, checkpoint payouts, receipts, and Agent Hash on Arc.',
    path: '/hashpaystream/docs',
    color: 'text-indigo-500',
    bg: 'bg-indigo-50 dark:bg-indigo-950/40',
  },
  {
    icon: Store,
    title: 'Retail POS',
    description: 'Country-aware static QR checkout, starting with Nigeria USDC and Spenda wallet paths.',
    path: '/app',
    color: 'text-teal-500',
    bg: 'bg-teal-50 dark:bg-teal-950/40',
  },
  {
    icon: Database,
    title: '0G Storage',
    description: '0G is the verifiable memory layer for payments, dashboards, AI access, and agent receipts.',
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
    description: 'Drop a hosted checkout button into any React app or use the URL API with zero dependencies.',
    path: '/docs/sdk',
    color: 'text-rose-500',
    bg: 'bg-rose-50 dark:bg-rose-950/40',
  },
  {
    icon: Shield,
    title: 'Security',
    description: 'Non-custodial flows, signed actions, dedicated escrows, and verifiable archive records.',
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
        description="Programmable USDC payment infrastructure for hosted checkout, Telegram workflows, PolyDesk, HashpayStream, retail POS, and agent commerce."
      />

      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">What is Hash PayLink?</h2>
        <p className="mb-4 leading-relaxed text-gray-600 dark:text-gray-400">
          Hash PayLink is a programmable payment platform that generates shareable URLs and QR codes for collecting USDC, running Telegram payment workflows, opening PolyDesk for Polymarket users, powering HashpayStream on Arc, and supporting agent commerce.
        </p>
        <p className="mb-4 leading-relaxed text-gray-600 dark:text-gray-400">
          Every confirmed multi-payer record can be archived to <strong className="text-gray-800 dark:text-gray-200">0G decentralized storage</strong> and anchored on-chain through the <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm dark:bg-gray-800">PayLinkArchive</code> contract. This creates payment proofs that AI agents, APIs, dashboards, and receipt pages can verify without trusting an application database.
        </p>
        <p className="leading-relaxed text-gray-600 dark:text-gray-400">
          The root domain is the foundation page. The working app lives at <strong className="text-gray-800 dark:text-gray-200">/app</strong>, with direct routes for checkout, Telegram, PolyDesk, HashpayStream, agents, receipts, and docs.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-purple-200 bg-purple-50/60 p-6 dark:border-purple-900/50 dark:bg-purple-950/20">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">0G across the ecosystem</h2>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li>- <strong className="text-gray-800 dark:text-gray-200">Payment archive:</strong> confirmed multi-payer records are uploaded to 0G Storage and anchored on 0G Mainnet.</li>
          <li>- <strong className="text-gray-800 dark:text-gray-200">Agent verification:</strong> paid AI services call <code className="rounded bg-white px-1 py-0.5 font-mono text-xs dark:bg-gray-900">/api/agent-verify</code> before responding.</li>
          <li>- <strong className="text-gray-800 dark:text-gray-200">Telegram paid access:</strong> Photon requests use Hash PayLink payments, then unlock answers only after the 0G proof exists.</li>
          <li>- <strong className="text-gray-800 dark:text-gray-200">HashpayStream extension:</strong> payroll, agentic stream, and Arena settlement receipts follow the same durable proof pattern.</li>
        </ul>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Explore the docs</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {cards.map(({ icon: Icon, title, description, path, color, bg }) => (
            <Link
              key={path}
              to={path}
              className="group flex gap-4 rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-gray-300 hover:shadow-card dark:border-gray-800 dark:bg-gray-900/40 dark:hover:border-gray-700"
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${bg}`}>
                <Icon className={`h-4.5 w-4.5 ${color}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 transition-colors group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                  {title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/60 p-6 dark:border-gray-800 dark:bg-gray-900/40">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Key facts</h2>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li>- <strong className="text-gray-800 dark:text-gray-200">Payment fee:</strong> 0.2% standard platform fee; sponsored EVM payments may include gas recovery.</li>
          <li>- <strong className="text-gray-800 dark:text-gray-200">Arena fee:</strong> 0.5% on completed HashpayStream Arena rooms.</li>
          <li>- <strong className="text-gray-800 dark:text-gray-200">Identity:</strong> Privy email sign-in plus Circle wallet mapping on the app surfaces that need user sessions.</li>
          <li>- <strong className="text-gray-800 dark:text-gray-200">Archive contract:</strong> <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs dark:bg-gray-800">0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a</code> on 0G Mainnet.</li>
          <li>- <strong className="text-gray-800 dark:text-gray-200">SDK:</strong> <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs dark:bg-gray-800">@hashpaylink/sdk</code> for hosted checkout URLs and buttons.</li>
        </ul>
      </div>
    </DocPage>
  )
}
