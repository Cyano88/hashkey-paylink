import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  Code2,
  Database,
  Link2,
  MessageCircle,
  Radio,
  ShieldCheck,
  Store,
  WalletCards,
  Zap,
} from 'lucide-react'

const products = [
  {
    icon: Link2,
    title: 'Payment Links',
    copy: 'Create and request USDC payments with hosted checkout, QR codes, and live dashboards.',
    href: '/app',
    status: 'Live',
  },
  {
    icon: Store,
    title: 'Retail POS',
    copy: 'Country-aware POS flows for static QR checkout, starting with Nigeria and USDC settlement paths.',
    href: '/app',
    status: 'Live',
  },
  {
    icon: MessageCircle,
    title: 'PolyDesk',
    copy: 'Fund Polymarket, track positions, receive alerts, and ask LP Scout from Telegram.',
    href: '/polymarket',
    status: 'Live',
  },
  {
    icon: Radio,
    title: 'StreamPay',
    copy: 'Stream USDC on Arc for payroll, agentic services, and recoverable-risk Arena rooms.',
    href: '/?app=streampay',
    status: 'Live',
  },
  {
    icon: Bot,
    title: 'Agent Commerce',
    copy: 'Agent wallets, x402 receipts, paid service access, and 0G-verifiable activity records.',
    href: '/agent',
    status: 'Live',
  },
  {
    icon: Code2,
    title: 'Developer SDK',
    copy: 'Hosted checkout URLs and React buttons for teams that want Hash PayLink inside their own product.',
    href: '/docs/sdk',
    status: 'Docs',
  },
]

const stack = ['Circle USDC', 'Privy sign-in', 'Arc Network', '0G Storage', 'Polymarket APIs', 'Postgres state']

const metrics = [
  ['0.2%', 'standard payment fee'],
  ['0.5%', 'Arena room fee'],
  ['6', 'supported payment rails'],
  ['24/7', 'Telegram-first workflows'],
]

const proofCards = [
  {
    icon: WalletCards,
    title: 'Consumer checkout',
    copy: 'Payers can use hosted checkout, QR codes, or send-via-address flows without learning payment infrastructure.',
  },
  {
    icon: ShieldCheck,
    title: 'Non-custodial settlement',
    copy: 'Funds route to recipient wallets or dedicated escrow contracts; Hash PayLink does not custody merchant funds.',
  },
  {
    icon: Database,
    title: '0G proof layer',
    copy: 'Payment and agent activity records can be archived to 0G for verifiable receipts and agent-readable memory.',
  },
]

function HashMark({ className = '' }: { className?: string }) {
  return (
    <img
      src="/hash-logo-transparent.png"
      alt="Hash PayLink"
      className={className}
    />
  )
}

