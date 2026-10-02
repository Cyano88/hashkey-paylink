import {recoveryOptions,supportOptions,type SupportOption} from './pocketSupportActions'
export const POCKET_SUPPORT_HANDOFF_TEXT = "I can't answer that reliably yet. I've passed your question to Pocket Support."
export const pocketSupportFaqs = [
  { question: 'What can I do with Pocket?', answer: 'Use Pocket to send and receive USDC, pay supported Nigerian bills, make bank transfers, create payment requests and use POS. XStocks has its own trading, receiving and sending flows.' },
  { question: 'How do I deposit USDC?', answer: 'Open Receive in Stablecoins, choose the network and copy the address shown there. Send supported USDC on that exact network. Always check the receiving address for the selected network.' },
  { question: 'Where can I see my transactions?', answer: 'On the Stablecoins Home screen, open View all beside Recent activity. XStocks has its own Activity tab. Select a transaction to see its recorded status and receipt.' },
  { question: 'Why is a transfer still processing?', answer: 'Processing means Pocket has not yet confirmed the required completion state. A transaction hash alone does not prove success. Open the transaction in Activity and report it there if you need us to check it. Avoid repeating a payment while its outcome is uncertain.' },
  { question: 'How do bill payments work?', answer: 'Open Bills and choose Airtime, Data, Electricity or TV. Enter the required details and review the quote before confirming. USDC payment and delivery of your bill service are separate steps; the provider must confirm delivery.' },
  { question: 'How do I claim a bill refund?', answer: 'Open the original bill in Activity. If its status is Refund available, use its refund action and follow the confirmation. The original record tracks the refund. A failed payment does not by itself mean a refund has already arrived.' },
  { question: 'How do I send to a bank account?', answer: 'Open Send and select the bank option. Verify the recipient name, review the live quote and confirm. Your transaction details show the recorded payout state; an on-chain USDC transfer alone does not establish that the bank credited the recipient.' },
  { question: 'How do I use XStocks?', answer: 'Switch to XStocks on Home to view supported assets and use Buy, Sell or Swap. Use its Receive flow for the correct X Layer address and supported tokens. Check the quote, fees and available balance before confirming.' },
  { question: 'Does Pocket offer cards?', answer: 'Cards are coming soon. Card issuing, funding and spending are not available in Pocket yet.' },
  { question: 'How do I keep my account safe?', answer: 'Manage your PIN and biometric approval in Payment security. Never send a PIN, OTP, password, private key or recovery phrase in chat. Pocket Support does not need these to investigate an issue.' },
  { question: 'Why did my payment fail?', answer: 'The reason depends on the transaction. Open its Activity details and use Report an issue so Support receives the recorded transaction reference and status. We will not guess the cause or ask you to repeat a payment whose outcome is uncertain.' },
  { question: 'How does Pocket protect my money?', answer: "Pocket uses sign-in and payment approval controls, with PIN and optional biometrics. They help protect access, but no app can guarantee that funds are risk-free. Keep your sign-in details private and check recipients before approving payments. I can explain account security or connect you to an agent." },
] as const
export const pocketSupportTopics = ['Deposit', 'Transfer', 'Bills', 'XStocks', 'Account', 'Talk to support'] as const
export function requestsPocketHuman(message: string) {
  return /\b(human|customer\s+(?:service|support|representative)|representative|real\s+(?:person|agent)|(?:talk|speak|chat|connect|transfer|escalate).{0,35}(?:support|person|agent|team))\b/i.test(message)
}
export function pocketSupportAnswer(message: string): { text: string; handoff: boolean; options?:SupportOption[]; unresolved?:boolean } {
  const q = message.trim().toLowerCase().replace(/[\u2018\u2019]/g, "'")
  if (requestsPocketHuman(q)) return {text:'Your request is with Pocket Support. The team will reply here.',handoff:true}
  if (/^(?:(?:what(?: is|'s| are)|show me|tell me) my (?:full+ |first |last )?name(?:s|'s)?|where (?:can i|do i) (?:find|see|view) my (?:full+ |first |last )?name(?:s|'s)?)[?.! ]*$/.test(q)) return {text:'You can view your full name in Profile.',handoff:false}
  if(/\b(trust|safe|safety|secure|security|protect|protected)\b/.test(q)&&/\b(pocket|hash paylink|money|funds)\b/.test(q)&&!/\b(stolen|unauthori[sz]ed|scam|hacked)\b/.test(q))return {text:pocketSupportFaqs[11].answer,handoff:false,options:supportOptions(['security','human'])}
  const exact = pocketSupportFaqs.find(item => item.question.toLowerCase() === q)
  if (exact) return { text: exact.answer, handoff: false }
  const topic = ({deposit: 1, transfer: 2, bills: 4, xstocks: 7, account: 9} as Record<string, number>)[q]
  if (topic !== undefined) return { text: pocketSupportFaqs[topic].answer + ' Tell me what you need help with.', handoff: false }
  if (/^(hi|hello|hey|good morning|good afternoon)[!. ]*$/.test(q)) return {text: 'Hello! How can I help with Pocket today?', handoff: false}
  if(/\b(stolen|unauthori[sz]ed|scam|hacked)\b/.test(q))return {text:'This needs a support review. I am passing your message to the team. Never share your PIN or OTP.',handoff:true}
  return { text: "I'm not sure what you mean. Choose an option below, or tell me a little more.", handoff: false, unresolved:true, options:recoveryOptions(q) }
}
