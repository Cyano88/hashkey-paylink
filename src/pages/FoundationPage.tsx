import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

const products = [
  {
    index: '01',
    title: 'Payment Links',
    copy: 'Create a USDC link, share it anywhere, and track every payment in one place.',
    href: '/app?product=payment',
  },
  {
    index: '02',
    title: 'Retail POS',
    copy: 'Turn any shop counter into a simple USDC checkout with one reusable QR.',
    href: '/app?product=pos',
  },
  {
    index: '03',
    title: 'PolyDesk',
    copy: 'Fund Polymarket, watch your positions, and get helpful alerts from Telegram.',
    href: '/app?product=polymarket',
  },
  {
    index: '04',
    title: 'StreamPay',
    copy: 'Stream USDC on Arc for work, agent access, and recoverable-risk Arena games.',
    href: '/app?product=streampay',
  },
  {
    index: '05',
    title: 'Agent Commerce',
    copy: 'Let agents pay, receive, unlock services, and keep clear proof of every action.',
    href: '/app?product=agent',
  },
  {
    index: '06',
    title: 'Developer SDK',
    copy: 'Add Hash PayLink checkout to your app with hosted links and React buttons.',
    href: '/docs/sdk',
  },
]

const stack = [
  {
    name: 'Circle USDC',
    copy: 'Core payment rail for USDC checkout, gasless smart-wallet sessions, balances, and receipts.',
  },
  {
    name: 'Arc',
    copy: 'Core settlement rail for StreamPay and Arena, where USDC moves over time instead of as one static transfer.',
  },
  {
    name: '0G Storage',
    copy: 'Core proof rail for archiving payment receipts, agent activity, and durable verification records.',
  },
  {
    name: 'Privy',
    copy: 'Infrastructure partner for email-first sessions across payment, funding, and StreamPay flows.',
  },
  {
    name: 'Base',
    copy: 'Infrastructure partner for low-cost EVM USDC payments, agent treasury flows, and x402 settlement.',
  },
  {
    name: 'Arbitrum',
    copy: 'Infrastructure partner extending Hash PayLink checkout to another major EVM network.',
  },
  {
    name: 'Solana',
    copy: 'Infrastructure partner for fast USDC payment coverage across Solana wallets and exchanges.',
  },
  {
    name: 'Polymarket',
    copy: 'Product data partner for PolyDesk funding, portfolio context, World Cup markets, and LP Scout workflows.',
  },
]

const proofStats = [
  {
    label: 'Fee tracking',
    value: 'DeFiLlama',
    href: 'https://defillama.com/protocol/hash-paylink',
  },
  {
    label: 'Live surfaces',
    value: '6 workflows',
    href: '/app',
  },
  {
    label: 'Proof archive',
    value: '0G Storage',
    href: '/docs/0g-storage',
  },
  {
    label: 'Wallet stack',
    value: 'Circle · Arc · 0G',
    href: '/docs/wallets',
  },
]

const demoFlows = [
  {
    stack: 'Circle',
    title: 'USDC checkout and wallet sessions',
    copy: 'Email-first wallet access, USDC checkout, receipts, and agent payment flows.',
    href: '/app?product=payment',
    videoUrl: '',
  },
  {
    stack: '0G',
    title: 'Verifiable payment records',
    copy: 'Payment receipts, agent activity, and proof records archived for durable verification.',
    href: '/docs/0g-storage',
    videoUrl: '',
  },
  {
    stack: 'Arc',
    title: 'StreamPay and Arena settlement',
    copy: 'USDC streams and recoverable-risk game rooms use Arc as the streaming settlement layer.',
    href: '/app?product=streampay',
    videoUrl: '',
  },
  {
    stack: 'Polymarket',
    title: 'PolyDesk from Telegram',
    copy: 'Fund accounts, track positions, receive alerts, and ask LP Scout from one chat surface.',
    href: '/app?product=polymarket',
    videoUrl: '',
  },
  {
    stack: 'Telegram',
    title: 'Chat-native payment workflows',
    copy: 'Payment links, agents, PolyDesk, and StreamPay flows open where users already coordinate.',
    href: 'https://t.me/HashPayLinkBot',
    videoUrl: '',
  },
  {
    stack: 'Retail POS',
    title: 'Static QR checkout for stores',
    copy: 'Country-aware merchant QR flows start in Africa and expand by verified local partners.',
    href: '/app?product=pos',
    videoUrl: '',
  },
]

const partnerRail = [
  { name: 'Circle', logo: '/brand/circle-logo.jpeg' },
  { name: 'Arc', logo: '/brand/arc-logo.jpeg' },
  { name: '0G', logo: '/brand/0g-logo.jpeg' },
  { name: 'Privy', logo: '/brand/privy-logo.jpeg' },
  { name: 'Base', logo: '/brand/base-logo.jpeg' },
  { name: 'Arbitrum', logo: '/brand/arbitrum-logo.jpeg' },
  { name: 'Solana', logo: '/brand/solana-logo.jpeg' },
  { name: 'Polymarket', logo: '/brand/polymarket-logo.png' },
  { name: 'Telegram', logo: '/brand/telegram-logo.jpeg' },
  { name: 'WhatsApp', logo: '/brand/whatsapp-logo.jpeg' },
  { name: 'Meta', logo: '/brand/meta-logo.jpeg' },
]

