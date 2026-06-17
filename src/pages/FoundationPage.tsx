import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import type { CSSProperties } from 'react'

const products = [
  {
    index: '01',
    title: 'Payment Links',
    copy: 'Create and request USDC payments with hosted checkout, QR codes, and live dashboards.',
    href: '/app',
    status: 'Live',
  },
  {
    index: '02',
    title: 'Retail POS',
    copy: 'Country-aware static QR checkout for local retail, starting with Nigeria.',
    href: '/app',
    status: 'Live',
  },
  {
    index: '03',
    title: 'PolyDesk',
    copy: 'Fund Polymarket, track positions, receive alerts, and ask LP Scout from Telegram.',
    href: '/polymarket',
    status: 'Live',
  },
  {
    index: '04',
    title: 'StreamPay',
    copy: 'Stream USDC on Arc for payroll, agentic services, and recoverable-risk Arena rooms.',
    href: '/?app=streampay',
    status: 'Live',
  },
  {
    index: '05',
    title: 'Agent Commerce',
    copy: 'Agent wallets, x402 receipts, paid service access, and 0G-verifiable activity records.',
    href: '/agent',
    status: 'Live',
  },
  {
    index: '06',
    title: 'Developer SDK',
    copy: 'Hosted checkout URLs and React buttons for teams integrating Hash PayLink.',
    href: '/docs/sdk',
    status: 'Docs',
  },
]

const stack = ['Circle USDC', 'Privy', 'Base', 'Arbitrum', 'Arc', 'Solana', '0G Storage', 'Postgres']

const proof = [
  ['0.2%', 'payment fee'],
  ['0.5%', 'Arena fee'],
  ['24/7', 'Telegram workflows'],
  ['0G', 'proof archive'],
]

function HashMark({ className = '' }: { className?: string }) {
  return <img src="/hash-logo-transparent.png" alt="Hash PayLink" className={className} />
}

function GlobeAnnotation({
  label,
  value,
  className,
  lineClassName = '',
}: {
  label: string
  value: string
  className: string
  lineClassName?: string
}) {
  return (
    <div className={`absolute rounded-xl border border-white/10 bg-black/42 px-3 py-2 text-left shadow-[0_18px_60px_rgba(0,0,0,.32)] backdrop-blur-xl ${className}`}>
      <span className={`pointer-events-none absolute top-1/2 hidden h-px bg-gradient-to-r from-transparent via-cyan-200/45 to-transparent lg:block ${lineClassName}`} />
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/75">{label}</p>
      <p className="mt-1 text-xs font-medium text-white/86">{value}</p>
    </div>
  )
}

