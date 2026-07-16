import { useEffect, useRef, useState } from 'react'
import { askPocketAgent } from '../api/pocketAgentClient'
import type { CirclePocketAgentResponse } from '../lib/pocketSchemas'

export type PocketAssistantMessage = {
  question: string
  response?: CirclePocketAgentResponse
}

const THREAD_STORAGE_KEY = 'circle-pocket-assistant-thread'

function assistantThreadId() {
  const stored = window.sessionStorage.getItem(THREAD_STORAGE_KEY)?.trim() ?? ''
  if (/^[a-zA-Z0-9:_-]{1,160}$/.test(stored)) return stored
  const suffix = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const threadId = `pocket-assistant-${suffix}`
  window.sessionStorage.setItem(THREAD_STORAGE_KEY, threadId)
  return threadId
}

export default function usePocketAssistantController({
  authenticated,
  getAccessToken,
}: {
  authenticated: boolean
  getAccessToken: () => Promise<string | null>
}) {
  const [threadId] = useState(assistantThreadId)
  const [messages, setMessages] = useState<PocketAssistantMessage[]>([])
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  async function ask(message: string) {
    const question = message.trim()
    if (!question || asking) return
    if (!authenticated) {
      setError('Sign in to Circle Pocket so I can verify your session.')
      return
    }

    setError('')
    setAsking(true)
    setMessages(current => [...current, { question }])
    const abortController = new AbortController()
    abortRef.current = abortController
    try {
      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error('Circle Pocket session is unavailable. Sign in again.')
      const response = await askPocketAgent({
        accessToken,
        threadId,
        message: question,
        signal: abortController.signal,
      })
      setMessages(current => {
        const next = [...current]
        for (let index = next.length - 1; index >= 0; index -= 1) {
          if (next[index].question === question && !next[index].response) {
            next[index] = { question, response }
            break
          }
        }
        return next
      })
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') return
      setError(requestError instanceof Error ? requestError.message : 'Circle Pocket assistant request failed.')
    } finally {
      if (abortRef.current === abortController) abortRef.current = null
      setAsking(false)
    }
  }

  function stop() {
    abortRef.current?.abort()
    abortRef.current = null
    setAsking(false)
  }

  return { messages, asking, error, ask, stop }
}