const faqs = [
  {
    question: 'What is Hash PayLink?',
    answer:
      'Hash PayLink is a non-custodial USDC payment platform for payment links, retail POS, PolyDesk, StreamPay, and agent commerce. It gives users simple checkout surfaces while keeping settlement, receipts, and proof records verifiable.',
  },
  {
    question: 'Does Hash PayLink custody user funds?',
    answer:
      'No. The platform focuses on hosted payment workflows, wallet sessions, payment routing, receipts, and proof layers. Users pay into their selected wallet, agent wallet, merchant wallet, or configured service flow.',
  },
  {
    question: 'Why do Circle, Arc, and 0G matter?',
    answer:
      'Circle powers the USDC and smart-wallet payment experience, Arc gives StreamPay a programmable settlement surface, and 0G provides durable proof records for receipts and agent activity. Together they make Hash PayLink feel simple for users while keeping the payment state verifiable.',
  },
  {
    question: 'Where does 0G fit into the platform?',
    answer:
      '0G is used for durable proof records. Payment receipts, agent activity, and important workflow records can be archived so ecosystem teams and users can verify what happened after the payment flow completes.',
  },
  {
    question: 'Why build StreamPay and Arena on Arc?',
    answer:
      'Arc is a strong fit for real-time USDC flows because StreamPay needs fast settlement, low-friction wallet actions, and predictable payment state. Hash PayLink uses Arc for streaming access, payroll-style payouts, and recoverable-risk Arena rooms where USDC moves over time instead of as a single static transfer.',
  },
  {
    question: 'What traction does Hash PayLink have?',
    answer:
      'Hash PayLink is already live with real USDC workflows, fee tracking on DeFiLlama, and retail rollout evidence across Africa. The platform has processed over $50,000 in volume within weeks of launch and onboarded more than 100 users into Circle smart-wallet USDC checkout flows.',
  },
  {
    question: 'Why does the chat layer matter?',
    answer:
      'Payments often start inside conversations, not dashboards. Telegram gives Hash PayLink a distribution layer for saved alerts, payment requests, PolyDesk, agent actions, and StreamPay flows where users already coordinate. It reduces friction without forcing every user into a complex crypto app first.',
  },
  {
    question: 'What is PolyDesk?',
    answer:
      'PolyDesk is the Polymarket-focused surface inside Hash PayLink. It helps users fund Polymarket, track positions, receive alerts, and use LP Scout from Telegram-first workflows.',
  },
]

function HashMark({ className = '' }: { className?: string }) {
  return <img src="/hash-logo.png" alt="Hash PayLink" className={className} />
}

