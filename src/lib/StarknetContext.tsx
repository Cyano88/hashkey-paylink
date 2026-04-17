import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'

interface StarknetContextValue {
  /** Connected Starknet account address, or null */
  address: string | null
  isConnecting: boolean
  connectError: string | null
  connect: () => Promise<void>
  disconnect: () => void
}

const StarknetContext = createContext<StarknetContextValue>({
  address: null,
  isConnecting: false,
  connectError: null,
  connect: async () => {},
  disconnect: () => {},
})

export function StarknetProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  const connect = useCallback(async () => {
    const provider = window.starknet
    if (!provider) {
      setConnectError('No Starknet wallet found. Install ArgentX or Braavos.')
      return
    }
    setIsConnecting(true)
    setConnectError(null)
    try {
      const accounts = await provider.enable()
      const addr = accounts[0] ?? provider.selectedAddress ?? null
      setAddress(addr)
    } catch {
      setConnectError('Connection rejected.')
    } finally {
      setIsConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    setAddress(null)
    setConnectError(null)
  }, [])

  return (
    <StarknetContext.Provider value={{ address, isConnecting, connectError, connect, disconnect }}>
      {children}
    </StarknetContext.Provider>
  )
}

export function useStarknet() {
  return useContext(StarknetContext)
}
