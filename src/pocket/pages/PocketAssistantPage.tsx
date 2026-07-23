import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Copy, Mail } from 'lucide-react'
import DynamicSendButton from '../../components/DynamicSendButton'
import { PrivyConnectButton } from '../../lib/PrivyConnectButton'
import usePocketAssistantController from '../controllers/usePocketAssistantController'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { POCKET_ORIGIN } from '../lib/pocketRoutes'

const WELCOME_TEXT = 'Circle Pocket is ready. Ask me to receive USDC, settle to bank, create a POS terminal, manage wallets, fund App Pay, or find a receipt. I only offer actions currently available.'

export default function PocketAssistantPage() {
  const navigate = useNavigate()
  const { authenticated, getAccessToken } = usePocketIdentity()
  const assistant = usePocketAssistantController({ authenticated, getAccessToken })
  const [question, setQuestion] = useState('')
  const [copiedAction, setCopiedAction] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [assistant.asking, assistant.error, assistant.messages])

  function send() {
    const nextQuestion = question.trim()
    if (!nextQuestion || assistant.asking || !authenticated) return
    setQuestion('')
    void assistant.ask(nextQuestion)
  }

  async function copyAction(id: string, href: string) {
    if (!navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).toString())
      setCopiedAction(id)
      window.setTimeout(() => setCopiedAction(current => current === id ? '' : current), 1200)
    } catch {
      setCopiedAction('')
    }
  }

  function openAction(href: string) {
    const url = new URL(href, window.location.origin)
    const allowedOrigins = new Set([window.location.origin, POCKET_ORIGIN])
    if (!['http:', 'https:'].includes(url.protocol) || !allowedOrigins.has(url.origin)) return
    if (url.origin === window.location.origin) navigate(`${url.pathname}${url.search}${url.hash}`)
    else window.location.assign(url.toString())
  }

  return (
    <div className="-mx-4 -my-10 w-[calc(100%+2rem)] max-w-none min-w-0 animate-fade-in sm:-mx-6 sm:w-[calc(100%+3rem)]">
      <div className="h-[100dvh] w-full min-w-0 bg-white dark:bg-[#111114]">
        <div className="mx-auto flex h-full w-full max-w-[430px] flex-col overflow-hidden pb-3 pt-20">
          <div className="shrink-0 px-3 pb-2">
            <div className="flex items-center rounded-full border border-gray-200/90 bg-gray-50/95 px-3 py-2 shadow-[0_4px_16px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-white/[0.06] dark:shadow-none">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-bold text-gray-800 dark:text-gray-100">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                <span className="truncate">Circle Pocket selected</span>
              </span>
            </div>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="max-w-[86%] break-words rounded-[20px] rounded-bl-[6px] bg-[#f3f3f4] px-3 py-2 text-[13px] leading-[1.45] text-gray-900 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:bg-white/[0.075] dark:text-gray-100 dark:shadow-[0_10px_28px_rgba(0,0,0,0.18)]">
              {WELCOME_TEXT}
            </div>

            {!authenticated && (
              <div className="max-w-[86%] rounded-[20px] rounded-bl-[6px] bg-[#f3f3f4] p-2 dark:bg-white/[0.075]">
                <p className="px-1 pb-2 text-[13px] leading-[1.45] text-gray-900 dark:text-gray-100">Sign in to Circle Pocket so I can verify your session.</p>
                <PrivyConnectButton
                  debugLabel="pocket-assistant-email"
                  loginOptions={{ loginMethods: ['email'] }}
                  logoutOnAuthenticated={false}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-950"
                >
                  <Mail className="h-4 w-4" /> Sign in to Circle Pocket
                </PrivyConnectButton>
              </div>
            )}

            {assistant.messages.map((message, index) => (
              <div key={`${index}-${message.question}`} className="space-y-2.5">
                <div className="flex justify-end">
                  <div className="max-w-[82%] break-words rounded-[18px] rounded-br-md bg-black px-3.5 py-2 text-sm leading-relaxed text-white shadow-sm dark:bg-white dark:text-gray-950">
                    {message.question}
                  </div>
                </div>
                {message.response && <div className="max-w-[82%] break-words whitespace-pre-wrap rounded-[18px] rounded-bl-md bg-[#f0f0f0] px-3.5 py-2.5 text-sm leading-relaxed text-gray-900 shadow-sm dark:bg-white/[0.08] dark:text-gray-100">
                  {message.response.answer}
                  {message.response.actions && message.response.actions.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {message.response.actions.map(action => action.href ? (
                        <span key={action.id} className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openAction(action.href!)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-800 transition hover:bg-gray-50 dark:border-white/10 dark:bg-white/[0.08] dark:text-gray-100 dark:hover:bg-white/[0.12]"
                          >
                            <ArrowRight className="h-3 w-3" /> {action.label}
                          </button>
                          <button
                            type="button"
                            onClick={() => void copyAction(action.id, action.href!)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-800 dark:border-white/10 dark:bg-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.12]"
                            aria-label={`Copy ${action.label} link`}
                          >
                            {copiedAction === action.id ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </span>
                      ) : null)}
                    </div>
                  )}
                </div>}
              </div>
            ))}

            {assistant.asking && (
              <div className="max-w-[82%]">
                <div className="inline-flex items-center rounded-[18px] rounded-bl-md bg-[#f0f0f0] px-3.5 py-2.5 shadow-sm dark:bg-white/[0.08]">
                  <span className="inline-flex items-center gap-1">
                    {[0, 1, 2].map(index => <span key={index} className="h-2 w-2 animate-bounce rounded-full bg-[#8e8e93] dark:bg-gray-300" style={{ animationDelay: `${index * 120}ms` }} />)}
                  </span>
                </div>
                <p className="ml-3 mt-1 text-xs italic text-[#8e8e93] dark:text-gray-400">Checking context...</p>
              </div>
            )}

            {assistant.error && <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">{assistant.error}</p>}
          </div>

          <div className="shrink-0 bg-white p-3 dark:bg-[#111114]">
            <div className="relative">
              <input
                ref={inputRef}
                data-pocket-assistant-input="true"
                value={question}
                onChange={event => setQuestion(event.target.value)}
                onKeyDown={event => event.key === 'Enter' && !event.shiftKey && !assistant.asking && send()}
                placeholder="Ask about Circle Pocket..."
                disabled={!authenticated}
                className="h-14 w-full min-w-0 rounded-[28px] border border-gray-200 bg-gray-50 py-3 pl-4 pr-[4.25rem] text-sm text-gray-900 outline-none transition-shadow placeholder:text-gray-400 focus:border-gray-300 focus:ring-2 focus:ring-gray-200/80 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:focus:border-white/20 dark:focus:ring-white/10"
              />
              <DynamicSendButton
                inputText={question}
                isLoading={assistant.asking}
                onSend={send}
                onStop={assistant.stop}
                onAddAttachment={() => inputRef.current?.focus()}
                disabled={!assistant.asking && !authenticated}
                className="absolute bottom-1 right-1"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
