import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Send, X } from 'lucide-react'

type AgentHashMessage = {
  from: 'user' | 'bot'
  text: string
  link?: { label: string; href: string }
}

const STREAM_AGENT_WELCOME: AgentHashMessage = {
  from: 'bot',
  text: 'Agent Hash is ready for HashpayStream, a Hash PayLink creator product powered by ZeroScout intelligence. I can help publish paid content, price a drop, explain pay-as-you-read, summarize unlocked content, or read creator earnings.',
}

const THINKING_COPY = ['Reading Stream context...', 'Checking creator flow...', 'Preparing guidance...', 'Keeping it creator-only...']

function StreamAgentHashIcon({ header = false, staticPose = false }: { header?: boolean; staticPose?: boolean }) {
  return (
    <div className={`ask-hash-live-agent shrink-0 ${staticPose ? 'ask-hash-live-agent--static' : ''} ${header ? 'ask-hash-live-agent--header' : ''}`} aria-hidden="true">
      <span className="ask-hash-live-agent__head">
        <span className="ask-hash-live-agent__eye ask-hash-live-agent__eye--left" />
        <span className="ask-hash-live-agent__eye ask-hash-live-agent__eye--right" />
        <span className="ask-hash-live-agent__mouth" />
      </span>
      <span className="ask-hash-live-agent__antenna" />
      <span className="ask-hash-live-agent__bubble">
        <span />
        <span />
        <span />
      </span>
    </div>
  )
}

function StreamAgentThinking() {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStep(index => (index + 1) % THINKING_COPY.length)
    }, 900)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="max-w-[82%]">
      <div className="inline-flex items-center rounded-[18px] rounded-bl-md bg-[#f0f0f0] px-3.5 py-2.5 text-sm shadow-sm dark:bg-white/[0.08]">
        <span className="inline-flex h-4 items-center gap-1">
          {[0, 1, 2].map(index => (
            <span
              key={index}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 dark:bg-gray-500"
              style={{ animationDelay: `${index * 120}ms` }}
            />
          ))}
        </span>
      </div>
      <p className="ml-3 mt-1 text-[11px] italic text-gray-400">{THINKING_COPY[step]}</p>
    </div>
  )
}

function linksFromAgentText(text: string) {
  const matches = text.match(/https?:\/\/[^\s)]+/g) ?? []
  return Array.from(new Set(matches)).slice(0, 4).map(href => {
    try {
      const url = new URL(href)
      const path = `${url.pathname}${url.search}`.replace(/\/$/, '')
      return {
        href,
        label: `${url.hostname}${path}`.replace(/^www\./, ''),
      }
    } catch {
      return { href, label: href }
    }
  })
}

