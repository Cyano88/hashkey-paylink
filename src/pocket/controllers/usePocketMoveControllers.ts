import { useMemo } from 'react'

export type PocketControllerStatus = 'blocked' | 'ready' | 'submitting' | 'completed'

export type PocketUsdcPayLinkDraft = {
  amount: string
  memo: string
  flexibleAmount: boolean
  network: string
  recipientAddress: string
}

export type PocketBankReceiveDraft = {
  amountNgn: string
  memo: string
  flexibleAmount: boolean
  bankName: string
  bankAccountLast4: string
  accountVerified: boolean
}

export type PocketPosDraft = {
  merchantName: string
  country: string
  networks: string[]
  bankName: string
  bankAccountLast4: string
  accountVerified: boolean
}

export type PocketUsdcPayLinkActions = {
  setEvmRecipientAddress: (address: string) => void
  setSolanaRecipientAddress: (address: string) => void
  selectNetwork: (network: string) => void
  toggleMultiChain: (enabled: boolean) => void
}

export type PocketBankReceiveActions = {
  setBankCountry: (country: string) => void
  setBankInstitution: (code: string, name: string, resetAccount: boolean) => void
  setBankAccount: (accountNumber: string) => void
  verifyBankAccount: () => void
}

export type PocketPosActions = {
  selectCountry: (country: string) => void
  setMerchantName: (name: string) => void
  toggleNetwork: (network: string) => void
  setBankInstitution: (code: string, name: string) => void
  setManualBankCode: (code: string) => void
  setBankAccount: (accountNumber: string) => void
  verifyBankAccount: () => void
}

type ControllerInput<TDraft, TActions = Record<string, never>> = {
  draft: TDraft
  canSubmit: boolean
  submitting: boolean
  completed: boolean
  submit: () => void
  actions?: TActions
}

export type PocketMoveController<TLane extends 'usdc' | 'bank' | 'pos', TDraft, TActions = Record<string, never>> = {
  lane: TLane
  draft: TDraft
  status: PocketControllerStatus
  canSubmit: boolean
  submitting: boolean
  submit: () => void
  actions: TActions
}

const EMPTY_ACTIONS = Object.freeze({})

export function resolvePocketControllerStatus(input: Pick<ControllerInput<unknown>, 'canSubmit' | 'submitting' | 'completed'>): PocketControllerStatus {
  if (input.completed) return 'completed'
  if (input.submitting) return 'submitting'
  return input.canSubmit ? 'ready' : 'blocked'
}

function usePocketMoveController<TLane extends 'usdc' | 'bank' | 'pos', TDraft, TActions = Record<string, never>>(
  lane: TLane,
  input: ControllerInput<TDraft, TActions>,
): PocketMoveController<TLane, TDraft, TActions> {
  const { draft, canSubmit, submitting, completed, submit, actions } = input
  return useMemo(() => ({
    lane,
    draft,
    status: resolvePocketControllerStatus({ canSubmit, submitting, completed }),
    canSubmit,
    submitting,
    submit,
    actions: (actions ?? EMPTY_ACTIONS) as TActions,
  }), [actions, canSubmit, completed, draft, lane, submit, submitting])
}

export function usePocketUsdcPayLinkController(input: ControllerInput<PocketUsdcPayLinkDraft, PocketUsdcPayLinkActions> & { actions: PocketUsdcPayLinkActions }) {
  return usePocketMoveController('usdc', input)
}

export function usePocketBankReceiveController(input: ControllerInput<PocketBankReceiveDraft, PocketBankReceiveActions> & { actions: PocketBankReceiveActions }) {
  return usePocketMoveController('bank', input)
}

export function usePocketPosController(input: ControllerInput<PocketPosDraft, PocketPosActions> & { actions: PocketPosActions }) {
  return usePocketMoveController('pos', input)
}
