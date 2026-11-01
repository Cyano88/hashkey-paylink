/** A completed initialization can precede wallet-list visibility. Never treat
 * that temporary empty read as permission to create a second wallet set. */
export async function finishInitialCircleWalletSetup<T>(deps: {
  initialize(): Promise<boolean>
  read(): Promise<T>
  empty(value: T): boolean
  create(): Promise<void>
  wait(): Promise<void>
}): Promise<T> {
  const initialized = await deps.initialize()
  let snapshot = await deps.read()
  if (initialized) {
    for (let attempt = 0; deps.empty(snapshot) && attempt < 5; attempt++) {
      await deps.wait()
      snapshot = await deps.read()
    }
    if (deps.empty(snapshot)) throw new Error('Your wallets are still being prepared. Wait a moment, then retry Circle sign in.')
    return snapshot
  }
  if (deps.empty(snapshot)) {
    await deps.create()
    snapshot = await deps.read()
  }
  return snapshot
}