function textWithoutAgentLinks(text: string) {
  return text.replace(/https?:\/\/[^\s)]+/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function streamPageContext() {
  if (typeof window === 'undefined') return 'HashpayStream creator app.'
  const { pathname, search } = window.location
  if (pathname.startsWith('/gate')) return `HashpayStream gated content checkout. URL params: ${search.slice(0, 600)}`
  if (pathname.startsWith('/creator-admin')) return 'HashpayStream creator admin approvals.'
  if (pathname.startsWith('/creator')) return 'HashpayStream Creator Hub for Discover, Publish, Earnings, and Streams.'
  return 'HashpayStream creator app.'
}

function isClearChatCommand(value: string) {
  return /^(clear|reset|delete)\s+(chat|conversation|history)$/i.test(value.trim())
    || /^(clear|reset)\s*$/i.test(value.trim())
}

export function StreamAgentHash() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<AgentHashMessage[]>(() => {
    try {
      const saved = window.localStorage.getItem('hashpaystream-agent-hash')
      const parsed = saved ? JSON.parse(saved) as AgentHashMessage[] : null
      return Array.isArray(parsed) && parsed.length ? parsed.slice(-30) : [STREAM_AGENT_WELCOME]
    } catch {
      return [STREAM_AGENT_WELCOME]
    }
  })
  const [typing, setTyping] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    try {
      window.localStorage.setItem('hashpaystream-agent-hash', JSON.stringify(messages.slice(-30)))
    } catch {
      // Local chat memory is best-effort.
    }
  }, [messages])

  useEffect(() => {
    if (!open) return
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node | null
      if (target && panelRef.current?.contains(target)) return
      if (target && fabRef.current?.contains(target)) return
      close()
    }
    window.addEventListener('mousedown', handleOutsideClick)
    return () => window.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  function scrollToBottom() {
    window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
  }

  function openPanel() {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    setMounted(true)
    window.requestAnimationFrame(() => setOpen(true))
  }

  function close() {
    setOpen(false)
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => setMounted(false), 220)
  }

  function toggle() {
    if (open) close()
    else openPanel()
  }

  function clearChat() {
    setInput('')
    setTyping(false)
    setMessages([{
      from: 'bot',
      text: 'Chat cleared. I can help with HashpayStream creator posts, pay-as-you-read, x402 unlocks, receipts, and earnings.',
    }])
    try {
      window.localStorage.removeItem('hashpaystream-agent-hash')
    } catch {
      // Local chat memory is best-effort.
    }
    scrollToBottom()
  }

  async function askAgent(text = input) {
    const question = text.trim()
    if (!question || typing) return
    if (isClearChatCommand(question)) {
      clearChat()
      return
    }
    setMessages(current => [...current, { from: 'user', text: question }])
    setInput('')
    setTyping(true)
    scrollToBottom()

    const recent = messages
      .slice(-8)
      .map(message => `${message.from === 'user' ? 'User' : 'Agent Hash'}: ${message.text.replace(/\s+/g, ' ').slice(0, 180)}`)
      .join(' | ')

    try {
      const res = await fetch('/api/agent-ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: 'hashpaystream-agent-hash',
          payer: 'HashpayStream user',
          question,
          accessMode: 'helper-free',
          helperMode: 'streampay',
          memorySummary: `${streamPageContext()} Agent Hash mode: HashpayStream Creator. Recent context: ${recent || 'new session'}. Current message: ${question}`.slice(0, 1600),
        }),
      })
      const contentType = res.headers.get('content-type') || ''
      const data = contentType.includes('application/json')
        ? await res.json() as { answer?: string; error?: string }
        : { error: 'Agent Hash received an unreadable response. Please try again shortly.' }
      if (!res.ok || !data.answer) throw new Error(data.error || 'Agent Hash could not answer just now.')
      setMessages(current => [...current, { from: 'bot', text: data.answer! }])
    } catch (error) {
      setMessages(current => [...current, {
        from: 'bot',
        text: error instanceof Error && error.message ? error.message : 'Agent Hash could not reach its intelligence layer just now. Please try again shortly.',
      }])
    } finally {
      setTyping(false)
      scrollToBottom()
    }
  }

  return (
    <>
      {mounted && (
        <div
          ref={panelRef}
          className={[
            'fixed bottom-20 left-2 right-2 z-50 flex h-[min(640px,calc(100vh-7rem))] origin-bottom-right flex-col overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)] transition-all duration-200 ease-[cubic-bezier(.2,.9,.2,1.08)] dark:border-white/10 dark:bg-[#111114]',
            'sm:left-auto sm:right-6 sm:w-[430px]',
            open ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-4 scale-90 opacity-0',
          ].join(' ')}
        >
          <div className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#111114]">
            <div className="flex min-w-0 items-center gap-3">
              <StreamAgentHashIcon header staticPose={!open} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">Agent Hash</p>
                <p className="mt-0.5 truncate text-[11px] font-medium text-gray-400">HashpayStream by Hash PayLink - Powered by ZeroScout</p>
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close Agent Hash"
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-[#fbfbfc] px-3 py-4 scroll-smooth dark:bg-[#0f0f12]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d8d8dd transparent' }}>
            <div className="flex justify-center">
              <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-semibold text-gray-600 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200">
                Creator mode
              </span>
            </div>

            {messages.map((message, index) => (
              <div key={index} className={`space-y-1.5 ${message.from === 'user' ? 'flex flex-col items-end' : ''}`}>
                <div className={`max-w-[82%] break-words whitespace-pre-line rounded-[18px] px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${message.from === 'user' ? 'rounded-br-md bg-black text-white dark:bg-white dark:text-gray-950' : 'rounded-bl-md bg-[#f0f0f0] text-gray-900 dark:bg-white/[0.08] dark:text-gray-100'}`}>
                  {textWithoutAgentLinks(message.text) || message.text}
                </div>
                {linksFromAgentText(message.text).map(link => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={link.href}
                    className="ml-1 inline-flex max-w-[82%] items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-500 shadow-sm transition hover:border-gray-300 hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-400 dark:hover:text-gray-100"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="min-w-0 truncate">{link.label}</span>
                  </a>
                ))}
                {message.link && (
                  <a href={message.link.href} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    {message.link.label}
                  </a>
                )}
              </div>
            ))}

            {typing && (
              <div className="flex justify-start">
                <StreamAgentThinking />
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-gray-100 bg-white p-3 dark:border-white/10 dark:bg-[#111114]">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {['Suggest a price', 'Explain checkpoints', 'Improve my post', 'Read my earnings'].map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => askAgent(prompt)}
                  disabled={typing}
                  className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-500 transition hover:bg-white hover:text-gray-800 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-gray-100"
                >
                  {prompt}
                </button>
              ))}
              <button
                type="button"
                onClick={clearChat}
                disabled={typing}
                className="rounded-full border border-transparent px-2.5 py-1 text-[11px] font-semibold text-gray-400 transition hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 dark:hover:bg-white/[0.05] dark:hover:text-gray-200"
              >
                Clear chat
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={event => setInput(event.target.value)}
                onKeyDown={event => event.key === 'Enter' && askAgent()}
                placeholder="Ask about this creator flow..."
                className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
              />
              <button
                type="button"
                onClick={() => askAgent()}
                disabled={!input.trim() || typing}
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black text-white transition-all hover:bg-gray-800 active:scale-95 disabled:opacity-40 dark:bg-white dark:text-gray-950"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        ref={fabRef}
        type="button"
        onClick={toggle}
        className="fixed bottom-5 right-4 z-50 flex h-14 w-14 items-center justify-center transition-all duration-200 hover:-translate-y-0.5 active:scale-95 sm:right-6"
        title="Agent Hash"
      >
        {open ? <X className="h-5 w-5 text-gray-500 dark:text-gray-300" /> : <StreamAgentHashIcon staticPose />}
      </button>
    </>
  )
}
