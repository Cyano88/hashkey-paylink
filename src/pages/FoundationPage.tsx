import { Link } from 'react-router-dom'
import { Activity, ArrowLeftRight, ArrowRight, KeyRound, Menu, Radio, ShieldCheck, TrendingUp, Wallet, Webhook, X } from 'lucide-react'
import Lenis from 'lenis'
import Snap from 'lenis/snap'
import 'lenis/dist/lenis.css'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Send as PocketSend, Store as PocketStore, Deposit as PocketDeposit, ArrowLeftRight as PocketSwap, Home as PocketHome, Receipt as PocketReceipt, CreditCard as PocketCard, UserRound as PocketProfile, Bell as PocketBell, QrCode as PocketQr, Eye as PocketEye } from '../pocket/components/PocketIcons'
import { CPurseIcon } from '../pocket/components/CPurseIcon'

const POCKET_URL = 'https://pocket.hashpaylink.com'

const products = [
  { index: '01', title: 'Pocket', meta: 'Everyday money', copy: 'Send, receive and request USDC. Pay bills, move money locally and manage your assets.', action: 'Open Pocket', href: POCKET_URL },
  { index: '02', title: 'XStocks', meta: 'On X Layer', copy: 'Explore tokenized stocks, buy, sell and swap supported assets, and track your holdings.', action: 'Explore stocks', href: `${POCKET_URL}/xstocks/home` },
  { index: '03', title: 'XPay', meta: 'Scan to pay', copy: 'One QR for each business. Choose to receive local money, USDC or selected stock tokens.', action: 'Open XPay', href: `${POCKET_URL}/xpay` },
  { index: '04', title: 'Local payments', meta: 'Nigeria and Uganda', copy: 'Send money from Pocket to supported bank accounts in Nigeria or mobile money accounts in Uganda.', action: 'Send locally', href: `${POCKET_URL}/move/bank` },
  { index: '05', title: 'Bills', meta: 'Everyday essentials', copy: 'Buy airtime, data, electricity and TV subscriptions in Nigeria, with payment records and refund tracking.', action: 'Open Bills', href: `${POCKET_URL}/bills` },
  { index: '06', title: 'Pocket Support', meta: 'Talk to us', copy: 'Find answers, report a transaction issue and continue the conversation with Hash or the support team.', action: 'Get support', href: `${POCKET_URL}/assistant` },
  { index: '07', title: 'Developer platform', meta: 'Build on Hash PayLink', copy: 'Add a payment page to your app and get updates when customers pay.', action: 'Start building', href: '/developers' },
]

const stack = [
  { name: 'Circle', copy: 'USDC and wallets for Pocket Stablecoins, with network fees sponsored on supported routes.' },
  { name: 'Arc', copy: 'USDC payments and supported token swaps on Arc.' },
  { name: '0G Labs', copy: 'Stores eligible payment records so they can be checked later.' },
  { name: 'X Layer', copy: 'The network for Pocket XStocks, asset transfers and stock payments.' },
  { name: 'Privy', copy: 'Email sign-in and your wallet for XStocks.' },
  { name: 'OKX DEX', copy: 'Finds prices and ways to swap supported assets on X Layer.' },
  { name: 'USDC networks', copy: 'Base, Arbitrum, Arc, Solana, Ethereum and Polygon in Pocket. Availability varies by action.' },
  { name: 'Paycrest', copy: 'Converts payments into local money for supported bank and mobile money accounts.' },
  { name: 'VTpass', copy: 'Delivers airtime, data, electricity and TV purchases in Nigeria.' },
]

const proofStats = [
  { index: '01', label: 'Stablecoins', value: 'USDC across six networks', copy: 'Send, receive and manage supported balances in Pocket.', href: POCKET_URL },
  { index: '02', label: 'XStocks', value: 'Tokenized stocks on X Layer', copy: 'Buy, sell, swap and view individual holdings.', href: `${POCKET_URL}/xstocks/home` },
  { index: '03', label: 'Local payments', value: 'Nigeria and Uganda', copy: 'Supported bank accounts and mobile money providers.', href: `${POCKET_URL}/move/bank` },
  { index: '04', label: 'XPay', value: 'Your business. One QR.', copy: 'Manage receiving options and payment history per terminal.', href: `${POCKET_URL}/xpay` },
]

const partnerRail: Array<{ name: string; logo: string }> = [
  { name: 'Circle', logo: '/brand/circle-logo.jpeg' },
  { name: 'Arc', logo: '/brand/arc-logo.jpeg' },
  { name: '0G Labs', logo: '/brand/0g-logo.jpeg' },
  { name: 'X Layer', logo: '/brand/xlayer-logo.svg' },
  { name: 'Privy', logo: '/brand/privy-logo.jpeg' },
  { name: 'OKX DEX', logo: '/brand/okx-logo.png' },
  { name: 'Paycrest', logo: '/brand/paycrest-logo.png' },
  { name: 'VTpass', logo: '/brand/vtpass-logo.png' },
]

// Selected from the Pocket catalog; avoid loading the full trading catalog on the landing page.
const featuredStocks = [
  {
    "symbol": "NVDAx",
    "name": "NVIDIA",
    "icon": "/pocket-stocks/0xc845b2894dbddd03858fd2d643b4ef725fe0849d.png"
  },
  {
    "symbol": "AAPLx",
    "name": "Apple",
    "icon": "/pocket-stocks/0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a.svg"
  },
  {
    "symbol": "TSLAx",
    "name": "Tesla",
    "icon": "/pocket-stocks/0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0.svg"
  },
  {
    "symbol": "MSFTx",
    "name": "Microsoft",
    "icon": "/pocket-stocks/0x5621737f42dae558b81269fcb9e9e70c19aa6b35.svg"
  }
]

const ecosystemPartners = [
  { name: 'Circle', logo: '/brand/circle-logo.jpeg', role: 'Digital dollars and wallets', copy: 'USDC and wallet tools, including fee sponsorship on supported routes.', href: 'https://www.circle.com/' },
  { name: 'Arc', logo: '/brand/arc-logo.jpeg', role: 'A network for USDC payments', copy: 'A blockchain network used for USDC payments and supported swaps.', href: 'https://www.arc.io/' },
  { name: '0G Labs', logo: '/brand/0g-logo.jpeg', role: 'Payment records you can check', copy: 'Stores eligible payment records and proof that they were recorded.', href: 'https://0g.ai/' },
  { name: 'X Layer', logo: '/brand/xlayer-logo.svg', role: 'The network for XStocks', copy: 'Where Pocket users hold, swap and pay with supported stock tokens.', href: 'https://web3.okx.com/xlayer' },
]

const faqs = [
  { question: 'Why does Hash PayLink exist?', answer: 'Moving money can mean switching apps, copying wallet addresses, working out fees and chasing payment updates. Hash PayLink brings these steps together. People use Pocket, businesses accept payments with XPay, and developers can add the same payment tools to their apps.' },
  { question: 'What is USDC, and what can I do with it?', answer: 'USDC is a digital dollar designed to stay close to one US dollar in value. In Pocket, it can do more than sit in a wallet: you can send it, request it, pay supported bills, pay a business, or use an available route to send local money.' },
  { question: 'How does Pocket make payments simpler?', answer: 'Pocket brings the recipient, amount, available payment route and fees into one flow. You review and approve the payment; the app handles the connected wallet and provider steps and keeps the status in Activity. You do not need to manually move between several apps.' },
  { question: 'Are payments always instant?', answer: 'No. We aim to remove unnecessary steps and show progress quickly, but timing still depends on the network, bank, mobile money or bill provider. Pocket shows the recorded status instead of calling an unfinished payment successful.' },
  { question: 'How can I get exposure to overseas stocks?', answer: 'XStocks lets eligible users explore supported tokens linked to the value of foreign-listed stocks and funds that track groups of stocks (ETFs). You can buy, sell, swap and hold supported assets on X Layer. These are tokenized products, not direct company shares; prices can fall, and availability depends on your location and the asset.' },
  { question: 'What can a business accept with XPay?', answer: 'Create one terminal for each business. Choose whether to receive local bank or mobile money payments, USDC, or supported stock tokens. Customers scan the QR and choose from the options you enabled. Change those options, download the QR and view the business payment history in Pocket.' },
  { question: 'Does a bank receive stock tokens?', answer: 'No. A direct asset payment goes to the merchant wallet. Bank and mobile money payments use a local payout service funded with USDC on Base. If a stock-funded route is available, the stock must first be swapped and the funds moved to the payout network.' },
  { question: 'Which networks and countries can I use?', answer: 'Pocket supports USDC wallets on Base, Arbitrum, Arc, Solana, Ethereum and Polygon. XStocks uses X Layer. Local payouts support eligible Nigerian bank accounts and Ugandan mobile money providers. The payment screen shows which route is available for your action.' },
  { question: 'How do I build with Hash PayLink?', answer: 'Open the developer portal, create a project and follow the API guide. You can add a ready-made payment page, check whether a payment completed and receive secure payment updates. An API is how your app talks to Hash PayLink. Available products depend on your project settings and activation.' },
  { question: 'Can developers use every Pocket feature?', answer: 'Not yet. Public checkout supports specific networks. Some swap and agreement tools need project activation, Arc Agreements remains draft-only, and a general bridge API is not available. The public API availability page shows the current position before you build.' },
  { question: 'What does 0G do here?', answer: 'Eligible payment records can be stored with 0G so they can be checked later. Saving that record is separate from completing the payment. Builders can also use 0G Compute to run their own AI features and connect Hash PayLink for payments.' },
  { question: 'How do I get help?', answer: 'Open Support in Pocket for FAQs, transaction help and a chat with Hash, the AI agent. If a person is needed, your case can go to Pocket Support. You can also email support@hashpaylink.com. Cards are still coming soon.' },
]

function HashMark({ className = '' }: { className?: string }) {
  return <img src="/hash-logo.png" alt="" aria-hidden="true" className={className} />
}

