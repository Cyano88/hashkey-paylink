const LOCAL_OPERATION_KEYS = [
  'pocket:solana-send:operation:v2',
  'pocket:evm-send:operation:v1',
  'pocket:bank-withdraw:active',
]

const SESSION_OPERATION_KEYS = [
  'pocket:bank-withdraw:operation',
  'circle-pocket-assistant-thread',
]

export function clearPocketAccountOperationState() {
  for (const key of LOCAL_OPERATION_KEYS) window.localStorage.removeItem(key)
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index)
    if (key?.startsWith('pocket:bills:active:')) window.localStorage.removeItem(key)
  }
  for (const key of SESSION_OPERATION_KEYS) window.sessionStorage.removeItem(key)
}