export default function FoundationPage() {
  return (
    <main className="min-h-screen bg-[#f3f1ea] text-[#0d1117]">
      <style>{`
        @keyframes hpl-globe-pan {
          0% { transform: translate3d(-2.25%, 0, 0) scale(1.2) rotate(-6deg); }
          50% { transform: translate3d(2.25%, -1%, 0) scale(1.24) rotate(5deg); }
          100% { transform: translate3d(-2.25%, 0, 0) scale(1.2) rotate(-6deg); }
        }
        @keyframes hpl-orbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes hpl-scan {
          0%, 100% { opacity: .28; transform: translateX(-10%); }
          50% { opacity: .68; transform: translateX(10%); }
        }
        @keyframes hpl-float-in {
          from { opacity: 0; transform: translate3d(0, 18px, 0) scale(.985); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }
        .hpl-reveal {
          opacity: 0;
          transform: translate3d(0, 18px, 0) scale(.985);
          animation: hpl-float-in .78s cubic-bezier(.22, 1, .36, 1) forwards;
          animation-delay: var(--delay, 0ms);
          will-change: transform, opacity;
        }
        @media (prefers-reduced-motion: reduce) {
          .hpl-reveal,
          [data-motion="globe"],
          [data-motion="orbit"],
          [data-motion="scan"] {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>

      <section className="relative overflow-hidden bg-[#06090d] text-white">
        <div className="absolute inset-0 isolate">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] bg-[size:76px_76px] opacity-70" />
          <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,.24),transparent_58%)]" />
          <div className="absolute left-1/2 top-[43%] h-[920px] w-[920px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/[.06] blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,transparent_0,rgba(0,0,0,.22)_43%,rgba(0,0,0,.82)_100%)]" />
        </div>

        <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 sm:px-8 lg:px-10">
          <header className="mx-auto flex w-full max-w-5xl items-center justify-between rounded-xl border border-white/10 bg-white/[.045] px-3 py-2.5 backdrop-blur-xl">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[.06]">
                <HashMark className="h-5 w-5 object-contain" />
              </span>
              <span className="text-sm font-semibold tracking-tight">Hash PayLink</span>
            </Link>
            <nav className="hidden items-center gap-1 rounded-lg border border-white/8 bg-black/18 p-1 text-[11px] font-medium text-white/58 md:flex">
              <a href="#products" className="rounded-md px-3 py-1.5 transition hover:bg-white/8 hover:text-white">Products</a>
              <a href="#stack" className="rounded-md px-3 py-1.5 transition hover:bg-white/8 hover:text-white">Stack</a>
              <Link to="/docs" className="rounded-md px-3 py-1.5 transition hover:bg-white/8 hover:text-white">Developers</Link>
            </nav>
            <Link
              to="/app"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-cyan-300/35 bg-cyan-300/10 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-300/18"
            >
              Launch App
            </Link>
          </header>

          <div className="relative flex flex-1 flex-col items-center justify-center pb-14 pt-12 text-center">
            <div className="absolute left-1/2 top-[45%] h-[min(86vw,760px)] w-[min(86vw,760px)] -translate-x-1/2 -translate-y-1/2">
              <div className="absolute inset-0 rounded-full bg-cyan-300/10 blur-3xl" />
              <div data-motion="orbit" className="absolute inset-[9%] rounded-full border border-cyan-200/16" style={{ animation: 'hpl-orbit 34s linear infinite' }} />
              <div data-motion="orbit" className="absolute inset-[4%] rounded-full border border-white/8" style={{ animation: 'hpl-orbit 54s linear infinite reverse' }} />
              <div data-motion="orbit" className="absolute inset-[17%] rounded-full border border-cyan-100/10" style={{ animation: 'hpl-orbit 72s linear infinite' }} />
              <div className="absolute inset-[12%] overflow-hidden rounded-full border border-cyan-100/10 bg-black shadow-[0_0_140px_rgba(8,145,178,.34)]">
                <img
                  src="/brand/world-globe.png"
                  alt=""
                  data-motion="globe"
                  className="h-full w-full object-cover opacity-55 saturate-[.76] contrast-[1.05] will-change-transform"
                  loading="eager"
                  style={{ animation: 'hpl-globe-pan 28s ease-in-out infinite', filter: 'blur(4px) brightness(0.85)' }}
                />
                <div className="absolute inset-0 backdrop-blur-[1px]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_48%_42%,rgba(255,255,255,.07),rgba(0,0,0,.28)_42%,rgba(0,0,0,.90)_78%)]" />
                <div data-motion="scan" className="absolute left-[8%] right-[8%] top-[47%] h-px rotate-[-8deg] bg-cyan-200/55 shadow-[0_0_22px_rgba(103,232,249,.72)]" style={{ animation: 'hpl-scan 8s ease-in-out infinite' }} />
              </div>
            </div>

            <GlobeAnnotation label="Checkout" value="USDC link created" className="left-0 top-[30%] hidden lg:block" lineClassName="-right-28 w-28" />
            <GlobeAnnotation label="Agent" value="x402 receipt issued" className="right-2 top-[34%] hidden lg:block" lineClassName="-left-28 w-28" />
            <GlobeAnnotation label="Proof" value="0G record archived" className="bottom-[20%] left-[9%] hidden lg:block" lineClassName="-right-24 w-24" />
            <GlobeAnnotation label="PolyDesk" value="Portfolio alerts saved" className="bottom-[24%] right-[6%] hidden lg:block" lineClassName="-left-24 w-24" />

            <div className="hpl-reveal relative z-10 mx-auto max-w-4xl pt-28 sm:pt-36 lg:pt-28">
              <p className="text-[11px] font-semibold uppercase tracking-[0.36em] text-cyan-100/80">
                Stablecoin payment infrastructure
              </p>
              <h1 className="mt-5 text-balance text-5xl font-semibold leading-[0.94] tracking-[-0.055em] sm:text-7xl lg:text-[92px]">
                Moving USDC at product speed.
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-7 text-white/68">
                Hash PayLink powers payment links, retail POS, PolyDesk, StreamPay, and agent commerce from one non-custodial USDC platform.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  to="/app"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-5 text-sm font-semibold text-[#061014] shadow-[0_0_42px_rgba(34,211,238,.26)] transition hover:bg-cyan-200 sm:w-auto"
                >
                  Open App <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="https://t.me/HashPayLinkBot?start=polydesk"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-white/12 bg-white/[.045] px-5 text-sm font-semibold text-white/86 transition hover:bg-white/[.08] sm:w-auto"
                >
                  Open PolyDesk in Telegram
                </a>
              </div>
            </div>
          </div>

          <div className="relative z-10 grid gap-3 border-t border-white/10 py-5 sm:grid-cols-2 lg:grid-cols-4">
            {proof.map(([value, label], index) => (
              <div key={label} className="hpl-reveal rounded-lg border border-white/8 bg-white/[.035] px-4 py-3 backdrop-blur-md" style={{ '--delay': `${120 + index * 70}ms` } as CSSProperties}>
                <p className="text-2xl font-semibold tracking-tight text-white">{value}</p>
                <p className="mt-1 text-xs text-white/50">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="products" className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
        <div className="hpl-reveal mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-700">Product surface</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-gray-950 sm:text-5xl">
            One platform for USDC workflows.
          </h2>
          <p className="mt-4 text-sm leading-6 text-gray-600">
            Consumer-simple interfaces on top of verifiable settlement, agent activity, and durable payment state.
          </p>
        </div>

        <div className="mt-12 grid overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_22px_90px_rgba(15,23,42,.08)] md:grid-cols-2 lg:grid-cols-3">
          {products.map(({ index, title, copy, href, status }, cardIndex) => (
            <Link
              key={title}
              to={href}
              className="hpl-reveal group min-h-[230px] border-b border-black/10 p-6 transition duration-300 hover:-translate-y-1 hover:bg-cyan-50/55 hover:shadow-[0_24px_70px_rgba(8,145,178,.10)] md:border-r lg:[&:nth-child(3n)]:border-r-0 [&:nth-last-child(-n+3)]:lg:border-b-0"
              style={{ '--delay': `${cardIndex * 80}ms` } as CSSProperties}
            >
              <div className="flex items-start justify-between gap-4">
                <span className="text-xs font-semibold tracking-[0.22em] text-gray-400">{index}</span>
                <span className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-500">
                  {status}
                </span>
              </div>
              <h3 className="mt-10 text-xl font-semibold tracking-[-0.025em] text-gray-950">{title}</h3>
              <p className="mt-3 max-w-sm text-sm leading-6 text-gray-600">{copy}</p>
              <div className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-700">
                Open <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section id="stack" className="bg-[#0b0e12] px-5 py-20 text-white sm:px-8 lg:px-10">
        <div className="mx-auto grid w-full max-w-7xl gap-12 lg:grid-cols-[.82fr_1.18fr]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">Infrastructure stack</p>
            <h2 className="mt-3 max-w-xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Built on rails people already trust.
            </h2>
            <p className="mt-5 max-w-xl text-sm leading-6 text-white/58">
              Circle handles USDC and wallet infrastructure, Privy handles email-first sessions, Arc supports StreamPay settlement, 0G archives proofs, and Polymarket public APIs power PolyDesk context.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {stack.map((item, index) => (
              <div key={item} className="hpl-reveal rounded-xl border border-white/10 bg-white/[.04] px-5 py-4 transition duration-300 hover:-translate-y-0.5 hover:border-cyan-200/28 hover:bg-white/[.065]" style={{ '--delay': `${index * 55}ms` } as CSSProperties}>
                <p className="text-sm font-semibold text-white">{item}</p>
                <p className="mt-2 text-xs leading-5 text-white/48">Used only where it belongs in the product flow.</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_.82fr] lg:px-10">
        <div className="rounded-2xl border border-black/10 bg-white p-7 shadow-[0_18px_60px_rgba(15,23,42,.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-700">Developer path</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-gray-950">Integrate hosted checkout first.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-600">
            The SDK builds Hash PayLink checkout URLs and React buttons. Wallet execution stays inside the hosted app so integrators do not duplicate relayers, smart-wallet sessions, or 0G archive logic.
          </p>
          <Link
            to="/docs/sdk"
            className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-semibold text-white transition hover:bg-gray-800"
          >
            Developer docs <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="rounded-2xl border border-cyan-900/15 bg-cyan-50 p-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-700">Start here</p>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-gray-950">Open the working app.</h3>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            Create payment links, open POS, enter PolyDesk, or launch StreamPay from the app surface.
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