export default function FoundationPage() {
  return (
    <main className="min-h-screen bg-[#f4f2ec] text-[#0d1117]">
      <section className="relative overflow-hidden bg-[#070b0f] text-white">
        <div className="absolute inset-0 opacity-70">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.045)_1px,transparent_1px)] bg-[size:72px_72px]" />
          <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_50%_20%,rgba(14,165,233,.32),transparent_54%)]" />
          <div className="absolute inset-x-0 bottom-0 h-72 bg-[linear-gradient(180deg,transparent,rgba(20,184,166,.12))]" />
        </div>

        <div className="relative mx-auto flex min-h-[88vh] w-full max-w-7xl flex-col px-5 py-5 sm:px-8 lg:px-10">
          <header className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 backdrop-blur-md">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[.06]">
                <HashMark className="h-5 w-5 object-contain" />
              </span>
              <span className="text-sm font-semibold tracking-tight">Hash PayLink</span>
            </Link>
            <nav className="hidden items-center gap-6 text-xs font-medium text-white/62 md:flex">
              <a href="#products" className="transition hover:text-white">Products</a>
              <a href="#stack" className="transition hover:text-white">Stack</a>
              <Link to="/docs" className="transition hover:text-white">Developers</Link>
            </nav>
            <Link
              to="/app"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-cyan-300/35 bg-cyan-300/10 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-200 transition hover:bg-cyan-300/18"
            >
              Open App
            </Link>
          </header>

          <div className="grid flex-1 items-center gap-10 py-16 lg:grid-cols-[1.02fr_.98fr] lg:py-20">
            <div className="mx-auto max-w-3xl text-center lg:mx-0 lg:text-left">
              <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.34em] text-cyan-200/80">
                Programmable USDC payments
              </p>
              <h1 className="text-balance text-5xl font-semibold leading-[0.95] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
                Stablecoin payments for real product workflows.
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-white/66 lg:mx-0">
                Hash PayLink powers payment links, retail POS, PolyDesk, StreamPay, and agent commerce from one non-custodial USDC platform.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                <Link
                  to="/app"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-5 text-sm font-semibold text-[#061014] shadow-[0_0_34px_rgba(34,211,238,.26)] transition hover:bg-cyan-200 sm:w-auto"
                >
                  Open App <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="https://t.me/HashPayLinkBot?start=polydesk"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-white/12 bg-white/[.04] px-5 text-sm font-semibold text-white/86 transition hover:bg-white/[.07] sm:w-auto"
                >
                  Open PolyDesk in Telegram
                </a>
              </div>
            </div>

            <div className="relative mx-auto aspect-square w-full max-w-[560px]">
              <div className="absolute inset-6 rounded-full border border-cyan-200/10 bg-[radial-gradient(circle_at_45%_35%,rgba(103,232,249,.28),rgba(8,47,73,.28)_34%,rgba(2,6,23,.96)_68%)] shadow-[0_0_90px_rgba(8,145,178,.32)]" />
              <div className="absolute inset-[17%] rounded-full border border-cyan-200/20" />
              <div className="absolute left-[6%] right-[4%] top-[38%] h-px rotate-[-8deg] bg-cyan-200/60 shadow-[0_0_18px_rgba(103,232,249,.8)]" />
              <div className="absolute left-[18%] top-[28%] rounded-xl border border-white/10 bg-white/[.06] px-3 py-2 text-xs text-white/70 backdrop-blur-md">
                USDC link created
              </div>
              <div className="absolute bottom-[21%] right-[7%] rounded-xl border border-cyan-200/20 bg-cyan-200/10 px-3 py-2 text-xs text-cyan-100 backdrop-blur-md">
                0G proof archived
              </div>
              <div className="absolute bottom-[13%] left-[12%] rounded-xl border border-white/10 bg-white/[.06] px-3 py-2 text-xs text-white/70 backdrop-blur-md">
                x402 receipt
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-white/12 bg-black/30 backdrop-blur-md">
                  <HashMark className="h-12 w-12 object-contain" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 border-t border-white/10 py-5 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map(([value, label]) => (
              <div key={label} className="rounded-lg border border-white/8 bg-white/[.035] px-4 py-3">
                <p className="text-2xl font-semibold tracking-tight text-white">{value}</p>
                <p className="mt-1 text-xs text-white/50">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="products" className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-700">Product surface</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-0.035em] text-gray-950 sm:text-5xl">
            One platform. Several payment workflows.
          </h2>
          <p className="mt-4 text-sm leading-6 text-gray-600">
            Each module is designed to feel simple for consumers while keeping the settlement path verifiable and infrastructure-grade.
          </p>
        </div>

        <div className="mt-12 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {products.map(({ icon: Icon, title, copy, href, status }) => (
            <Link
              key={title}
              to={href}
              className="group min-h-[210px] rounded-xl border border-black/10 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,.06)] transition hover:-translate-y-0.5 hover:border-cyan-700/30 hover:shadow-[0_24px_80px_rgba(15,23,42,.10)]"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-950 text-white">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-500">
                  {status}
                </span>
              </div>
              <h3 className="mt-8 text-xl font-semibold tracking-[-0.02em] text-gray-950">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-gray-600">{copy}</p>
              <div className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-700">
                Open <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section id="stack" className="bg-[#0b0e12] px-5 py-20 text-white sm:px-8 lg:px-10">
        <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[.85fr_1.15fr]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">Infrastructure stack</p>
            <h2 className="mt-3 max-w-xl text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
              Built on proven rails, exposed through simple flows.
            </h2>
            <p className="mt-5 max-w-xl text-sm leading-6 text-white/58">
              Hash PayLink uses ecosystem infrastructure where it belongs: Circle for USDC and wallets, Privy for sign-in, Arc for streaming settlement, 0G for durable proofs, and Polymarket public APIs for PolyDesk context.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {stack.map((item) => (
                <span key={item} className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-xs text-white/70">
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {proofCards.map(({ icon: Icon, title, copy }) => (
              <div key={title} className="rounded-xl border border-white/10 bg-white/[.04] p-5">
                <Icon className="h-5 w-5 text-cyan-200" />
                <h3 className="mt-7 text-base font-semibold">{title}</h3>
                <p className="mt-3 text-xs leading-5 text-white/52">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_.8fr] lg:px-10">
        <div className="rounded-2xl border border-black/10 bg-white p-7 shadow-[0_18px_60px_rgba(15,23,42,.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-700">Developer path</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-gray-950">Integrate hosted checkout first.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-600">
            The SDK currently focuses on hosted Hash PayLink checkout URLs and React buttons. Wallet execution remains inside the hosted app so integrators do not duplicate relayers, smart-wallet sessions, or 0G archive logic.
          </p>
          <Link
            to="/docs/sdk"
            className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-semibold text-white transition hover:bg-gray-800"
          >
            Developer docs <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="rounded-2xl border border-cyan-900/15 bg-cyan-50 p-7">
          <Zap className="h-5 w-5 text-cyan-700" />
          <h3 className="mt-7 text-2xl font-semibold tracking-[-0.03em] text-gray-950">Start with the app.</h3>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            Create payment links, open POS, enter PolyDesk, or launch StreamPay from the working app surface.
          </p>
          <Link
            to="/app"
            className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-cyan-700 px-4 text-sm font-semibold text-white transition hover:bg-cyan-800"
          >
            Open App <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-black/10 px-5 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <p>Hash PayLink | Programmable USDC payment workflows.</p>
          <div className="flex gap-4">
            <Link to="/docs" className="hover:text-gray-900">Docs</Link>
            <Link to="/app" className="hover:text-gray-900">App</Link>
            <a href="https://t.me/HashPayLinkBot" target="_blank" rel="noreferrer" className="hover:text-gray-900">Telegram</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