export default function FoundationPage() {
  const pageRef = useRef<HTMLElement | null>(null)
  const modernAppSectionRef = useRef<HTMLElement | null>(null)
  const retailSectionRef = useRef<HTMLElement | null>(null)
  const faqAnswerRefs = useRef<Array<HTMLDivElement | null>>([])
  const [openFaq, setOpenFaq] = useState(0)
  const [faqHeights, setFaqHeights] = useState<number[]>([])

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
  }, [])

  useEffect(() => {
    const page = pageRef.current
    if (!page) return

    const scroller = page.querySelector('.hpl-snap-shell')
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const compactText = window.matchMedia('(max-width: 640px)').matches
    const textBlocks = Array.from(
      page.querySelectorAll<HTMLElement>(
        '.hpl-snap-section h1, .hpl-snap-section h2, .hpl-snap-section h3, .hpl-snap-section p, .hpl-snap-section li, .scroll-reveal-text',
      ),
    ).filter((element) => !element.closest('.phone-screen') && !element.closest('[data-no-text-reveal]'))

    if (reduceMotion || compactText) {
      textBlocks.forEach((element) => element.classList.add('scroll-reveal-text'))
      return
    }

    const restoreTargets: Array<{ element: HTMLElement; html: string; ariaLabel: string | null }> = []

    const ctx = gsap.context(() => {
      textBlocks.forEach((element) => {
        if (element.dataset.revealSplit === 'true') return

        const originalText = element.textContent || ''
        if (!originalText.trim()) return

        restoreTargets.push({ element, html: element.innerHTML, ariaLabel: element.getAttribute('aria-label') })
        element.classList.add('scroll-reveal-text')
        element.dataset.revealSplit = 'true'
        element.setAttribute('aria-label', originalText.trim())
        const parts = originalText.match(/\S+|\s+/g) || []
        element.innerHTML = parts
          .map((part) => {
            const safePart = part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            return part.trim()
              ? `<span class="scroll-reveal-word" aria-hidden="true">${safePart}</span>`
              : safePart
          })
          .join('')

        const words = element.querySelectorAll('.scroll-reveal-word')
        gsap.fromTo(
          words,
          {
            opacity: 0,
            y: 18,
            filter: 'blur(7px)',
            force3D: true,
          },
          {
            scrollTrigger: {
              trigger: element,
              scroller,
              start: 'top 86%',
              toggleActions: 'play none none none',
              once: true,
            },
            opacity: 1,
            y: 0,
            filter: 'blur(0px)',
            stagger: 0.035,
            duration: 0.88,
            ease: 'power3.out',
            force3D: true,
          },
        )
      })
    }, page)

    ScrollTrigger.refresh()

    return () => {
      ctx.revert()
      restoreTargets.forEach(({ element, html, ariaLabel }) => {
        element.innerHTML = html
        element.classList.remove('scroll-reveal-text')
        delete element.dataset.revealSplit
        if (ariaLabel) {
          element.setAttribute('aria-label', ariaLabel)
        } else {
          element.removeAttribute('aria-label')
        }
      })
    }
  }, [])

  useEffect(() => {
    const section = modernAppSectionRef.current
    if (!section) return

    const scroller = section.closest('.hpl-snap-shell')

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isMobile = window.matchMedia('(max-width: 640px)').matches
    const isTablet = window.matchMedia('(max-width: 1023px)').matches

    const finalPrimary = isMobile
      ? 'rotate(-6deg) translate3d(42px, 0px, 56px)'
      : isTablet
        ? 'rotate(-7deg) translate3d(42px, 0px, 72px)'
        : 'rotate(-8deg) translate3d(36px, 2px, 72px)'
    const finalSecondary = isMobile
      ? 'rotate(8deg) translate3d(-46px, 34px, 0px) scale(.86)'
      : isTablet
        ? 'rotate(9deg) translate3d(-70px, 42px, 0px) scale(.88)'
        : 'rotate(10deg) translate3d(-94px, 44px, 0px) scale(.92)'
    const hiddenPrimary = isMobile
      ? 'rotate(-18deg) translate3d(86px, 96px, 56px) scale(.94)'
      : 'rotate(-20deg) translate3d(110px, 132px, 72px) scale(.94)'
    const hiddenSecondary = isMobile
      ? 'rotate(20deg) translate3d(-94px, 104px, 0px) scale(.78)'
      : 'rotate(24deg) translate3d(-190px, 156px, 0px) scale(.84)'

    const ctx = gsap.context(() => {
      const primary = section.querySelector('.phone-primary')
      const secondary = section.querySelector('.phone-secondary')
      if (!primary || !secondary) return

      if (reduceMotion) {
        gsap.set([primary, secondary], { opacity: 1 })
        gsap.set(primary, { transform: finalPrimary })
        gsap.set(secondary, { transform: finalSecondary })
        return
      }

      gsap.set(primary, { opacity: 0, transform: hiddenPrimary })
      gsap.set(secondary, { opacity: 0, transform: hiddenSecondary })

      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          scroller,
          start: 'top 72%',
          toggleActions: 'play none none reverse',
        },
      })

      timeline
        .to(primary, {
          opacity: 1,
          transform: finalPrimary,
          duration: 1.55,
          ease: 'power4.out',
        }, 0)
        .to(secondary, {
          opacity: 0.86,
          transform: finalSecondary,
          duration: 1.55,
          ease: 'power4.out',
        }, 0.28)
    }, section)

    ScrollTrigger.refresh()
    return () => ctx.revert()
  }, [])

  useEffect(() => {
    const section = retailSectionRef.current
    if (!section) return

    const scroller = section.closest('.hpl-snap-shell')
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const ctx = gsap.context(() => {
      const items = section.querySelectorAll('.retail-motion')
      if (!items.length) return

      if (reduceMotion) {
        gsap.set(items, { opacity: 1, y: 0, scale: 1 })
        return
      }

      gsap.fromTo(
        items,
        {
          opacity: 0,
          y: 86,
          scale: 0.94,
          filter: 'blur(10px)',
          force3D: true,
        },
        {
          scrollTrigger: {
            trigger: section,
            scroller,
            start: 'top 72%',
            toggleActions: 'play none none reverse',
          },
          opacity: 1,
          y: 0,
          scale: 1,
          filter: 'blur(0px)',
          duration: 1.45,
          stagger: 0.16,
          ease: 'power4.out',
          force3D: true,
        },
      )
    }, section)

    ScrollTrigger.refresh()
    return () => ctx.revert()
  }, [])

  useEffect(() => {
    const measureFaqs = () => {
      setFaqHeights(faqAnswerRefs.current.map((answer) => answer?.scrollHeight || 0))
    }

    measureFaqs()
    window.addEventListener('resize', measureFaqs)
    const timeout = window.setTimeout(measureFaqs, 450)

    return () => {
      window.removeEventListener('resize', measureFaqs)
      window.clearTimeout(timeout)
    }
  }, [])

  return (
    <main ref={pageRef} className="min-h-screen bg-[#f7f6f2] text-[#0d1117]">
      <style>{`
        @keyframes hpl-globe-drift {
          0%, 100% { transform: translate3d(-50%, -50%, 0) scale(1.04); }
          50% { transform: translate3d(-50%, -50.35%, 0) scale(1.055); }
        }
        @keyframes hpl-globe-surface {
          from { background-position: 0% 50%; transform: translate3d(0, 0, 0) scale(1.08); }
          to { background-position: 200% 50%; transform: translate3d(0, 0, 0) scale(1.08); }
        }
        @keyframes hpl-rail {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-50%, 0, 0); }
        }
        @keyframes hpl-usdc-wave {
          0% { transform: translate3d(0, -0.8%, 0) scale(1.03); }
          50% { transform: translate3d(-5%, 0.8%, 0) scale(1.035); }
          100% { transform: translate3d(-10%, -0.8%, 0) scale(1.03); }
        }
        @keyframes hpl-float-in {
          from { opacity: 0; transform: translate3d(0, 18px, 0) scale(.985); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }
        @keyframes hpl-orbit-word {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(var(--rotate)); }
          50% { transform: translate3d(0, -16px, 0) rotate(var(--rotate)); }
        }
        @keyframes hpl-orbit-coin {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(var(--rotate)) scale(1); }
          50% { transform: translate3d(0, -20px, 0) rotate(var(--rotate)) scale(1.035); }
        }
        @keyframes hpl-hero-orbit {
          from { transform: translate(-50%, -50%) rotate(var(--start)); }
          to { transform: translate(-50%, -50%) rotate(calc(var(--start) + 360deg)); }
        }
        @keyframes hpl-skyline-drift {
          0%, 100% { transform: translate3d(0, 0, 0); opacity: .64; }
          50% { transform: translate3d(-1.4%, -1.1%, 0); opacity: .82; }
        }
        @keyframes hpl-retail-sheen {
          0% { transform: translate3d(-120%, 0, 0) rotate(10deg); opacity: 0; }
          18% { opacity: .26; }
          45% { opacity: .14; }
          100% { transform: translate3d(160%, 0, 0) rotate(10deg); opacity: 0; }
        }
        @keyframes hpl-core-rail-swap {
          0%, 100% { transform: translateX(-50%) translate3d(var(--x-start), 0, 0); }
          33% { transform: translateX(-50%) translate3d(var(--x-mid), 0, 0); }
          66% { transform: translateX(-50%) translate3d(var(--x-end), 0, 0); }
        }
        .hpl-reveal {
          opacity: 0;
          transform: translate3d(0, 18px, 0) scale(.985);
          animation: hpl-float-in .78s cubic-bezier(.22, 1, .36, 1) forwards;
          animation-delay: var(--delay, 0ms);
          will-change: transform, opacity;
        }
        .scroll-reveal-text {
          font-kerning: none;
        }
        .scroll-reveal-word {
          display: inline-block;
          white-space: normal;
          will-change: transform, opacity, filter;
          transform: translateZ(0);
          backface-visibility: hidden;
        }
        .hpl-snap-shell {
          height: 100vh;
          overflow-y: auto;
          scroll-behavior: smooth;
          scroll-snap-type: y mandatory;
          scrollbar-width: none;
        }
        .hpl-snap-shell::-webkit-scrollbar {
          display: none;
        }
        .hpl-snap-section {
          min-height: 100vh;
          scroll-snap-align: start;
          scroll-snap-stop: always;
        }
        .phone-stage {
          min-height: 640px;
          perspective: 1200px;
        }
        .phone-mockup {
          position: relative;
          width: min(280px, 43vw);
          height: min(560px, 86vw);
          min-width: 188px;
          min-height: 376px;
          border-radius: 42px;
          padding: 11px;
          background:
            linear-gradient(145deg, rgba(255,255,255,.16), rgba(255,255,255,0) 28%),
            linear-gradient(145deg, #07090d, #171b23 42%, #030405);
          box-shadow:
            0 38px 80px -32px rgba(15, 23, 42, .48),
            inset 0 0 0 1px rgba(255,255,255,.12),
            inset 0 -18px 28px rgba(255,255,255,.035);
          transform-style: preserve-3d;
          will-change: transform;
        }
        .phone-screen {
          position: relative;
          height: 100%;
          width: 100%;
          overflow: hidden;
          border-radius: 32px;
          background: #fff;
          box-shadow: inset 0 0 0 1px rgba(15, 23, 42, .08);
        }
        .phone-mockup::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 20px;
          z-index: 5;
          width: 78px;
          height: 22px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: #05070a;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
        }
        .phone-mockup::after {
          content: "";
          position: absolute;
          inset: 7px;
          pointer-events: none;
          border-radius: 36px;
          border: 1px solid rgba(255,255,255,.08);
        }
        .faq-answer {
          max-height: 0;
          overflow: hidden;
          opacity: 0;
          transition: max-height .48s cubic-bezier(.22, 1, .36, 1), opacity .34s ease;
        }
        .faq-item.active .faq-answer {
          opacity: 1;
        }
        .faq-icon {
          transition: transform .34s cubic-bezier(.22, 1, .36, 1), color .24s ease;
        }
        .faq-item.active .faq-icon {
          transform: rotate(45deg);
          color: #2563eb;
        }
        .phone-primary {
          z-index: 3;
          transform: rotate(-8deg) translate3d(36px, 2px, 72px);
        }
        .phone-secondary {
          z-index: 2;
          opacity: .86;
          transform: rotate(10deg) translate3d(-94px, 44px, 0) scale(.92);
        }
        .retail-skyline {
          background:
            linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,0) 54%) 7% 44% / 9% 72% no-repeat,
            linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,.02) 72%, transparent) 18% 38% / 6% 82% no-repeat,
            linear-gradient(180deg, rgba(34,211,238,.12), rgba(255,255,255,.02) 70%, transparent) 30% 50% / 10% 62% no-repeat,
            linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,0) 62%) 44% 36% / 5% 88% no-repeat,
            linear-gradient(180deg, rgba(96,165,250,.14), rgba(255,255,255,.02) 74%, transparent) 57% 45% / 8% 78% no-repeat,
            linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,0) 68%) 70% 34% / 7% 92% no-repeat,
            linear-gradient(180deg, rgba(34,211,238,.10), rgba(255,255,255,.01) 72%, transparent) 84% 48% / 10% 68% no-repeat;
          filter: blur(.2px);
          animation: hpl-skyline-drift 15s ease-in-out infinite;
          will-change: transform, opacity;
        }
        .retail-photo-card {
          position: relative;
          overflow: hidden;
          border-radius: 30px;
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.05);
          box-shadow: 0 34px 110px rgba(0,0,0,.46);
          backdrop-filter: blur(10px);
        }
        .retail-photo-card::after {
          content: "";
          position: absolute;
          inset: -25% auto -25% -35%;
          width: 46%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent);
          animation: hpl-retail-sheen 8s ease-in-out infinite;
          animation-delay: var(--shine-delay, 0s);
          pointer-events: none;
        }
        .core-rail-logo {
          transform: translateX(-50%) translate3d(var(--x-start), 0, 0);
          animation: hpl-core-rail-swap 13s cubic-bezier(.62, 0, .38, 1) infinite;
          will-change: transform;
        }
        @media (max-width: 1023px) {
          .phone-stage {
            min-height: 560px;
          }
          .phone-primary {
            transform: rotate(-7deg) translate3d(42px, 0, 72px);
          }
          .phone-secondary {
            transform: rotate(9deg) translate3d(-70px, 42px, 0) scale(.88);
          }
        }
        @media (max-width: 640px) {
          .phone-stage {
            min-height: 410px;
          }
          .phone-mockup {
            width: 178px;
            height: 356px;
            min-width: 178px;
            min-height: 356px;
            border-radius: 32px;
            padding: 8px;
          }
          .phone-screen {
            border-radius: 25px;
          }
          .phone-mockup::before {
            top: 15px;
            width: 58px;
            height: 17px;
          }
          .phone-mockup::after {
            border-radius: 28px;
          }
          .phone-primary {
            transform: rotate(-6deg) translate3d(42px, 0, 56px);
          }
          .phone-secondary {
            transform: rotate(8deg) translate3d(-46px, 34px, 0) scale(.86);
          }
          .retail-photo-card {
            border-radius: 24px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .hpl-snap-shell {
            scroll-behavior: auto;
          }
          .hpl-reveal,
          [data-motion="globe-bg"],
          [data-motion="usdc-wave"],
          [data-motion="rail"],
          [data-motion="stack-word"],
          [data-motion="stack-coin"],
          [data-motion="hero-orbit"],
          [data-motion="hero-orbit-logo"],
          .retail-skyline,
          .retail-photo-card::after {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>

      <div className="hpl-snap-shell">
      <section className="hpl-snap-section relative overflow-hidden bg-[#050506] text-white">
        <div className="absolute inset-0 isolate">
          <div
            data-motion="globe-bg"
            className="absolute left-1/2 top-1/2 h-[760px] w-[760px] overflow-hidden rounded-full opacity-36 saturate-[.78] sm:h-[880px] sm:w-[880px] lg:h-[920px] lg:w-[920px]"
            style={{
              animation: 'hpl-globe-drift 18s ease-in-out infinite',
              filter: 'blur(4px) brightness(0.62) saturate(.70)',
              transformStyle: 'preserve-3d',
              willChange: 'transform',
              boxShadow: 'inset 0 0 90px rgba(0,0,0,.34), 0 0 120px rgba(148,163,184,.10)',
            }}
          >
            <div
              className="absolute inset-y-[-5%] left-[-70%] h-[110%] w-[240%]"
              style={{
                backgroundImage: 'url(/brand/world-globe.png)',
                backgroundPosition: '0% 50%',
                backgroundRepeat: 'repeat-x',
                backgroundSize: 'auto 100%',
                animation: 'hpl-globe-surface 34s linear infinite',
                willChange: 'background-position, transform',
              }}
            />
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,.10),rgba(255,255,255,.035)_34%,rgba(0,0,0,.18)_100%)]" />
            <div className="absolute inset-[3%] rounded-full border border-white/8" />
          </div>
          <div className="absolute inset-0 bg-black/[.08] backdrop-blur-[8px]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.014)_1px,transparent_1px)] bg-[size:96px_96px] opacity-20 blur-[.2px]" />
          <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,.08),transparent_58%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_43%,rgba(255,255,255,.035)_0,rgba(0,0,0,.20)_34%,rgba(0,0,0,.90)_100%)]" />
        </div>

        <header className="fixed inset-x-0 top-0 z-50 bg-[#050506] px-5 py-3 shadow-[0_18px_70px_rgba(0,0,0,.26)] sm:px-8 lg:px-10">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
            <Link to="/" className="flex min-w-max items-center gap-2.5">
              <HashMark className="h-7 w-7 object-contain invert mix-blend-screen" />
              <span className="text-sm font-semibold tracking-tight">Hash <span className="text-cyan-300">PayLink</span></span>
            </Link>
            <nav className="hidden items-center justify-center gap-1 rounded-full border border-white/10 bg-white/[.045] p-1 text-[11px] font-medium text-white/58 md:flex">
              <a href="#products" className="rounded-full px-3.5 py-1.5 transition hover:bg-white/8 hover:text-white">Products</a>
              <a href="#traction" className="rounded-full px-3.5 py-1.5 transition hover:bg-white/8 hover:text-white">Traction</a>
              <a href="https://defillama.com/protocol/hash-paylink" target="_blank" rel="noreferrer" className="rounded-full px-3.5 py-1.5 transition hover:bg-white/8 hover:text-white">DeFiLlama</a>
              <Link to="/docs/sdk" className="rounded-full px-3.5 py-1.5 transition hover:bg-white/8 hover:text-white">Developers</Link>
              <a href="#about" className="rounded-full px-3.5 py-1.5 transition hover:bg-white/8 hover:text-white">About</a>
              <a href="#contact" className="rounded-full px-3.5 py-1.5 transition hover:bg-white/8 hover:text-white">Contact</a>
            </nav>
            <Link
              to="/app"
              className="hidden h-10 min-w-max items-center justify-center rounded-lg border border-white/14 bg-white/[.07] px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/86 transition hover:border-white/28 hover:bg-white/[.10] hover:text-white sm:inline-flex"
            >
              Launch App
            </Link>
          </div>
        </header>

        <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 pt-24 sm:px-8 lg:px-10">
          <div className="relative grid flex-1 items-center gap-10 pb-14 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(420px,540px)] lg:pt-16">
            <div className="hpl-reveal relative z-10 max-w-2xl text-left">
              <p className="max-w-[18rem] text-[10px] font-semibold uppercase tracking-[0.26em] text-white/54 sm:max-w-none sm:text-[11px] sm:tracking-[0.36em]">
                Stablecoin payment infrastructure
              </p>
              <h1 className="mt-5 max-w-[18rem] text-balance text-[40px] font-semibold leading-[0.94] tracking-[-0.055em] sm:max-w-none sm:text-7xl lg:text-[86px]">
                Moving USDC at product speed.
              </h1>
              <p className="mt-6 max-w-[18rem] text-sm leading-7 text-white/68 sm:max-w-xl sm:text-[15px]">
                Hash PayLink powers payment links, retail POS, PolyDesk, StreamPay, and agent commerce on Circle USDC, Arc settlement, and 0G proof rails.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/app"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg !bg-white px-5 text-sm font-semibold !text-[#08090b] shadow-[0_18px_48px_rgba(0,0,0,.26)] transition hover:!bg-zinc-100 sm:w-auto"
                >
                  Open App <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="https://t.me/HashPayLinkBot?start=polydesk"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-white/12 bg-white/[.045] px-3 text-xs font-semibold text-white/86 transition hover:bg-white/[.08] sm:w-auto sm:px-5 sm:text-sm"
                >
                  <span className="sm:hidden">Open Telegram</span>
                  <span className="hidden sm:inline">Open PolyDesk in Telegram</span>
                </a>
              </div>
            </div>

            <div className="relative mx-auto h-[430px] w-full max-w-[540px] lg:h-[520px]">
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[min(66vw,360px)] w-[min(66vw,360px)] -translate-x-1/2 -translate-y-1/2">
                <div className="absolute inset-0 rounded-full bg-white/[.035] blur-3xl" />
                <div className="absolute inset-[12%] rounded-full border border-white/10" />
                <div className="absolute inset-[2%] rounded-full border border-white/7" />
                <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/12 bg-[#090a0c] shadow-[inset_-24px_-28px_54px_rgba(0,0,0,.72),inset_14px_14px_34px_rgba(255,255,255,.08),0_0_80px_rgba(255,255,255,.08)] sm:h-56 sm:w-56">
                  <img
                    src="/brand/usdc-circle-logo.png"
                    alt=""
                    className="absolute inset-0 h-full w-full rounded-full object-cover opacity-95"
                  />
                  <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_32%_26%,rgba(255,255,255,.18),transparent_26%),radial-gradient(circle_at_70%_78%,rgba(255,255,255,.08),transparent_35%)]" />
                  <div className="absolute left-[18%] right-[18%] top-[49%] h-px rotate-[-7deg] bg-white/28 shadow-[0_0_16px_rgba(255,255,255,.22)]" />
                </div>
                <div className="absolute left-1/2 top-[calc(50%+150px)] h-14 w-[210px] -translate-x-1/2 sm:top-[calc(50%+185px)] sm:w-[250px]">
                  {[
                    { name: 'Circle', logo: '/brand/circle-logo.jpeg', xStart: '-86px', xMid: '0px', xEnd: '86px', delay: '0s' },
                    { name: 'Arc', logo: '/brand/arc-logo.jpeg', xStart: '0px', xMid: '86px', xEnd: '-86px', delay: '-4.33s' },
                    { name: '0G', logo: '/brand/0g-logo.jpeg', xStart: '86px', xMid: '-86px', xEnd: '0px', delay: '-8.66s' },
                  ].map((item) => (
                    <div
                      key={item.name}
                      className="core-rail-logo absolute left-1/2 top-0 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full border border-white/12 bg-white/[.075] p-2 shadow-[0_18px_42px_rgba(0,0,0,.24)] backdrop-blur-md sm:h-14 sm:w-14"
                      style={{
                        '--x-start': item.xStart,
                        '--x-mid': item.xMid,
                        '--x-end': item.xEnd,
                        animationDelay: item.delay,
                      } as CSSProperties}
                    >
                      <img src={item.logo} alt={item.name} className="h-full w-full rounded-full object-contain opacity-90" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 overflow-hidden border-y border-white/10 py-4">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-[#050506] to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-[#050506] to-transparent" />
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

      <section id="products" className="hpl-snap-section relative overflow-hidden bg-[#FAF9F6]">
        <div className="absolute inset-0 overflow-hidden bg-[#FAF9F6]">
          <img
            src="/brand/usdc-css.jpeg"
            alt=""
            data-motion="usdc-wave"
            className="h-full w-[122%] max-w-none object-cover object-center opacity-95"
            style={{ animation: 'hpl-usdc-wave 24s ease-in-out infinite alternate', filter: 'blur(1.5px) saturate(1.08) brightness(1.035)', willChange: 'transform' }}
          />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(250,249,246,.96)_0%,rgba(250,249,246,.74)_30%,rgba(250,249,246,.36)_50%,rgba(250,249,246,.74)_70%,rgba(250,249,246,.96)_100%)]" />
        <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-5 py-20 sm:px-8 lg:px-10">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Product surface</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-gray-950 sm:text-5xl">
              One platform for USDC workflows.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-gray-600">
              Consumer-simple interfaces on top of verifiable settlement, agent activity, and durable payment state.
            </p>
          </div>

          <div className="mt-14 grid gap-x-16 gap-y-9 md:grid-cols-2 lg:grid-cols-3">
            {products.map(({ index, title, copy, href }) => (
              <Link key={title} to={href} className="group max-w-[330px] text-left">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-semibold tracking-[0.22em] text-gray-400">{index}</span>
                </div>
                <h3 className="mt-4 text-xl font-semibold tracking-[-0.025em] text-gray-950">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-gray-600">{copy}</p>
                <div className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 opacity-80 transition group-hover:gap-2 group-hover:opacity-100">
                  Open <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="traction" ref={retailSectionRef} className="hpl-snap-section relative overflow-hidden bg-[#050609] px-5 py-24 text-white sm:px-8 lg:px-10">
        <div className="absolute inset-0">
          <img
            src="/brand/africa-business-bg.jpeg"
            alt=""
            className="h-full w-full scale-110 object-cover object-center opacity-52 blur-[5px] saturate-[.86]"
          />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,5,10,.70)_0%,rgba(4,5,8,.80)_52%,rgba(3,4,7,.92)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#030407] to-transparent" />

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-12rem)] w-full max-w-7xl items-center gap-12 lg:grid-cols-[.76fr_1.24fr]">
          <div className="retail-motion max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/75">Retail settlement layer</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-white sm:text-5xl">
              USDC checkout for real-world counters.
            </h2>
            <p className="mt-5 text-sm leading-6 text-white/68">
              Hash PayLink turns a merchant counter into a clean stablecoin checkout surface: one QR, familiar phone payment flow, gasless Circle wallet support, and a 0G-backed record after payment.
            </p>

            <div className="mt-9 space-y-5">
              {[
                ['01', 'Scan and pay', 'Customers pay from the wallet or exchange they already use.'],
                ['02', 'Settle in USDC', 'Merchants receive stablecoin value without rebuilding their store workflow.'],
                ['03', 'Onboard with Circle', 'Over 100 users have been natively onboarded into Circle smart-wallet USDC checkout flows.'],
                ['04', 'Verify the receipt', 'Important payment records can be archived through 0G for durable proof.'],
              ].map(([index, title, value]) => (
                <div key={title} className="grid grid-cols-[42px_1fr] gap-4 border-t border-white/10 pt-4">
                  <p className="text-xs font-semibold text-cyan-200/55">{index}</p>
                  <div>
                    <p className="text-sm font-semibold tracking-[-0.01em] text-white">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-white/52">{value}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-8 max-w-lg text-xs leading-5 text-white/42">
              Built for storefronts, events, pop-ups, and agent-assisted commerce where the payment must feel simple before the infrastructure becomes visible.
            </p>
          </div>

          <div className="relative min-h-[620px] lg:min-h-[680px]">
            <div className="retail-motion absolute left-[1%] top-[5%] z-30 w-[86%] sm:w-[70%] lg:w-[62%]">
              <div className="retail-photo-card -rotate-[2.5deg] p-2" style={{ '--shine-delay': '-1.2s' } as CSSProperties}>
                <img
                  src="/brand/africa-terminal-payment.jpeg"
                  alt="Customer paying with Hash PayLink USDC QR terminal"
                  className="h-[270px] w-full rounded-[22px] object-cover object-center sm:h-[340px] lg:h-[360px]"
                />
                <div className="flex items-center justify-between px-3 py-3">
                  <p className="text-xs font-semibold text-white/84">Phone-to-QR checkout</p>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/42">Africa</p>
                </div>
              </div>
            </div>

            <div className="retail-motion absolute right-0 top-[30%] z-20 w-[58%] sm:w-[43%] lg:w-[38%]">
              <div className="retail-photo-card rotate-[5deg] p-2" style={{ '--shine-delay': '-3s' } as CSSProperties}>
                <img
                  src="/brand/africa-terminal-units.jpeg"
                  alt="Hash PayLink physical QR terminal units"
                  className="h-[250px] w-full rounded-[22px] object-cover object-center sm:h-[330px] lg:h-[360px]"
                />
                <div className="flex items-center justify-between px-3 py-3">
                  <p className="text-xs font-semibold text-white/84">Reusable POS QR</p>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/42">USDC</p>
                </div>
              </div>
            </div>

            <div className="retail-motion absolute bottom-[2%] left-[9%] z-10 w-[72%] sm:w-[55%] lg:w-[48%]">
              <div className="retail-photo-card rotate-[2deg] p-2" style={{ '--shine-delay': '-4.6s' } as CSSProperties}>
                <img
                  src="/brand/africa-terminal-live.jpeg"
                  alt="Hash PayLink QR terminal at a retail checkout"
                  className="h-[230px] w-full rounded-[22px] object-cover object-center sm:h-[290px] lg:h-[310px]"
                />
                <div className="flex items-center justify-between px-3 py-3">
                  <p className="text-xs font-semibold text-white/84">Retail-ready flow</p>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/42">Circle + 0G</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section ref={modernAppSectionRef} className="modern-app-section hpl-snap-section relative overflow-hidden bg-[#f7f6f2] px-5 py-24 text-gray-950 sm:px-8 lg:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(59,130,246,.12),transparent_30%),radial-gradient(circle_at_78%_18%,rgba(6,182,212,.10),transparent_28%),linear-gradient(180deg,#f9f8f4_0%,#f3f1ea_100%)]" />
        <div className="absolute left-1/2 top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50 blur-3xl" />
        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-12rem)] w-full max-w-7xl items-center gap-14 lg:grid-cols-[.82fr_1.18fr]">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-700">Mobile command layer</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-gray-950 sm:text-5xl">
              Built for the screen users already trust.
            </h2>
            <p className="mt-5 text-sm leading-6 text-gray-600">
              Hash PayLink turns payment links, PolyDesk alerts, StreamPay, and agent receipts into clean mobile workflows that feel simple enough for chat and strong enough for fintech teams.
            </p>

            <div className="mt-9 grid max-w-lg grid-cols-2 gap-3">
              {proofStats.map((item) => {
                const content = (
                  <div className="rounded-2xl border border-black/10 bg-white/64 p-4 shadow-[0_18px_56px_rgba(15,23,42,.06)] backdrop-blur-sm transition hover:border-blue-200 hover:bg-white/85">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">{item.label}</p>
                    <p className="mt-2 text-sm font-semibold tracking-[-0.01em] text-gray-950">{item.value}</p>
                  </div>
                )
                return item.href.startsWith('http') ? (
                  <a key={item.label} href={item.href} target="_blank" rel="noreferrer">
                    {content}
                  </a>
                ) : (
                  <Link key={item.label} to={item.href}>
                    {content}
                  </Link>
                )
              })}
            </div>

            <Link
              to="/app"
              className="mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-semibold text-white shadow-[0_18px_50px_rgba(15,23,42,.16)] transition hover:bg-gray-800"
            >
              Open App <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="phone-stage relative flex items-center justify-center">
            <div className="phone-mockup phone-secondary absolute">
              <div className="phone-screen bg-[#eef6ff]">
                <div className="h-full px-5 pb-5 pt-14 text-gray-950">
                  <div className="rounded-[28px] bg-white/86 p-4 shadow-[0_18px_44px_rgba(15,23,42,.10)]">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-700">PolyDesk</p>
                    <h3 className="mt-3 text-2xl font-semibold tracking-[-0.05em]">Portfolio alerts</h3>
                    <p className="mt-2 text-xs leading-5 text-gray-500">Positions, funding, and LP Scout memory from Telegram.</p>
                    <div className="mt-5 space-y-2">
                      {['Position risk below 12%', 'LP Scout result saved', 'Funding route ready'].map((item) => (
                        <div key={item} className="flex items-center justify-between rounded-2xl bg-gray-950/[.035] px-3 py-2">
                          <span className="text-[11px] font-medium text-gray-700">{item}</span>
                          <span className="h-2 w-2 rounded-full bg-blue-600" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 rounded-[26px] bg-gray-950 p-4 text-white shadow-[0_18px_50px_rgba(15,23,42,.16)]">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">USDC balance</p>
                    <p className="mt-2 text-3xl font-semibold tracking-[-0.06em]">$1,284.20</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="phone-mockup phone-primary absolute">
              <div className="phone-screen bg-[#f9fafb]">
                <div className="flex h-full flex-col px-5 pb-5 pt-14 text-gray-950">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">Hash PayLink</p>
                      <h3 className="mt-1 text-2xl font-semibold tracking-[-0.055em]">Payment ready</h3>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 shadow-[0_14px_36px_rgba(37,99,235,.32)]">
                      <HashMark className="h-5 w-5 object-contain" />
                    </div>
                  </div>

                  <div className="mt-6 rounded-[30px] bg-gray-950 p-5 text-white shadow-[0_26px_70px_rgba(15,23,42,.22)]">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">Checkout</p>
                    <p className="mt-4 text-4xl font-semibold tracking-[-0.07em]">$125.00</p>
                    <p className="mt-2 text-xs text-white/55">USDC on Base</p>
                    <div className="mt-6 h-11 rounded-2xl bg-white text-center text-xs font-semibold leading-[44px] text-gray-950">
                      Pay with wallet
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-3xl bg-white p-4 shadow-[0_14px_38px_rgba(15,23,42,.08)]">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400">Proof</p>
                      <p className="mt-2 text-sm font-semibold">0G archived</p>
                    </div>
                    <div className="rounded-3xl bg-white p-4 shadow-[0_14px_38px_rgba(15,23,42,.08)]">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400">Agent</p>
                      <p className="mt-2 text-sm font-semibold">x402 paid</p>
                    </div>
                  </div>

                  <div className="mt-auto rounded-[26px] border border-black/10 bg-white p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-700">Live workflow</p>
                    <p className="mt-2 text-xs leading-5 text-gray-500">Receipts, balances, and payment state stay readable on mobile.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="stack" className="hpl-snap-section relative overflow-hidden bg-[#faf9f6] px-5 py-24 text-gray-950 sm:px-8 lg:px-10">
        <div className="absolute inset-0">
          <img
            src="/brand/usdc-footer.png"
            alt=""
            className="h-full w-full object-cover object-center opacity-72"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(250,249,246,.98)_0%,rgba(250,249,246,.90)_44%,rgba(250,249,246,.64)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_74%,rgba(99,102,241,.12),transparent_34%),radial-gradient(circle_at_82%_22%,rgba(255,255,255,.78),transparent_36%)]" />
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {['Request', 'Send', 'Pay', 'Crypto', 'Stablecoins'].map((word, index) => (
              <span
                key={word}
                data-motion="stack-word"
                className="absolute select-none text-5xl font-semibold tracking-[-0.055em] text-slate-900/[.035] sm:text-7xl lg:text-8xl"
                style={{
                  left: `${[6, 28, 58, 12, 46][index]}%`,
                  top: `${[12, 34, 16, 68, 78][index]}%`,
                  '--rotate': `${[-8, 5, -4, 7, -6][index]}deg`,
                  animation: `hpl-orbit-word ${[11, 13, 10, 14, 12][index]}s ease-in-out infinite`,
                  animationDelay: `${index * -1.6}s`,
                  willChange: 'transform',
                } as CSSProperties}
              >
                {word}
              </span>
            ))}
            {[0, 1, 2, 3].map((item) => (
              <img
                key={item}
                src="/brand/usdc-circle-logo.png"
                alt=""
                data-motion="stack-coin"
                className="absolute rounded-full object-cover opacity-[.055] blur-[1px]"
                style={{
                  width: `${[150, 92, 128, 72][item]}px`,
                  height: `${[150, 92, 128, 72][item]}px`,
                  left: `${[70, 18, 82, 39][item]}%`,
                  top: `${[58, 22, 10, 84][item]}%`,
                  '--rotate': `${[12, -18, 28, -10][item]}deg`,
                  animation: `hpl-orbit-coin ${[12, 9, 14, 10][item]}s ease-in-out infinite`,
                  animationDelay: `${item * -1.25}s`,
                  willChange: 'transform',
                } as CSSProperties}
              />
            ))}
          </div>
        </div>

        <div className="relative z-10 mx-auto w-full max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[.86fr_1.14fr]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-700">Infrastructure stack</p>
              <h2 className="mt-3 max-w-xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                Built on rails people already trust.
              </h2>
              <p className="mt-5 max-w-xl text-sm leading-6 text-gray-600">
                Circle, Arc, and 0G make Hash PayLink possible: Circle powers USDC checkout and smart-wallet sessions, Arc supports programmable StreamPay settlement, and 0G keeps payment and agent records verifiable. The rest of the stack extends distribution, networks, and product context.
              </p>
            </div>

            <div className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
              {stack.map((item, index) => (
                <div key={item.name} className="hpl-reveal border-t border-black/10 pt-4" style={{ '--delay': `${index * 55}ms` } as CSSProperties}>
                  <p className="text-sm font-semibold tracking-[-0.01em] text-gray-950">{item.name}</p>
                  <p className="mt-2 text-xs leading-5 text-gray-500">{item.copy}</p>
                </div>
              ))}
            </div>
          </div>

          <div id="about" className="mt-20 grid gap-10 border-t border-black/10 pt-12 lg:grid-cols-[1fr_.82fr]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Developer path</p>
              <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.035em] text-gray-950">Integrate hosted checkout first.</h2>
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

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Start here</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-gray-950">Open the working app.</h3>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                Create payment links, open POS, enter PolyDesk, or launch StreamPay from the app surface.
              </p>
              <Link
                to="/app"
                className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-black/10 bg-white/75 px-4 text-sm font-semibold text-gray-950 shadow-[0_14px_44px_rgba(15,23,42,.08)] transition hover:bg-white"
              >
                Open App <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="hpl-snap-section relative overflow-hidden bg-[#f7f6f2] px-5 py-24 text-gray-950 sm:px-8 lg:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(37,99,235,.08),transparent_30%),radial-gradient(circle_at_86%_72%,rgba(14,165,233,.08),transparent_32%)]" />
        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-12rem)] w-full max-w-7xl items-center gap-12 lg:grid-cols-[.78fr_1.22fr]">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-700">FAQs</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-gray-950 sm:text-5xl">
              Questions ecosystem teams ask first.
            </h2>
            <p className="mt-5 text-sm leading-6 text-gray-600">
              A concise view of how Hash PayLink turns trusted infrastructure into live payment, retail, agent, and market workflows.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/app"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-semibold text-white shadow-[0_18px_50px_rgba(15,23,42,.12)] transition hover:bg-gray-800"
              >
                Open App <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="mailto:support@hashpaylink.com"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-black/10 bg-white/70 px-4 text-sm font-semibold text-gray-950 shadow-[0_14px_44px_rgba(15,23,42,.06)] transition hover:bg-white"
              >
                Contact
              </a>
            </div>
          </div>

          <div className="rounded-[2rem] border border-black/10 bg-white/64 px-5 py-2 shadow-[0_28px_90px_rgba(15,23,42,.08)] backdrop-blur-xl sm:px-7">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index
              return (
                <div key={faq.question} className={`faq-item border-b border-black/10 last:border-b-0 ${isOpen ? 'active' : ''}`}>
                  <button
                    type="button"
                    className="faq-header flex w-full items-center justify-between gap-5 py-6 text-left"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaq(isOpen ? -1 : index)}
                  >
                    <span className="text-base font-semibold tracking-[-0.02em] text-gray-950 sm:text-lg">{faq.question}</span>
                    <span className="faq-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white text-xl font-light leading-none text-gray-500 shadow-[0_10px_28px_rgba(15,23,42,.06)]">
                      +
                    </span>
                  </button>
                  <div
                    ref={(node) => {
                      faqAnswerRefs.current[index] = node
                    }}
                    className="faq-answer"
                    style={{ maxHeight: isOpen ? `${faqHeights[index] || 0}px` : '0px' }}
                  >
                    <p className="max-w-2xl pb-6 text-sm leading-6 text-gray-600">{faq.answer}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <footer id="contact" className="border-t border-black/10 px-5 py-8 sm:px-8 lg:px-10" style={{ scrollSnapAlign: 'end' }}>
        <div className="mx-auto grid w-full max-w-7xl gap-4 text-xs text-gray-500 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div className="hidden sm:block" />
          <p className="text-center text-gray-400">Powered by Circle USDC. Built with Arc settlement and 0G proof records.</p>
          <div className="flex gap-4 sm:justify-end">
            <a href="mailto:support@hashpaylink.com" className="hover:text-gray-900">Email</a>
            <a href="https://x.com/Hash_PayLink" target="_blank" rel="noreferrer" className="hover:text-gray-900">X</a>
          </div>
        </div>
      </footer>
      </div>
    </main>
  )
}