export default function FoundationPage() {
  const faqAnswerRefs = useRef<Array<HTMLDivElement | null>>([])
  const snapShellRef = useRef<HTMLDivElement | null>(null)
  const snapContentRef = useRef<HTMLDivElement | null>(null)
  const [openFaq, setOpenFaq] = useState(-1)
  const [faqHeights, setFaqHeights] = useState<number[]>([])
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

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

  useEffect(() => {
    const wrapper = snapShellRef.current
    const content = snapContentRef.current
    if (!wrapper || !content || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const easeOutExpo = (progress: number) => Math.min(1, 1.001 - Math.pow(2, -10 * progress))
    const lenis = new Lenis({
      wrapper,
      content,
      eventsTarget: wrapper,
      autoRaf: false,
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 0.72,
      touchMultiplier: 1,
      overscroll: false,
      duration: 0.82,
      easing: easeOutExpo,
      stopInertiaOnNavigate: true,
    })

    let animationFrame = 0
    const raf = (time: number) => {
      lenis.raf(time)
      animationFrame = window.requestAnimationFrame(raf)
    }
    animationFrame = window.requestAnimationFrame(raf)

    const sections = Array.from(content.querySelectorAll<HTMLElement>('.hpl-snap-section'))
    const deckMedia = window.matchMedia('(min-width: 1024px) and (min-height: 700px)')
    let activeSection: HTMLElement | undefined
    let transitionTarget: HTMLElement | undefined
    let sectionFrame = 0
    let snap: Snap | undefined
    let wheelGestureLocked = false
    let snapInProgress = false
    let wheelGestureTimer = 0
    const scheduleWheelRelease = (delay = 220) => {
      window.clearTimeout(wheelGestureTimer)
      wheelGestureTimer = window.setTimeout(() => {
        if (!snapInProgress) wheelGestureLocked = false
      }, delay)
    }
    const guardWheelGesture = (event: WheelEvent) => {
      if (!deckMedia.matches || !snap || event.ctrlKey || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (wheelGestureLocked || snapInProgress) {
        scheduleWheelRelease()
        return
      }

      wheelGestureLocked = true
      snapInProgress = true
      const currentIndex = sections.reduce((closestIndex, section, index) => {
        const currentDistance = Math.abs(sections[closestIndex].offsetTop - wrapper.scrollTop)
        const nextDistance = Math.abs(section.offsetTop - wrapper.scrollTop)
        return nextDistance < currentDistance ? index : closestIndex
      }, 0)
      const targetIndex = Math.max(0, Math.min(currentIndex + (event.deltaY > 0 ? 1 : -1), sections.length - 1))
      if (targetIndex === currentIndex) {
        snapInProgress = false
        scheduleWheelRelease()
        return
      }
      snap.goTo(targetIndex)
      scheduleWheelRelease(1400)
    }
    wrapper.addEventListener('wheel', guardWheelGesture, { passive: false, capture: true })
    const activateSection = (section: HTMLElement | undefined) => {
      if (!section || section === activeSection) return
      activeSection?.classList.remove('is-section-active')
      section.classList.add('is-section-active')
      activeSection = section
    }
    const syncActiveSection = () => {
      sectionFrame = 0
      if (transitionTarget) return
      const wrapperRect = wrapper.getBoundingClientRect()
      const viewportCenter = wrapperRect.top + wrapper.clientHeight / 2
      const nextSection = sections.reduce<HTMLElement | undefined>((closest, section) => {
        if (!closest) return section
        const sectionRect = section.getBoundingClientRect()
        const closestRect = closest.getBoundingClientRect()
        const sectionDistance = Math.abs(sectionRect.top + sectionRect.height / 2 - viewportCenter)
        const closestDistance = Math.abs(closestRect.top + closestRect.height / 2 - viewportCenter)
        return sectionDistance < closestDistance ? section : closest
      }, undefined)

      activateSection(nextSection)
    }
    const scheduleSectionSync = () => {
      if (sectionFrame) return
      sectionFrame = window.requestAnimationFrame(syncActiveSection)
    }

    const handleAnchorClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]')
      if (!link || !wrapper.contains(link)) return

      const targetId = link.getAttribute('href')
      if (!targetId || targetId === '#') return
      const target = content.querySelector<HTMLElement>(targetId)
      if (!target) return

      event.preventDefault()
      transitionTarget = target.closest<HTMLElement>('.hpl-snap-section') || target
      activateSection(transitionTarget)
      lenis.scrollTo(target, {
        offset: 0,
        duration: 0.82,
        easing: easeOutExpo,
        lock: false,
        onComplete: () => {
          transitionTarget = undefined
          syncActiveSection()
          window.history.replaceState(null, '', targetId)
        },
      })
    }
    wrapper.addEventListener('click', handleAnchorClick)

    syncActiveSection()
    wrapper.classList.add('foundation-motion-ready')
    wrapper.addEventListener('scroll', scheduleSectionSync, { passive: true })

    const configureSnap = () => {
      snap?.destroy()
      snap = undefined
      snapInProgress = false
      wheelGestureLocked = false
      if (!deckMedia.matches) return

      snap = new Snap(lenis, {
        type: 'lock',
        distanceThreshold: '100%',
        debounce: 90,
        duration: 0.68,
        easing: easeOutExpo,
        onSnapStart: ({ index }) => {
          transitionTarget = typeof index === 'number' ? sections[index] : undefined
          activateSection(transitionTarget)
        },
        onSnapComplete: () => {
          transitionTarget = undefined
          snapInProgress = false
          scheduleWheelRelease()
          syncActiveSection()
        },
      })
      snap.addElements(Array.from(content.querySelectorAll<HTMLElement>('.hpl-snap-section')), { align: 'start' })
    }

    configureSnap()
    deckMedia.addEventListener('change', configureSnap)

    return () => {
      wrapper.removeEventListener('click', handleAnchorClick)
      wrapper.removeEventListener('scroll', scheduleSectionSync)
      wrapper.removeEventListener('wheel', guardWheelGesture, true)
      deckMedia.removeEventListener('change', configureSnap)
      window.clearTimeout(wheelGestureTimer)
      window.cancelAnimationFrame(animationFrame)
      window.cancelAnimationFrame(sectionFrame)
      wrapper.classList.remove('foundation-motion-ready')
      sections.forEach((section) => section.classList.remove('is-section-active'))
      snap?.destroy()
      lenis.destroy()
    }
  }, [])

  return (
    <main data-foundation-colour-scope="light" className="min-h-[100dvh] bg-[#f7f6f2] text-[#0d1117]">
      <style>{`
        @keyframes hpl-rail {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-50%, 0, 0); }
        }
        @keyframes hpl-float-in {
          from { opacity: 0; transform: translate3d(0, 18px, 0) scale(.985); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }
        @keyframes hpl-orbit-word {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(var(--rotate)); }
          50% { transform: translate3d(0, -16px, 0) rotate(var(--rotate)); }
        }
        @keyframes hpl-retail-breathe {
          from { transform: scale(1.012); }
          to { transform: scale(1.045); }
        }
        .hpl-reveal {
          opacity: 0;
          transform: translate3d(0, 18px, 0) scale(.985);
          animation: hpl-float-in .78s cubic-bezier(.22, 1, .36, 1) forwards;
          animation-delay: var(--delay, 0ms);
          backface-visibility: hidden;
        }
        /* Foundation keeps its designed light surfaces even when the app theme is dark. */
        [data-foundation-colour-scope] { color-scheme: light; }
        .foundation-ending { height: auto !important; min-height: 100dvh; }
        .foundation-ending footer { padding-top: 80px; padding-bottom: 36px; }
        .foundation-light-section {
          background: #f6f8fc !important;
          color: #0f172a;
          color-scheme: only light;
        }
        .foundation-deck-section {
          isolation: isolate;
          background:
            radial-gradient(circle at 8% 12%, rgba(37,99,235,.12), transparent 30%),
            radial-gradient(circle at 92% 74%, rgba(6,182,212,.11), transparent 28%),
            linear-gradient(145deg,#fbfdff 0%,#f3f7ff 48%,#f7fafc 100%) !important;
        }
        .foundation-deck-section > .foundation-section-backdrop {
          background: transparent !important;
        }
        .foundation-surface-card {
          border: 1px solid #e2e8f0;
          background: #ffffff !important;
          color: #0f172a !important;
          box-shadow: 0 16px 44px rgba(15, 23, 42, .065);
        }
        .foundation-primary-cta {
          background: #020617 !important;
          color: #ffffff !important;
          border-radius: 999px;
          box-shadow: 0 14px 36px rgba(15, 23, 42, .14);
          transition: transform .2s ease, background-color .2s ease, box-shadow .2s ease;
        }
        .foundation-primary-cta:hover {
          transform: translateY(-1px);
          background: #1d4ed8 !important;
          box-shadow: 0 18px 42px rgba(37, 99, 235, .18);
        }
        .foundation-secondary-cta {
          border: 1px solid #e2e8f0 !important;
          background: #ffffff !important;
          color: #0f172a !important;
          border-radius: 999px;
          transition: transform .2s ease, border-color .2s ease, background-color .2s ease;
        }
        .foundation-secondary-cta:hover {
          transform: translateY(-1px);
          border-color: #bfdbfe !important;
          background: #eff6ff !important;
        }
        .foundation-light-section a:focus-visible,
        .foundation-light-section button:focus-visible,
        header a:focus-visible,
        header button:focus-visible {
          outline: 2px solid #38bdf8;
          outline-offset: 3px;
        }
        #products {
          color-scheme: only light;
        }
        #products .product-card-index {
          border-color: #e2e8f0 !important;
          background: #f8fafc !important;
          color: #64748b !important;
        }
        #products .product-card-meta {
          color: #1d4ed8 !important;
        }
        #products .product-card-title {
          color: #020617 !important;
        }
        #products .product-card-copy {
          color: #475569 !important;
        }
        #products .product-card-action {
          background: #020617 !important;
          color: #ffffff !important;
        }
        #stack {
          color-scheme: only light;
        }
        #stack .stack-rail-index {
          border-color: #e2e8f0 !important;
          background: #f8fafc !important;
          color: #64748b !important;
        }
        #stack .stack-rail-title {
          color: #020617 !important;
        }
        #stack .stack-rail-copy {
          color: #475569 !important;
        }
        #api {
          color-scheme: only light;
        }
        #api .api-portal-card {
          background: #ffffff !important;
          color: #0f172a !important;
          opacity: 1 !important;
        }
        #api .api-card-title {
          color: #020617 !important;
        }
        #api .api-card-copy {
          color: #334155 !important;
        }
        #api .api-primary-action {
          background: #020617 !important;
          color: #ffffff !important;
        }
        .hpl-snap-shell {
          height: 100dvh;
          overflow-y: auto;
          scroll-snap-type: none;
          scroll-padding-top: 0;
          overscroll-behavior-y: contain;
          scrollbar-width: thin;
        }
        .hpl-snap-content {
          width: 100%;
        }
        .hpl-snap-section {
          height: 100dvh;
          min-height: 100dvh;
          scroll-snap-align: start;
          scroll-snap-stop: always;
          scroll-margin-top: 0;
          box-sizing: border-box;
        }
        .foundation-motion-ready .hpl-snap-section .hpl-section-content > *,
        .foundation-motion-ready .hpl-snap-section .foundation-mobile-hero-grid > * {
          transition:
            transform .52s cubic-bezier(.22, 1, .36, 1);
          backface-visibility: hidden;
        }
        .foundation-motion-ready .hpl-snap-section:not(.is-section-active) .hpl-section-content > *,
        .foundation-motion-ready .hpl-snap-section:not(.is-section-active) .foundation-mobile-hero-grid > * {
          opacity: 1;
          transform: translate3d(0, -4px, 0) scale(.998);
        }
        .foundation-motion-ready .hpl-snap-section.is-section-active .hpl-section-content > *,
        .foundation-motion-ready .hpl-snap-section.is-section-active .foundation-mobile-hero-grid > * {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
        }
        .foundation-motion-ready .hpl-snap-section.is-section-active .hpl-section-content > :nth-child(2),
        .foundation-motion-ready .hpl-snap-section.is-section-active .foundation-mobile-hero-grid > :nth-child(2) {
          transition-delay: 90ms;
        }
        .foundation-motion-ready .hpl-snap-section.is-section-active .hpl-section-content > :nth-child(n+3) {
          transition-delay: 150ms;
        }
        .foundation-motion-ready .hpl-snap-section .section-detail-reveal {
          opacity: 1;
          translate: 0 -3px;
          scale: .999;
          transition:
            translate .48s cubic-bezier(.22, 1, .36, 1),
            scale .48s cubic-bezier(.22, 1, .36, 1);
          transition-delay: 0ms;
          backface-visibility: hidden;
        }
        .foundation-motion-ready .hpl-snap-section.is-section-active .section-detail-reveal {
          opacity: 1;
          translate: 0 0;
          scale: 1;
          transition-delay: min(var(--section-reveal-delay, 0ms), 180ms);
        }
        .hpl-snap-content > .hpl-snap-section:first-child {
          display: flex;
          flex-direction: column;
        }
        .hpl-snap-content > .hpl-snap-section:first-child .foundation-mobile-hero {
          flex: 1 1 auto;
          height: auto;
          min-height: 0 !important;
        }
        .foundation-deck-section {
          padding-top: 0 !important;
          padding-bottom: 0 !important;
        }
        .hpl-section-content {
          height: 100%;
          min-height: 0 !important;
          box-sizing: border-box;
          padding-top: calc(64px + clamp(14px, 2.4vh, 28px)) !important;
          padding-bottom: clamp(14px, 2.4vh, 28px) !important;
          overflow: hidden;
        }
        .hpl-section-content-footer {
          padding-bottom: calc(60px + clamp(12px, 2vh, 24px)) !important;
        }
        #retail > .hpl-section-content > article,
        #retail > .hpl-section-content > div:last-child {
          height: 100%;
          min-height: 0 !important;
        }
        #pocket .phone-stage {
          height: min(600px, calc(100dvh - 112px));
          min-height: 0;
        }
        [data-motion="stack-word"] {
          will-change: auto !important;
        }
        .foundation-motion-ready .hpl-snap-section:not(.is-section-active) [data-motion="rail"],
        .foundation-motion-ready .hpl-snap-section:not(.is-section-active) [data-motion="stack-word"] {
          animation-play-state: paused !important;
        }
        .phone-stage {
          min-height: 600px;
          perspective: 1100px;
          perspective-origin: 50% 44%;
          transform-style: preserve-3d;
          isolation: isolate;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 258px));
          justify-content: center;
          align-items: center;
          gap: 18px;
        }
        .phone-stage::before {
          content: "";
          position: absolute;
          left: 50%;
          bottom: 2%;
          z-index: 0;
          width: 82%;
          height: 18%;
          border-radius: 50%;
          background: radial-gradient(ellipse at center, rgba(15,23,42,.20), rgba(37,99,235,.08) 42%, transparent 72%);
          transform: translate3d(-50%, 0, -90px) rotateX(68deg);
          pointer-events: none;
        }
        .phone-mockup {
          position: relative;
          width: min(258px, 40vw);
          height: min(584px, calc(100dvh - 126px));
          min-width: 176px;
          min-height: 352px;
          border-radius: 40px;
          padding: 10px;
          background:
            linear-gradient(108deg, rgba(255,255,255,.38) 0%, rgba(255,255,255,.06) 9%, transparent 19%),
            linear-gradient(132deg, #05070a 0%, #353c47 18%, #090c11 43%, #464e5a 70%, #050608 100%);
          box-shadow:
            0 38px 80px -32px rgba(15, 23, 42, .48),
            inset 0 0 0 1px rgba(255,255,255,.12),
            inset 0 -18px 28px rgba(255,255,255,.035);
          transform-style: preserve-3d;
          backface-visibility: hidden;
        }
        .phone-primary {
          z-index: 3;
          opacity: 1;
          transform: translate3d(-8px, -12px, 54px) rotateY(-12deg) rotateX(1.5deg) rotateZ(1deg);
          box-shadow:
            24px 42px 86px -34px rgba(15, 23, 42, .58),
            inset 0 0 0 1px rgba(255,255,255,.12),
            inset 0 -18px 28px rgba(255,255,255,.035);
        }
        .phone-secondary {
          z-index: 2;
          opacity: 1;
          transform: translate3d(8px, 12px, 0) rotateY(12deg) rotateX(1.5deg) rotateZ(-1deg);
          box-shadow:
            -18px 34px 72px -36px rgba(15, 23, 42, .44),
            inset 0 0 0 1px rgba(255,255,255,.12),
            inset 0 -18px 28px rgba(255,255,255,.035);
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
        .phone-screen::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 8;
          border-radius: inherit;
          background: linear-gradient(118deg, rgba(255,255,255,.16), transparent 18%, transparent 78%, rgba(255,255,255,.035));
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.09);
          pointer-events: none;
        }
        .phone-hardware {
          position: absolute;
          inset: 0;
          z-index: 6;
          transform: translateZ(5px);
          pointer-events: none;
        }
        .phone-hardware::before,
        .phone-hardware::after {
          content: "";
          position: absolute;
          width: 3px;
          border-radius: 999px;
          background: linear-gradient(180deg, #59616d, #11151b 18%, #05070a 82%, #353b44);
          box-shadow: 0 0 0 1px rgba(255,255,255,.08);
        }
        .phone-hardware::before {
          left: -2px;
          top: 112px;
          height: 58px;
        }
        .phone-hardware::after {
          right: -2px;
          top: 148px;
          height: 76px;
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
        .phone-primary::before {
          background: #050507;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.18), 0 2px 8px rgba(0,0,0,.42);
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
        #retail article.retail-motion {
          --retail-x: 0px;
          --retail-y: 0px;
          --retail-hover-scale: 1;
        }
        #retail .retail-image-plane {
          transform: scale(1.012);
          transform-origin: center top;
          backface-visibility: hidden;
        }
        #retail.is-section-active .retail-image-plane {
          animation: hpl-retail-breathe 7.5s ease-in-out infinite alternate;
        }
        #retail .retail-image-plane > img {
          transform: translate3d(var(--retail-x), var(--retail-y), 0) scale(var(--retail-hover-scale));
          transition: transform .78s cubic-bezier(.22, 1, .36, 1);
          backface-visibility: hidden;
        }
        #retail article.retail-motion:hover,
        #retail article.retail-motion:focus-within {
          --retail-hover-scale: 1.018;
        }
        @media (max-width: 1023px) {
          .hpl-snap-shell {
            scroll-snap-type: none;
          }
          .hpl-snap-section {
            height: auto;
            min-height: 100dvh;
            scroll-snap-stop: normal;
            overflow-x: hidden !important;
            overflow-y: visible !important;
          }
          .hpl-section-content {
            height: auto;
            min-height: 100dvh !important;
            overflow: visible;
          }
          .phone-stage {
            min-height: 530px;
            grid-template-columns: repeat(2, minmax(0, 232px));
            gap: 18px;
          }
          .phone-primary {
            transform: translate3d(-5px, -8px, 38px) rotateY(-10deg) rotateX(1deg) rotateZ(.75deg);
          }
          .phone-secondary {
            transform: translate3d(5px, 8px, 0) rotateY(10deg) rotateX(1deg) rotateZ(-.75deg);
          }
        }
        @media (min-width: 641px) and (max-width: 1023px) {
          #retail .hpl-section-content {
            gap: 1.5rem;
          }
          #retail > .hpl-section-content > article,
          #retail > .hpl-section-content > div:last-child {
            height: auto;
          }
          #retail > .hpl-section-content > div:last-child {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 1rem;
            min-height: 0;
          }
          #retail > .hpl-section-content > div:last-child > button {
            position: relative;
            inset: auto;
            width: 100%;
          }
        }
        @media (min-width: 1024px) and (max-height: 850px) {
          .foundation-mobile-hero {
            height: 100dvh;
            min-height: 0;
            padding-top: 72px;
            padding-bottom: 10px;
          }
          .foundation-mobile-hero-grid {
            min-height: 0;
            gap: 2rem;
            padding-top: .5rem;
            padding-bottom: .5rem;
          }
          .foundation-mobile-hero-art {
            height: min(420px, calc(100dvh - 250px));
          }
          .foundation-partner-rail {
            flex-shrink: 0;
            padding-top: .65rem;
            padding-bottom: .65rem;
          }
          .phone-secondary .phone-screen > div {
            padding-top: 2.5rem !important;
            padding-bottom: .5rem !important;
          }
          .phone-secondary .phone-screen > div > .mt-4,
          .phone-secondary .phone-screen > div > .mt-3 {
            margin-top: .5rem !important;
          }
          #retail article.retail-motion {
            padding: 1.5rem !important;
          }
          #retail article.retail-motion h2 {
            font-size: clamp(2.5rem, 4vw, 3.55rem);
          }
          #retail article.retail-motion h2 + p {
            margin-top: .75rem;
          }
          #retail article.retail-motion .mt-7 {
            margin-top: 1rem;
          }
          #retail article.retail-motion .mt-5 {
            margin-top: .75rem;
          }
          #api .hpl-section-content {
            gap: 1.5rem;
          }
          #api .hpl-section-content > div > h2 {
            margin-top: .65rem;
            font-size: 2.5rem;
            line-height: 1.05;
          }
          #api .hpl-section-content > div > h2 + p {
            margin-top: .75rem;
          }
          #api .hpl-section-content > div > .mt-7 {
            margin-top: 1rem;
          }
          #api .hpl-section-content > div > .mt-4,
          #api .hpl-section-content > div > .mt-5 {
            margin-top: .75rem;
          }
        }
        @media (min-width: 1024px) and (max-height: 740px) {
          #retail article.retail-motion h2 {
            font-size: clamp(2.2rem, 3.4vw, 3.05rem);
          }
          #retail article.retail-motion .mt-7 {
            margin-top: .5rem;
          }
          #retail article.retail-motion > div > div:last-child > .mt-5 {
            margin-top: .5rem;
          }
          #retail article.retail-motion a {
            min-height: 44px;
          }
        }
        @media (min-width: 1024px) and (max-height: 699px) {
          .hpl-snap-shell {
            scroll-snap-type: none;
          }
          .hpl-snap-section {
            height: auto;
            min-height: 100dvh;
            overflow-x: hidden !important;
            overflow-y: visible !important;
          }
          .hpl-section-content {
            height: auto;
            min-height: 100dvh !important;
            overflow: visible;
          }
          #retail > .hpl-section-content > article,
          #retail > .hpl-section-content > div:last-child {
            height: auto;
          }
          #pocket .phone-stage {
            height: auto;
            min-height: 560px;
          }
        }
        @media (max-width: 640px) {
          .hpl-snap-shell {
            height: 100dvh;
            min-height: 100dvh;
            overflow-y: auto;
            scroll-snap-type: none;
          }
          .hpl-snap-section {
            min-height: 100dvh;
            scroll-snap-stop: normal;
          }
          .hpl-snap-section h2 {
            font-size: 1.85rem;
            line-height: 1.05;
            letter-spacing: -.035em;
          }
          .foundation-mobile-section {
            display: flex;
            align-items: flex-start;
            min-height: 100dvh;
            padding-top: 0;
            padding-bottom: 0;
          }
          .foundation-mobile-section-tight {
            padding-top: 0;
            padding-bottom: 0;
          }
          .hpl-section-content {
            padding-top: 4.75rem !important;
            padding-bottom: 2rem !important;
          }
          .hpl-section-content-footer {
            padding-bottom: 76px !important;
          }
          .foundation-mobile-hero {
            min-height: 100dvh;
            padding-top: 4.75rem;
            padding-bottom: 1rem;
          }
          .foundation-mobile-hero-grid {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 1.25rem;
            padding-top: .85rem;
            padding-bottom: 1rem;
          }
          .foundation-mobile-hero .hpl-reveal,
          .foundation-mobile-hero h1,
          .foundation-mobile-hero p {
            max-width: 100%;
          }
          .foundation-mobile-hero .hpl-reveal {
            opacity: 1;
            transform: none;
            animation: none;
            will-change: auto;
            backface-visibility: visible;
          }
          [data-motion="stack-word"] {
            display: none !important;
          }
          .foundation-mobile-hero-art {
            height: 220px;
            max-width: 340px;
            margin-top: .35rem;
          }
          .foundation-primary-cta:hover,
          .foundation-secondary-cta:hover {
            transform: none;
          }
          .foundation-mobile-command-copy {
            display: block;
          }
          .phone-stage {
            grid-template-columns: 1fr 1fr;
            gap: .6rem;
            align-items: center;
            min-height: auto;
            display: grid;
            justify-items: center;
            perspective: 760px;
            perspective-origin: 50% 42%;
          }
          .phone-mockup {
            position: relative !important;
            inset: auto !important;
            width: min(128px, 39vw);
            height: min(258px, 78vw);
            min-width: 0;
            min-height: 0;
            border-radius: 24px;
            padding: 6px;
          }
          .phone-screen {
            border-radius: 19px;
          }
          .phone-mockup::before {
            top: 11px;
            width: 42px;
            height: 12px;
          }
          .phone-mockup::after {
            inset: 5px;
            border-radius: 21px;
          }
          .phone-hardware::before {
            left: -1px;
            top: 58px;
            height: 30px;
            width: 2px;
          }
          .phone-hardware::after {
            right: -1px;
            top: 76px;
            height: 38px;
            width: 2px;
          }
          .phone-primary {
            order: 1;
            transform: translate3d(4px, -7px, 34px) rotateY(-14deg) rotateX(1.5deg) rotateZ(1deg);
          }
          .phone-secondary {
            order: 2;
            opacity: 1;
            transform: translate3d(-4px, 8px, 0) rotateY(14deg) rotateX(1.5deg) rotateZ(-1deg);
          }
        }
        #pocket .phone-stage-single { grid-template-columns: 1fr 1fr; }
        .phone-stage-single .pocket-app-preview { grid-column: 2; width: 270px; height: 570px; min-height: 570px; }
        .pocket-preview-content { display: flex; flex-direction: column; height: 100%; padding: 46px 14px 18px; }
        .pocket-preview-header { display: flex; align-items: center; justify-content: space-between; gap: 5px; }
        @media (max-width: 1023px) {
          #pocket .phone-stage-single { grid-template-columns: 1fr; height: auto; min-height: 600px; }
          .phone-stage-single .pocket-app-preview { grid-column: 1; justify-self: center; }
        }
        @media (max-width: 640px) {
          .phone-stage-single .pocket-app-preview { border-radius: 40px; padding: 10px; }
          .phone-stage-single .phone-screen { border-radius: 30px; }
          .phone-stage-single .phone-mockup::before { top: 18px; width: 72px; height: 18px; }
          .phone-stage-single .phone-mockup::after { inset: 9px; border-radius: 32px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hpl-snap-shell {
            scroll-behavior: auto;
            scroll-snap-type: y proximity;
          }
          .hpl-reveal,
          .foundation-motion-ready .hpl-snap-section .hpl-section-content > *,
          .foundation-motion-ready .hpl-snap-section .foundation-mobile-hero-grid > *,
          .foundation-motion-ready .hpl-snap-section .section-detail-reveal,
          [data-motion="rail"],
          [data-motion="stack-word"],
          #retail .retail-image-plane,
          #retail .retail-image-plane > img {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
            translate: none !important;
            scale: none !important;
            transition: none !important;
          }
        }
      `}</style>

      <div ref={snapShellRef} className="hpl-snap-shell">
      <div ref={snapContentRef} className="hpl-snap-content">
      <section className="foundation-light-section foundation-deck-section hpl-snap-section relative overflow-hidden text-slate-950" style={{ backgroundColor: '#f6f8fc', colorScheme: 'light' }}>

        <header className="fixed inset-x-0 top-0 z-50 bg-[#050506] px-5 py-3 text-white shadow-[0_18px_70px_rgba(0,0,0,.26)] sm:px-8 lg:px-10">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
            <Link to="/" className="flex min-w-max items-center gap-2.5">
              <HashMark className="h-7 w-7 object-contain invert mix-blend-screen" />
              <span className="text-sm font-semibold tracking-tight">Hash <span className="text-cyan-300">PayLink</span></span>
            </Link>
            <nav className="hidden items-center justify-center gap-1 rounded-full border border-white/[.10] bg-white/[.045] p-1 text-[11px] font-medium text-white/[.58] md:flex">
              <a href="#products" className="rounded-full px-3.5 py-1.5 transition hover:bg-white/[.08] hover:text-white">Products</a>
              <a href="#retail" className="rounded-full px-3.5 py-1.5 transition hover:bg-white/[.08] hover:text-white">XPay</a>
              <a href="#pocket" className="rounded-full px-3.5 py-1.5 transition hover:bg-white/[.08] hover:text-white">Pocket</a>
              <a href="#xstocks" className="rounded-full px-3.5 py-1.5 transition hover:bg-white/[.08] hover:text-white">XStocks</a>
                <a href="#stack" className="rounded-full px-3.5 py-1.5 transition hover:bg-white/[.08] hover:text-white">Technology</a>
              <a href="#api" className="rounded-full px-3.5 py-1.5 transition hover:bg-white/[.08] hover:text-white">API</a>
              <Link to="/developers" className="rounded-full px-3.5 py-1.5 transition hover:bg-white/[.08] hover:text-white">Developers</Link>
            </nav>
            <div className="flex items-center gap-2">
              <a
                href={POCKET_URL}
                className="inline-flex h-10 min-w-max items-center justify-center rounded-full border border-white/[.14] bg-white/[.07] px-4 text-[11px] font-semibold text-white/[.86] transition hover:border-white/[.28] hover:bg-white/[.10] hover:text-white"
              >
                Open Pocket
              </a>
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/[.14] bg-white/[.07] text-white/[.86] transition hover:border-white/[.28] hover:bg-white/[.10] hover:text-white md:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        {mobileNavOpen && (
          <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true">
            <div
              className="absolute inset-0 bg-black/[.70] backdrop-blur-sm"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="absolute inset-x-0 top-0 max-h-[100dvh] overflow-y-auto bg-[#050506] px-5 pb-8 pt-3 text-white shadow-[0_18px_70px_rgba(0,0,0,.46)]">
              <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
                <Link to="/" onClick={() => setMobileNavOpen(false)} className="flex min-w-max items-center gap-2.5">
                  <HashMark className="h-7 w-7 object-contain invert mix-blend-screen" />
                  <span className="text-sm font-semibold tracking-tight">Hash <span className="text-cyan-300">PayLink</span></span>
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close menu"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/[.14] bg-white/[.07] text-white/[.86] hover:border-white/[.28] hover:bg-white/[.10] hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="mx-auto mt-7 grid w-full max-w-7xl gap-1.5 text-sm font-medium text-white/[.86]">
                <a href="#products" onClick={() => setMobileNavOpen(false)} className="rounded-lg border border-white/[.08] bg-white/[.035] px-4 py-3 hover:border-white/[.16] hover:bg-white/[.06]">Products</a>
                <a href="#retail" onClick={() => setMobileNavOpen(false)} className="rounded-lg border border-white/[.08] bg-white/[.035] px-4 py-3 hover:border-white/[.16] hover:bg-white/[.06]">XPay</a>
                <a href="#pocket" onClick={() => setMobileNavOpen(false)} className="rounded-lg border border-white/[.08] bg-white/[.035] px-4 py-3 hover:border-white/[.16] hover:bg-white/[.06]">Pocket</a>
                <a href="#xstocks" onClick={() => setMobileNavOpen(false)} className="rounded-lg border border-white/[.08] bg-white/[.035] px-4 py-3 hover:border-white/[.16] hover:bg-white/[.06]">XStocks</a>
                <a href="#stack" onClick={() => setMobileNavOpen(false)} className="rounded-lg border border-white/[.08] bg-white/[.035] px-4 py-3 hover:border-white/[.16] hover:bg-white/[.06]">Technology</a>
                <a href="#api" onClick={() => setMobileNavOpen(false)} className="rounded-lg border border-white/[.08] bg-white/[.035] px-4 py-3 hover:border-white/[.16] hover:bg-white/[.06]">Hosted Checkout API</a>
                <Link to="/developers" onClick={() => setMobileNavOpen(false)} className="rounded-lg border border-white/[.08] bg-white/[.035] px-4 py-3 hover:border-white/[.16] hover:bg-white/[.06]">Developers</Link>
              </nav>
            </div>
          </div>
        )}

        <div className="foundation-mobile-hero relative mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col px-4 py-5 pt-24 sm:px-8 lg:px-10">
          <div className="foundation-mobile-hero-grid relative grid flex-1 items-center gap-10 pb-14 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(420px,540px)] lg:pt-16">
            <div className="hpl-reveal relative z-10 max-w-2xl text-left">
              <p className="max-w-[18rem] text-[10px] font-semibold uppercase tracking-[0.26em] text-blue-700 sm:max-w-none sm:text-[11px] sm:tracking-[0.36em]">
                Digital dollars. Stocks. Everyday payments.
              </p>
              <h1 className="mt-5 max-w-[18rem] text-balance text-[40px] font-semibold leading-[1] tracking-[-0.055em] sm:max-w-none sm:text-7xl sm:leading-[0.94] lg:text-[clamp(52px,5.7vw,86px)]">
                Move money. Put assets to work.
              </h1>
              <p className="mt-6 max-w-[18rem] text-sm leading-7 text-slate-600 sm:max-w-xl sm:text-[15px]">
                Send digital dollars, pay everyday expenses and explore tokenized stocks. Use Pocket, accept payments with XPay, or build payments into your own app.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href={POCKET_URL}
                  className="foundation-primary-cta inline-flex h-12 w-full items-center justify-center gap-2 px-5 text-sm font-semibold shadow-[0_18px_48px_rgba(15,23,42,.16)] transition hover:bg-blue-700 sm:w-auto"
                >
                  Open Pocket <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="#api"
                  className="foundation-secondary-cta inline-flex h-12 w-full items-center justify-center px-3 text-xs font-semibold transition hover:border-blue-200 hover:bg-blue-50 sm:w-auto sm:px-5 sm:text-sm"
                >
                  Explore the API
                </a>
              </div>
            </div>

            <div className="foundation-mobile-hero-art relative mx-auto h-[430px] w-full max-w-[540px] lg:h-[520px]">
              <div className="relative h-full w-full overflow-hidden rounded-[32px] border border-white bg-[#7f2818] shadow-[0_34px_100px_rgba(91,33,20,.20)] max-sm:rounded-[24px]">
                <img
                  src="/brand/foundation-hero-community.jpeg"
                  alt="A community gathered together"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover object-center saturate-[.92] contrast-[1.02]"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,.02)_0%,rgba(15,23,42,.02)_56%,rgba(15,23,42,.30)_100%)]" />
                <div className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,.16),inset_0_-70px_100px_rgba(56,20,13,.10)]" />
              </div>
            </div>
          </div>

          <div className="foundation-partner-rail relative z-10 shrink-0 overflow-hidden border-y border-slate-200 py-4">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-[#f6f8fc] to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-[#f6f8fc] to-transparent" />
            <div data-motion="rail" className="flex w-max items-center gap-10 opacity-90" style={{ animation: 'hpl-rail 32s linear infinite' }}>
              {[...partnerRail, ...partnerRail].map((partner, index) => (
                <div key={`${partner.name}-${index}`} aria-hidden={index >= partnerRail.length} className="flex min-w-max items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm">
                    <img src={partner.logo} alt="" loading="lazy" decoding="async" className="h-5 w-5 object-contain" />
                  </span>
                  <span>{partner.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="products" data-no-text-reveal className="foundation-light-section foundation-deck-section foundation-mobile-section hpl-snap-section relative overflow-hidden" style={{ backgroundColor: '#f6f8fc', colorScheme: 'light' }}>
        <div className="foundation-section-backdrop absolute inset-0 bg-[radial-gradient(circle_at_8%_14%,rgba(37,99,235,.11),transparent_29%),radial-gradient(circle_at_90%_82%,rgba(6,182,212,.09),transparent_27%),linear-gradient(145deg,#fbfdff_0%,#f3f7ff_50%,#f8fafc_100%)]">
        </div>
        <div className="absolute left-[48%] top-1/2 h-[620px] w-[620px] -translate-y-1/2 rounded-full bg-blue-100/[.30] blur-3xl" />
        <div className="hpl-section-content relative z-10 mx-auto grid min-h-[100dvh] w-full max-w-7xl items-center gap-10 px-5 py-20 max-sm:min-h-0 max-sm:py-0 sm:px-8 lg:grid-cols-[.72fr_1.28fr] lg:px-10">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 max-sm:text-[10px] max-sm:tracking-[0.22em]">Use Hash PayLink</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-gray-950 max-sm:mt-2 sm:text-5xl">
              For you, your business and your next idea.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-gray-600 max-sm:mt-2 max-sm:text-xs max-sm:leading-5">
              Use it yourself, accept payments for your business, or build with our tools.
            </p>
          </div>

          <div className="foundation-surface-card foundation-mobile-product-grid overflow-hidden rounded-[28px] px-5 py-2 [&>:last-child>div]:border-b-0 sm:px-6">
            {products.map(({ index, title, meta, copy, action, href }) => {
              const content = (
                <div className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-100 py-3.5">
                  <span className="product-card-index flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-[8px] font-semibold tracking-[0.08em] text-white">{index}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <h3 className="product-card-title text-sm font-semibold tracking-[-0.02em] text-slate-950">{title}</h3>
                      <p className="product-card-meta text-[8px] font-semibold uppercase tracking-[0.12em] text-blue-700">{meta}</p>
                    </div>
                    <p className="product-card-copy mt-1 text-[10px] leading-4 text-slate-600 sm:text-[11px]">{copy}</p>
                  </div>
                  <div className="product-card-action inline-flex h-8 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-800 transition group-hover:border-blue-200 group-hover:bg-blue-50 group-hover:text-blue-800">
                    <span className="hidden sm:inline">{action}</span><ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </div>
                </div>
              )
              return href.startsWith('http') ? (
                <a key={title} href={href} data-no-text-reveal className="group block text-left">
                  {content}
                </a>
              ) : (
                <Link key={title} to={href} data-no-text-reveal className="group block text-left">
                  {content}
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      <section id="retail" className="foundation-light-section foundation-deck-section foundation-mobile-section hpl-snap-section relative overflow-hidden px-5 py-24 text-gray-950 sm:px-8 lg:px-10">
        <div className="foundation-section-backdrop absolute inset-0 bg-[radial-gradient(circle_at_8%_12%,rgba(37,99,235,.12),transparent_30%),radial-gradient(circle_at_92%_74%,rgba(6,182,212,.11),transparent_28%),linear-gradient(145deg,#fbfdff_0%,#f3f7ff_48%,#f7fafc_100%)]" />
        <div className="absolute left-[42%] top-1/2 h-[620px] w-[620px] -translate-y-1/2 rounded-full bg-blue-100/[.35] blur-3xl" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {['Scan', 'Pay', 'Assets', 'Settle', 'Receipt'].map((word, index) => (
            <span
              key={word}
              data-motion="stack-word"
              className="absolute select-none text-5xl font-semibold tracking-[-0.055em] text-slate-900/[.032] sm:text-7xl lg:text-8xl"
              style={{
                left: `${[5, 31, 64, 10, 53][index]}%`,
                top: `${[10, 72, 12, 43, 78][index]}%`,
                '--rotate': `${[-7, 5, -4, 6, -5][index]}deg`,
                animation: `hpl-orbit-word ${[12, 14, 11, 13, 15][index]}s ease-in-out infinite`,
                animationDelay: `${index * -1.7}s`,
                willChange: 'transform',
              } as CSSProperties}
            >
              {word}
            </span>
          ))}
        </div>

        <div className="hpl-section-content relative z-10 mx-auto grid min-h-[calc(100dvh-12rem)] w-full max-w-7xl items-center gap-5 max-sm:min-h-0 lg:grid-cols-[1.38fr_.62fr]">
          <article
            className="retail-motion relative flex min-h-[560px] w-full overflow-hidden rounded-[32px] border border-white/[.24] bg-[#101722] p-8 text-white shadow-[0_34px_110px_rgba(30,64,175,.16)] max-sm:min-h-[520px] max-sm:rounded-[24px] max-sm:p-5 sm:p-10"
            onPointerMove={event => {
              const rect = event.currentTarget.getBoundingClientRect()
              const x = ((event.clientX - rect.left) / rect.width - 0.5) * -12
              const y = ((event.clientY - rect.top) / rect.height - 0.5) * -8
              event.currentTarget.style.setProperty('--retail-x', `${x.toFixed(2)}px`)
              event.currentTarget.style.setProperty('--retail-y', `${y.toFixed(2)}px`)
              event.currentTarget.style.setProperty('--retail-hover-scale', '1.018')
            }}
            onPointerLeave={event => {
              event.currentTarget.style.setProperty('--retail-x', '0px')
              event.currentTarget.style.setProperty('--retail-y', '0px')
              event.currentTarget.style.setProperty('--retail-hover-scale', '1')
            }}
            onPointerUp={event => {
              event.currentTarget.style.setProperty('--retail-x', '0px')
              event.currentTarget.style.setProperty('--retail-y', '0px')
              event.currentTarget.style.setProperty('--retail-hover-scale', '1')
            }}
            onPointerCancel={event => {
              event.currentTarget.style.setProperty('--retail-x', '0px')
              event.currentTarget.style.setProperty('--retail-y', '0px')
              event.currentTarget.style.setProperty('--retail-hover-scale', '1')
            }}
          >
            <div className="retail-image-plane absolute inset-0">
              <img src="/brand/africa-retail-story.jpeg" alt="West African retail culture" loading="lazy" decoding="async" className="h-full w-full object-cover object-top saturate-[.92]" />
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,10,19,.92)_0%,rgba(5,10,19,.70)_42%,rgba(5,10,19,.15)_78%),linear-gradient(180deg,rgba(5,10,19,.05)_42%,rgba(5,10,19,.72)_100%)] max-sm:bg-[linear-gradient(180deg,rgba(5,10,19,.10)_18%,rgba(5,10,19,.88)_76%)]" />
            <div className="relative z-10 flex w-full max-w-[620px] flex-col justify-end">

              <div>
                <p className="section-detail-reveal text-[10px] font-extrabold uppercase tracking-[0.14em] text-cyan-100/[.82]" style={{ '--section-reveal-delay': '70ms' } as CSSProperties}>XPay · Scan to pay</p>
                <h2 className="section-detail-reveal mt-4 max-w-[620px] text-[clamp(2.65rem,4.8vw,4.6rem)] font-semibold leading-[.95] tracking-[-0.065em] text-white" style={{ '--section-reveal-delay': '120ms' } as CSSProperties}>
                  One business. One QR. More ways to pay.
                </h2>
                <p className="section-detail-reveal mt-5 max-w-[500px] text-[13px] leading-6 text-white/[.74]" style={{ '--section-reveal-delay': '175ms' } as CSSProperties}>
                  Let customers scan one business QR and choose an enabled payment option. Receive USDC, supported stock assets, or local bank and mobile money settlement.
                </p>

                <a
                  href={`${POCKET_URL}/xpay`}
                  className="section-detail-reveal mt-7 inline-flex min-h-12 w-fit items-center gap-4 rounded-full bg-white py-1.5 pl-5 pr-1.5 text-xs font-semibold text-slate-950 shadow-[0_16px_40px_rgba(0,0,0,.22)] transition hover:bg-cyan-50"
                  style={{ '--section-reveal-delay': '230ms' } as CSSProperties}
                >
                  Create an XPay terminal
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-white">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </a>
              </div>
            </div>
          </article>

          <aside className="grid grid-cols-3 gap-2.5 lg:relative lg:min-h-[520px] lg:block" aria-label="Hash PayLink QR terminal views">
            {[
              ['/brand/africa-terminal-payment.jpeg', 'Customer paying with a Hash PayLink QR terminal', 'lg:left-[5%] lg:top-[9%] lg:w-[78%] lg:-rotate-[2deg]'],
              ['/brand/africa-terminal-units.jpeg', 'Hash PayLink reusable QR terminal units', 'lg:right-[4%] lg:top-[37%] lg:w-[68%] lg:rotate-[2.5deg]'],
              ['/brand/africa-terminal-live.jpeg', 'Hash PayLink QR terminal at retail checkout', 'lg:bottom-[8%] lg:left-[11%] lg:w-[72%] lg:-rotate-[.75deg]'],
            ].map(([src, alt, position], index) => (
              <div
                key={src}
                className={`${position} section-detail-reveal h-28 overflow-hidden rounded-[16px] border border-white/80 bg-white/70 p-1 opacity-[.74] shadow-[0_14px_34px_rgba(15,23,42,.09)] transition duration-500 hover:opacity-[.92] max-sm:h-24 lg:absolute lg:h-[152px] lg:rounded-[18px]`}
                style={{ '--section-reveal-delay': `${145 + index * 70}ms` } as CSSProperties}
              >
                <img src={src} alt={alt} loading="lazy" decoding="async" className="h-full w-full rounded-[12px] object-cover object-center brightness-[.94] saturate-[.66] lg:rounded-[14px]" />
              </div>
            ))}
          </aside>

        </div>
      </section>

      <section id="pocket" className="foundation-light-section foundation-deck-section foundation-mobile-section hpl-snap-section relative overflow-hidden px-5 py-24 text-gray-950 sm:px-8 lg:px-10">
        <div className="foundation-section-backdrop absolute inset-0 bg-[radial-gradient(circle_at_8%_12%,rgba(37,99,235,.12),transparent_30%),radial-gradient(circle_at_92%_74%,rgba(6,182,212,.11),transparent_28%),linear-gradient(145deg,#fbfdff_0%,#f3f7ff_48%,#f7fafc_100%)]" />
        <div className="absolute left-[42%] top-1/2 h-[620px] w-[620px] -translate-y-1/2 rounded-full bg-blue-100/[.35] blur-3xl" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {['Pocket', 'Wallet', 'Checkout', 'Move', 'Activity'].map((word, index) => (
            <span
              key={word}
              data-motion="stack-word"
              className="absolute select-none text-5xl font-semibold tracking-[-0.055em] text-slate-900/[.032] sm:text-7xl lg:text-8xl"
              style={{
                left: `${[4, 32, 62, 16, 58][index]}%`,
                top: `${[13, 76, 9, 50, 80][index]}%`,
                '--rotate': `${[-6, 5, -3, 7, -5][index]}deg`,
                animation: `hpl-orbit-word ${[13, 11, 15, 12, 14][index]}s ease-in-out infinite`,
                animationDelay: `${index * -1.8}s`,
                willChange: 'transform',
              } as CSSProperties}
            >
              {word}
            </span>
          ))}
        </div>
        <div className="hpl-section-content relative z-10 mx-auto grid min-h-[calc(100dvh-12rem)] w-full max-w-7xl items-center gap-14 max-sm:min-h-0 max-sm:gap-4 lg:grid-cols-[.82fr_1.18fr]">
          <div className="max-w-xl">
            <p className="section-detail-reveal text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-700 max-sm:text-[10px] max-sm:tracking-[0.22em]" style={{ '--section-reveal-delay': '60ms' } as CSSProperties}>Pocket · Stablecoins + XStocks</p>
            <h2 className="section-detail-reveal mt-3 text-4xl font-semibold tracking-[-0.045em] text-gray-950 max-sm:mt-2 sm:text-5xl" style={{ '--section-reveal-delay': '115ms' } as CSSProperties}>
              Your money and stocks, in one Pocket.
            </h2>
            <p className="foundation-mobile-command-copy section-detail-reveal mt-5 text-sm leading-6 text-gray-600 max-sm:mt-2 max-sm:text-xs max-sm:leading-5" style={{ '--section-reveal-delay': '170ms' } as CSSProperties}>
              Pay, send and receive with Stablecoins. Explore and trade supported stock assets on X Layer. Keep balances and activity clear in each part of Pocket.
            </p>

            <div className="mt-8 grid max-w-xl grid-cols-2 gap-3 max-sm:mt-4 max-sm:gap-2">
              {proofStats.map((item, index) => {
                const content = (
                  <div className="foundation-surface-card group/card min-h-[142px] rounded-[22px] p-4 transition duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_22px_62px_rgba(37,99,235,.11)] max-sm:min-h-0 max-sm:rounded-2xl max-sm:p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500">{item.label}</p>
                      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-[8px] font-black text-gray-500 transition group-hover/card:border-blue-200 group-hover/card:bg-blue-50 group-hover/card:text-blue-700">{item.index}</span>
                    </div>
                    <p className="mt-4 text-sm font-semibold tracking-[-0.015em] text-gray-950 max-sm:mt-2 max-sm:text-[10px]">{item.value}</p>
                    <p className="mt-2 text-[11px] leading-4 text-gray-500 max-sm:mt-1 max-sm:text-[8px] max-sm:leading-3">{item.copy}</p>
                  </div>
                )
                return item.href.startsWith('http') ? (
                  <a key={item.label} href={item.href} target="_blank" rel="noreferrer" className="section-detail-reveal" style={{ '--section-reveal-delay': `${225 + index * 55}ms` } as CSSProperties}>
                    {content}
                  </a>
                ) : (
                  <Link key={item.label} to={item.href} className="section-detail-reveal" style={{ '--section-reveal-delay': `${225 + index * 55}ms` } as CSSProperties}>
                    {content}
                  </Link>
                )
              })}
            </div>

            <a
              href={POCKET_URL}
              className="foundation-primary-cta section-detail-reveal group mt-7 inline-flex min-h-14 min-w-[210px] items-center justify-between gap-5 py-1.5 pl-6 pr-1.5 text-sm font-semibold shadow-[0_18px_50px_rgba(15,23,42,.18)] transition hover:bg-black active:scale-[0.985] max-sm:mt-4 max-sm:min-h-12 max-sm:w-full"
              style={{ '--section-reveal-delay': '475ms' } as CSSProperties}
            >
              Open Pocket
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[.12] transition-transform group-hover:translate-x-0.5">
                <ArrowRight className="h-4 w-4" />
              </span>
            </a>
          </div>

          <div className="phone-stage phone-stage-single relative items-center">
            <div className="phone-mockup phone-primary pocket-app-preview section-detail-reveal" style={{ '--section-reveal-delay': '125ms' } as CSSProperties}>
              <span className="phone-hardware" aria-hidden="true" />
              <div className="phone-screen" style={{ background: '#ffffff', color: '#0a0a0a', colorScheme: 'light' }}>
                <div className="pocket-preview-content">
                  <div className="pocket-preview-header">
                    <span className="text-[8px] font-semibold">ID:12345678</span>
                    <div className="flex rounded-full bg-gray-100 p-0.5 text-[8px] font-semibold"><span className="rounded-full bg-white px-2 py-1.5 shadow-sm">Stablecoins</span><span className="px-2 py-1.5 text-gray-500">XStocks</span></div>
                    <PocketBell className="h-4 w-4" />
                  </div>
                  <div className="mt-5 rounded-[20px] bg-gray-950 p-4 text-white">
                    <div className="flex items-start justify-between">
                      <div><p className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest text-white/50">Total USDC <PocketEye className="h-3 w-3" /></p><p className="mt-2 text-[28px] font-bold tracking-tight">0 <span className="text-[10px] font-medium text-white/50">USDC</span></p></div>
                      <span className="flex flex-col items-center gap-1 text-[7px] text-white/70"><PocketQr className="h-5 w-5" />Scan</span>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <div className="grid flex-1 grid-cols-4 gap-1">
                        {[
                          ['/brand/base-logo.jpeg', 'Base', false],
                          ['/brand/arbitrum-logo.jpeg', 'Arbitrum', false],
                          ['/brand/arc-logo.jpeg', 'Arc', true],
                          ['/brand/solana-logo.jpeg', 'Solana', true],
                        ].map(([logo, name, invert], index) => <span key={String(name)} className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[7px] font-semibold ${index === 0 ? 'bg-white/10' : 'opacity-55'}`}><img src={String(logo)} alt="" className={`h-5 w-5 rounded object-cover grayscale contrast-200 ${invert ? 'invert' : ''}`} />{name}</span>)}
                      </div><ArrowRight className="h-3 w-3" />
                    </div>
                    <p className="mt-3 border-t border-white/10 pt-3 text-center text-sm font-semibold">0 <span className="text-[8px] font-medium text-white/50">USDC</span></p>
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {([[PocketSend, 'Send'], [PocketStore, 'XPay'], [PocketSwap, 'Swap'], [PocketDeposit, 'Receive']] as const).map(([Icon, label]) => <span key={label} className="flex flex-col items-center gap-2 text-[8px] font-semibold text-gray-700"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-100 bg-white shadow-sm"><Icon className="h-4 w-4" /></span>{label}</span>)}
                  </div>
                  <div className="mt-6"><div className="flex items-center justify-between"><p className="text-[10px] font-bold">Recent activity</p><span className="text-[8px] font-semibold text-gray-500">View all</span></div><p className="px-3 py-8 text-center text-[9px] leading-4 text-gray-500">Your completed payments will appear here.</p></div>
                  <div className="mt-auto grid grid-cols-4 gap-1 border-t border-gray-200 pt-3">
                    {([[PocketHome, 'Home'], [PocketReceipt, 'Bills'], [PocketCard, 'Cards'], [PocketProfile, 'Profile']] as const).map(([Icon, label], index) => <span key={label} className={`flex flex-col items-center gap-1.5 text-[8px] font-semibold ${index === 0 ? 'text-gray-950' : 'text-gray-400'}`}><span className="relative"><Icon className={`h-[18px] w-[18px] ${index === 0 ? 'stroke-[2.5]' : ''}`} />{label === 'Cards' && <span className="absolute -right-4 -top-1 rounded-full bg-gray-100 px-1 py-0.5 text-[5px] text-gray-500">Soon</span>}</span>{label}</span>)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="xstocks" data-no-text-reveal className="foundation-light-section foundation-deck-section foundation-mobile-section hpl-snap-section relative overflow-hidden bg-[#f6f8fc] text-slate-950">
        <div className="hpl-section-content relative mx-auto grid w-full max-w-7xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-2 lg:px-10">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[.28em] text-blue-700">XStocks on X Layer</p>
            <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-.045em] sm:text-5xl">A new side to your Pocket.</h2>
            <p className="mt-5 text-sm leading-7 text-slate-600">Discover tokenized stocks, manage individual holdings and buy, sell or swap supported assets. Use selected assets at XPay terminals that accept them.</p>
            <a href={`${POCKET_URL}/xstocks/home`} className="foundation-primary-cta mt-7 inline-flex h-12 items-center gap-4 px-5 text-sm font-semibold">Explore XStocks <ArrowRight className="h-4 w-4" /></a>
            <p className="mt-5 max-w-md text-xs leading-5 text-slate-500">These tokens follow the value of stocks. They are not the same as owning company shares, and their value can fall. Availability and eligibility apply.</p>
          </div>
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 sm:p-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-5"><span className="flex items-center gap-2 font-semibold"><CPurseIcon size={24} />Pocket</span><span className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white">XStocks</span></div>
            <p className="mt-6 text-xs font-medium text-slate-500">Explore supported assets</p>
            <div className="mt-2 divide-y divide-slate-100">{featuredStocks.map(asset => <div key={asset.symbol} className="flex items-center gap-4 py-4"><img src={asset.icon} alt="" loading="lazy" className="h-10 w-10 rounded-full object-contain" /><div><p className="text-sm font-semibold">{asset.name}</p><p className="mt-1 text-xs text-slate-500">{asset.symbol}</p></div><TrendingUp className="ml-auto h-4 w-4 text-slate-400" /></div>)}</div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-semibold">{['Buy', 'Sell', 'Swap'].map(action => <span key={action} className="rounded-xl bg-slate-50 py-3">{action}</span>)}</div>
            <p className="mt-5 text-xs text-slate-500">Quotes and holdings are available inside Pocket.</p>
          </div>
        </div>
      </section>

      <section id="stack" data-no-text-reveal className="foundation-light-section foundation-deck-section foundation-mobile-section foundation-mobile-section-tight hpl-snap-section relative overflow-hidden px-5 py-24 text-gray-950 sm:px-8 lg:px-10">
        <div className="foundation-section-backdrop absolute inset-0 bg-[radial-gradient(circle_at_8%_14%,rgba(37,99,235,.11),transparent_29%),radial-gradient(circle_at_90%_82%,rgba(6,182,212,.09),transparent_27%),linear-gradient(145deg,#fbfdff_0%,#f3f7ff_50%,#f8fafc_100%)]" />
        <div className="absolute left-[48%] top-1/2 h-[620px] w-[620px] -translate-y-1/2 rounded-full bg-blue-100/[.30] blur-3xl" />

        <div className="hpl-section-content relative z-10 mx-auto flex min-h-[calc(100dvh-12rem)] w-full max-w-7xl items-center">
          <div className="grid w-full gap-12 max-sm:gap-5 lg:grid-cols-[.78fr_1.22fr]">
            <div id="about" key="stack-copy-v2" className="max-w-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-700 max-sm:text-[10px] max-sm:tracking-[0.22em]">Built with</p>
              <h2 className="mt-3 max-w-xl text-4xl font-semibold tracking-[-0.04em] max-sm:mt-2 sm:text-5xl">
                The technology behind your payments.
              </h2>
              <p className="mt-5 max-w-xl text-sm leading-6 text-gray-600 max-sm:mt-2 max-sm:text-xs max-sm:leading-5">
                These services help Pocket manage wallets, move payments, trade supported assets and keep records.
              </p>
            </div>

            <div data-no-text-reveal className="foundation-surface-card grid overflow-hidden rounded-[28px] px-5 py-2 max-sm:grid-cols-2 sm:grid-cols-2 sm:px-6">
              {stack.map((item, index) => (
                <div key={item.name} className="stack-rail-card border-b border-slate-100 py-3 odd:pr-4 even:border-l even:pl-4 max-sm:py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="stack-rail-index flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[8px] font-semibold tracking-[0.08em] text-white">{String(index + 1).padStart(2, '0')}</span>
                    <p className="stack-rail-title text-[13px] font-semibold tracking-[-0.01em] text-slate-950 max-sm:text-xs">{item.name}</p>
                  </div>
                  <p className="stack-rail-copy mt-2 text-[11px] leading-[1.55] text-slate-600 max-sm:text-[10px] max-sm:leading-4">{item.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="api" data-no-text-reveal className="foundation-light-section foundation-deck-section foundation-mobile-section foundation-mobile-section-tight hpl-snap-section relative overflow-hidden px-5 py-24 text-slate-950 sm:px-8 lg:px-10" style={{ backgroundColor: '#f6f8fc', color: '#020617', colorScheme: 'light' }}>
        <div className="foundation-section-backdrop absolute inset-0 bg-[radial-gradient(circle_at_8%_14%,rgba(37,99,235,.11),transparent_29%),radial-gradient(circle_at_90%_82%,rgba(6,182,212,.09),transparent_27%),linear-gradient(145deg,#fbfdff_0%,#f3f7ff_50%,#f8fafc_100%)]" />
        <div className="absolute left-[44%] top-1/2 h-[620px] w-[620px] -translate-y-1/2 rounded-full bg-blue-100/[.30] blur-3xl" />
        <div className="hpl-section-content relative z-10 mx-auto grid min-h-[calc(100dvh-12rem)] w-full max-w-7xl items-center gap-10 lg:grid-cols-[.72fr_1.28fr]">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-700">For developers</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-slate-950 sm:text-5xl">Add payments to what you are building.</h2>
            <p className="mt-5 max-w-lg text-sm leading-6 text-slate-700">
              Create a developer project, connect a payment page and receive updates when people pay. Your app can check the result before delivering a product or service.
            </p>
          </div>

          <aside className="foundation-surface-card api-portal-card overflow-hidden rounded-[28px] px-5 py-2 text-slate-950 sm:px-6" style={{ backgroundColor: '#ffffff', color: '#0f172a', colorScheme: 'light' }}>
            {[
              { icon: Wallet, title: 'A ready-made payment page', copy: 'Customers review the amount and pay, without you building the whole checkout.' },
              { icon: Activity, title: 'Payments for AI tools', copy: 'Connect supported agent payment flows, with clear approval and payment checks.' },
              { icon: ArrowLeftRight, title: 'More tools for your app', copy: 'Explore swaps, XStocks Agreements and funding tools where enabled for your project.' },
              { icon: ShieldCheck, title: 'Know when someone has paid', copy: 'Check payment status and receive secure updates, called webhooks.' },
            ].map(({ icon: Icon, title, copy }, index) => (
              <div key={title} className="grid grid-cols-[32px_minmax(0,1fr)] items-center gap-3 border-b border-slate-100 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-white"><Icon className="h-3.5 w-3.5" /></span>
                <div>
                  <div className="flex items-baseline gap-2">
                    <h3 className="api-card-title text-sm font-semibold tracking-[-0.02em] text-slate-950">{title}</h3>
                    <span className="text-[8px] font-semibold tracking-[.12em] text-slate-400">0{index + 1}</span>
                  </div>
                  <p className="api-card-copy mt-1 text-[11px] leading-4 text-slate-600">{copy}</p>
                </div>
              </div>
            ))}

            <div className="border-b border-slate-100 py-3">
              <p className="text-[9px] font-semibold uppercase tracking-[.16em] text-slate-500">Available networks</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold text-slate-700">
                {['Human checkout: Base, Arbitrum, Arc', 'Agent checkout: Base, Arc', 'Product APIs: activation required'].map(item => (
                  <span key={item} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">{item}</span>
                ))}
              </div>
            </div>

            <div className="border-b border-slate-100 py-3">
              <p className="text-[9px] font-semibold uppercase tracking-[.16em] text-slate-500">Built for</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['AI and API services', 'Marketplaces', 'Commerce and POS', 'Creator apps', 'SaaS and invoicing', 'Events and ticketing'].map(category => (
                  <span key={category} className="rounded-full bg-blue-950 px-2.5 py-1 text-[10px] font-semibold text-white" style={{ backgroundColor: '#172554', color: '#ffffff' }}>{category}</span>
                ))}
              </div>
            </div>

            <div className="grid gap-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><KeyRound className="h-4 w-4" /></span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="api-card-title text-sm font-semibold text-slate-950">Developer portal</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[.1em] text-slate-500">Privy secured</span>
                  </div>
                  <p className="api-card-copy mt-1 max-w-md text-[11px] leading-4 text-slate-600">Choose your project settings, create an API key and connect payment updates.</p>
                </div>
              </div>
              <div className="flex gap-2 sm:flex-col">
                <Link to="/developers" className="api-primary-action inline-flex h-9 items-center justify-center gap-2 rounded-full bg-slate-950 px-4 text-[10px] font-semibold text-white transition hover:bg-blue-700">
                  Open portal <ArrowRight className="h-3 w-3" />
                </Link>
                <Link to="/docs/api" className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-[10px] font-semibold text-slate-800 transition hover:bg-blue-50">
                  API reference <Webhook className="h-3 w-3" />
                </Link>
              </div>
            </div>
            <p className="pb-2 text-center text-[10px] leading-4 text-slate-500">Product access varies by project. <a href="/api/v2/capabilities" className="underline underline-offset-2">View current API availability</a>.</p>
          </aside>
        </div>
      </section>

      <section id="projects" data-no-text-reveal className="foundation-light-section foundation-deck-section foundation-mobile-section hpl-snap-section relative overflow-hidden">
        <div className="hpl-section-content relative mx-auto flex w-full max-w-7xl flex-col justify-center gap-9 px-5 sm:px-8 lg:px-10">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[.22em] text-blue-700">The wider ecosystem</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-.045em] text-slate-950 sm:text-5xl">Projects building on our rails</h2>
            <p className="mt-5 text-sm leading-7 text-slate-600">These projects use Hash PayLink to connect payments, check their progress and provide receipts.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {[
              {name:'Hash PayStream',label:'Payments, work and trade',copy:'Send USDC, manage work agreements and trade using XStocks on X Layer. Hash PayLink connects the payment steps, status updates and receipts.',href:'https://hashpaystream.app'},
              {name:'PolyDesk',label:'Tools for Polymarket apps and agents',copy:'Tools that help apps and AI agents work with Polymarket prediction markets. Hash PayLink handles funding checkout, payment checks and receipts.',href:'https://polydesk.trade'},
            ].map(project => <article key={project.name} className="foundation-surface-card flex flex-col rounded-[28px] p-6 sm:p-8">
              <p className="text-xs font-medium text-blue-700">{project.label}</p>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{project.name}</h3>
              <p className="mt-4 max-w-lg text-sm leading-7 text-slate-600">{project.copy}</p>
              <a href={project.href} target="_blank" rel="noreferrer" className="foundation-primary-cta mt-7 inline-flex min-h-12 w-fit items-center gap-4 px-5 text-sm font-semibold">Explore {project.name}<ArrowRight className="h-4 w-4" /></a>
            </article>)}
          </div>
          <Link to="/developers" className="inline-flex w-fit items-center gap-3 text-sm font-semibold text-blue-700 underline underline-offset-4">Building something of your own? Start here <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      <section id="faq" key="foundation-faq-current-v4" data-no-text-reveal className="foundation-light-section foundation-deck-section foundation-mobile-section foundation-mobile-section-tight hpl-snap-section relative overflow-hidden px-5 py-24 text-gray-950 sm:px-8 lg:px-10">
        <div className="foundation-section-backdrop absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(37,99,235,.08),transparent_30%),radial-gradient(circle_at_86%_72%,rgba(14,165,233,.08),transparent_32%)]" />
        <div className="hpl-section-content relative z-10 mx-auto grid min-h-[calc(100dvh-12rem)] w-full max-w-7xl items-center gap-12 max-sm:min-h-0 max-sm:gap-4 lg:grid-cols-[.78fr_1.22fr]">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-700 max-sm:text-[10px] max-sm:tracking-[0.22em]">FAQs</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-gray-950 max-sm:mt-2 sm:text-5xl">
              A few things you might want to know.
            </h2>
            <p className="mt-5 text-sm leading-6 text-gray-600 max-sm:mt-2 max-sm:text-xs max-sm:leading-5">
              Pocket, XStocks, XPay and developer tools, explained simply.
            </p>
            <div className="mt-8 flex flex-col gap-3 max-sm:hidden sm:flex-row">
              <a
                href={POCKET_URL}
                className="foundation-primary-cta inline-flex h-11 items-center justify-center gap-2 px-5 text-sm font-semibold shadow-[0_18px_50px_rgba(15,23,42,.12)] transition hover:bg-gray-800"
              >
                Open Pocket <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                to="/developers"
                className="foundation-secondary-cta inline-flex h-11 items-center justify-center px-5 text-sm font-semibold shadow-[0_14px_44px_rgba(15,23,42,.06)] transition hover:bg-white"
              >
                Developer portal
              </Link>
            </div>
          </div>

          <div className="foundation-surface-card grid overflow-hidden rounded-[28px] px-4 py-2 sm:grid-cols-2 sm:px-5">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index
              return (
                <div key={faq.question} className={`faq-item self-start border-b border-slate-100 px-2 even:border-l even:pl-4 odd:pr-4 ${isOpen ? 'active' : ''}`}>
                  <button
                    type="button"
                    className="faq-header flex min-h-11 w-full items-center justify-between gap-3 py-2.5 text-left"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaq(isOpen ? -1 : index)}
                  >
                    <span className="text-[12px] font-semibold leading-4 tracking-[-0.01em] text-slate-950 max-sm:text-[11px]">{faq.question}</span>
                    <span className="faq-icon flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-light leading-none text-slate-500">
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
                    <p className="max-w-2xl pb-3 text-[11px] leading-[1.55] text-slate-600">{faq.answer}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </section>
      <section id="contact" data-no-text-reveal className="foundation-ending hpl-snap-section relative bg-white text-slate-950" style={{ colorScheme: 'light' }}>
        <footer className="mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col justify-center px-5 py-24 sm:px-8 lg:px-10">
          <div className="grid gap-10 pb-12 md:grid-cols-[1.3fr_1fr_1fr]">
            <div>
              <a href="#" className="inline-flex items-center gap-3 text-xl font-semibold tracking-tight" aria-label="Hash PayLink home"><HashMark className="h-9 w-9 object-contain" />Hash PayLink</a>
              <p className="mt-4 max-w-sm text-sm leading-6 text-slate-500">Digital dollars, stock tokens and simpler everyday payments.</p>
            </div>
            <nav aria-label="Explore Hash PayLink" className="space-y-3 text-sm">
              <p className="mb-4 font-semibold">Explore</p>
              <a className="block text-slate-600 hover:text-black" href={POCKET_URL}>Pocket</a>
              <a className="block text-slate-600 hover:text-black" href={`${POCKET_URL}/xstocks/home`}>XStocks</a>
              <a className="block text-slate-600 hover:text-black" href={`${POCKET_URL}/xpay`}>XPay</a>
              <a className="block text-slate-600 hover:text-black" href="#projects">Projects on our rails</a>
              <Link className="block text-slate-600 hover:text-black" to="/developers">Developer portal</Link>
            </nav>
            <nav aria-label="Contact Hash PayLink" className="space-y-3 text-sm">
              <p className="mb-4 font-semibold">Talk to us</p>
              <a className="block text-slate-600 hover:text-black" href="mailto:support@hashpaylink.com">support@hashpaylink.com</a>
              <a className="block text-slate-600 hover:text-black" href="https://x.com/Hash_PayLink" target="_blank" rel="noreferrer">Hash PayLink on X</a>
              <a className="block text-slate-600 hover:text-black" href="https://x.com/PocketByHash" target="_blank" rel="noreferrer">Pocket on X</a>
            </nav>
          </div>
          <div className="border-t border-slate-200 pt-9">
            <p className="text-center text-sm leading-6 text-slate-500">Built with partners that help us move digital dollars, support stocks and keep payment records.</p>
            <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
              {ecosystemPartners.map(partner => <a key={partner.name} href={partner.href} target="_blank" rel="noreferrer" className="group block">
                <div className="flex h-12 items-center gap-3">
                  {'logo' in partner && partner.logo && <img src={partner.logo} alt="" loading="lazy" className="h-10 w-10 object-contain" />}
                  <span className="text-xl font-semibold tracking-tight">{partner.name}</span>
                  <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1" />
                </div>
                <p className="mt-3 text-xs font-semibold">{partner.role}</p>
                <p className="mt-2 max-w-xs text-xs leading-5 text-slate-500">{partner.copy}</p>
              </a>)}
            </div>
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-6 text-xs text-slate-500">
            <p>&copy; {new Date().getFullYear()} Hash Technologies Limited</p>
            <div className="flex gap-5"><Link to="/docs/terms" className="hover:text-black">Terms</Link><Link to="/docs/privacy" className="hover:text-black">Privacy</Link><Link to="/docs/api" className="hover:text-black">Documentation</Link></div>
          </div>
        </footer>
      </section>

      </div>
      </div>
    </main>
  )
}
