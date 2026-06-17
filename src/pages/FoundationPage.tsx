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

const partnerRail = [
  { name: 'Circle', logo: '/brand/circle-logo.jpeg' },
  { name: 'Privy', logo: '/brand/privy-logo.jpeg' },
  { name: 'Base', logo: '/brand/base-logo.jpeg' },
  { name: 'Arbitrum', logo: '/brand/arbitrum-logo.jpeg' },
  { name: 'Arc', logo: '/brand/arc-logo.jpeg' },
  { name: 'Solana', logo: '/brand/solana-logo.jpeg' },
  { name: '0G', logo: '/brand/0g-logo.jpeg' },
  { name: 'Polymarket', logo: '/brand/polymarket-logo.png' },
  { name: 'Telegram', logo: '/brand/telegram-logo.jpeg' },
  { name: 'WhatsApp', logo: '/brand/whatsapp-logo.jpeg' },
  { name: 'Meta', logo: '/brand/meta-logo.jpeg' },
]

function HashMark({ className = '' }: { className?: string }) {
  return <img src="/hash-logo.png" alt="Hash PayLink" className={className} />
}

function ProductSignal({
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
        @keyframes hpl-globe-drift {
          0% { transform: translate3d(-50%, -50%, 0) scale(1.04) rotate(-1deg); }
          50% { transform: translate3d(-49%, -51%, 0) scale(1.08) rotate(1deg); }
          100% { transform: translate3d(-50%, -50%, 0) scale(1.04) rotate(-1deg); }
        }
        @keyframes hpl-rail {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-50%, 0, 0); }
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
          [data-motion="globe-bg"],
          [data-motion="rail"] {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>

      <section className="relative overflow-hidden bg-[#06090d] text-white">
        <div className="absolute inset-0 isolate">
          <img
            src="/brand/world-globe.png"
            alt=""
            data-motion="globe-bg"
            className="absolute left-1/2 top-[45%] h-[980px] w-[980px] max-w-none rounded-full object-cover opacity-34 saturate-[.78]"
            style={{ animation: 'hpl-globe-drift 36s ease-in-out infinite', filter: 'blur(5px) brightness(0.55)' }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:84px_84px] opacity-50" />
          <div className="absolute inset-x-0 top-0 h-[540px] bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,.16),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_43%,rgba(6,182,212,.08)_0,rgba(0,0,0,.12)_36%,rgba(0,0,0,.86)_100%)]" />
        </div>

        <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 sm:px-8 lg:px-10">
          <header className="sticky top-5 z-30 mx-auto grid w-full max-w-6xl grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-white/10 bg-[#070b10]/80 px-3 py-2.5 shadow-[0_18px_80px_rgba(0,0,0,.24)] backdrop-blur-xl md:grid-cols-[1fr_auto_1fr]">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[.06]">
                <HashMark className="h-5 w-5 object-contain invert mix-blend-screen" />
              </span>
              <span className="text-sm font-semibold tracking-tight">Hash PayLink</span>
            </Link>
            <nav className="order-3 col-span-2 flex items-center justify-center gap-1 overflow-x-auto rounded-lg border border-white/8 bg-black/18 p-1 text-[11px] font-medium text-white/58 md:order-none md:col-span-1">
              <a href="#products" className="rounded-md px-3 py-1.5 transition hover:bg-white/8 hover:text-white">Products</a>
              <a href="#stack" className="rounded-md px-3 py-1.5 transition hover:bg-white/8 hover:text-white">Stack</a>
              <Link to="/docs" className="rounded-md px-3 py-1.5 transition hover:bg-white/8 hover:text-white">Developers</Link>
              <a href="#about" className="rounded-md px-3 py-1.5 transition hover:bg-white/8 hover:text-white">About</a>
              <a href="#contact" className="rounded-md px-3 py-1.5 transition hover:bg-white/8 hover:text-white">Contact</a>
            </nav>
            <Link
              to="/app"
              className="justify-self-end inline-flex h-9 items-center justify-center rounded-lg border border-cyan-300/35 bg-cyan-300/10 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-300/18"
            >
              Launch App
            </Link>
          </header>

          <div className="relative grid flex-1 items-center gap-10 pb-14 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(420px,540px)] lg:pt-16">
            <div className="hpl-reveal relative z-10 max-w-2xl text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.36em] text-cyan-100/80">
                Stablecoin payment infrastructure
              </p>
              <h1 className="mt-5 text-balance text-5xl font-semibold leading-[0.94] tracking-[-0.055em] sm:text-7xl lg:text-[86px]">
                Moving USDC at product speed.
              </h1>
              <p className="mt-6 max-w-xl text-[15px] leading-7 text-white/68">
                Hash PayLink powers payment links, retail POS, PolyDesk, StreamPay, and agent commerce from one non-custodial USDC platform.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
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

            <div className="relative mx-auto h-[430px] w-full max-w-[540px] lg:h-[520px]">
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[min(78vw,460px)] w-[min(78vw,460px)] -translate-x-1/2 -translate-y-1/2">
              <div className="absolute inset-0 rounded-full bg-cyan-300/10 blur-3xl" />
              <div className="absolute inset-[12%] rounded-full border border-cyan-200/14" />
              <div className="absolute inset-[2%] rounded-full border border-white/7" />
              <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/12 bg-[#071014] shadow-[inset_-24px_-28px_54px_rgba(0,0,0,.72),inset_14px_14px_34px_rgba(255,255,255,.08),0_0_90px_rgba(34,211,238,.26)] sm:h-56 sm:w-56">
                <div
                  className="absolute inset-0 rounded-full opacity-90"
                  style={{
                    backgroundImage: 'url(/hash-logo-modal-light.png)',
                    backgroundSize: '82px 82px',
                    backgroundRepeat: 'repeat',
                    boxShadow: 'inset 24px 0 42px rgba(255,255,255,.08), inset -42px -10px 62px rgba(0,0,0,.72)',
                  }}
                />
                <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_32%_26%,rgba(255,255,255,.20),transparent_26%),radial-gradient(circle_at_70%_78%,rgba(8,145,178,.18),transparent_35%)]" />
                <div className="absolute left-[18%] right-[18%] top-[49%] h-px rotate-[-7deg] bg-cyan-200/45 shadow-[0_0_18px_rgba(103,232,249,.55)]" />
              </div>
            </div>

              <ProductSignal label="Checkout" value="USDC link created" className="left-0 top-[18%] hidden sm:block" lineClassName="-right-16 w-16" />
              <ProductSignal label="Agent" value="x402 receipt issued" className="right-0 top-[22%] hidden sm:block" lineClassName="-left-16 w-16" />
              <ProductSignal label="Proof" value="0G record archived" className="bottom-[18%] left-[6%] hidden sm:block" lineClassName="-right-14 w-14" />
              <ProductSignal label="PolyDesk" value="Portfolio alerts saved" className="bottom-[20%] right-[4%] hidden sm:block" lineClassName="-left-14 w-14" />
            </div>
          </div>

          <div className="relative z-10 overflow-hidden border-y border-white/10 py-4">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-[#06090d] to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-[#06090d] to-transparent" />
            <div data-motion="rail" className="flex w-max items-center gap-10 opacity-80" style={{ animation: 'hpl-rail 32s linear infinite' }}>
              {[...partnerRail, ...partnerRail].map((partner, index) => (
                <div key={`${partner.name}-${index}`} className="flex min-w-max items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/50">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[.045]">
                    <img src={partner.logo} alt="" className="h-5 w-5 rounded-full object-contain opacity-85" />
                  </span>
                  <span>{partner.name}</span>
                </div>
              ))}
            </div>
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

      <section id="about" className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_.82fr] lg:px-10">
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

      <footer id="contact" className="border-t border-black/10 px-5 py-8 sm:px-8 lg:px-10">
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
