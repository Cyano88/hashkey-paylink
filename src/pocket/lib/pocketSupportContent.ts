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
] as const
export const pocketSupportTopics = ['Deposit', 'Transfer', 'Bills', 'XStocks', 'Account', 'Talk to support'] as const
export function pocketSupportAnswer(message: string): { text: string; handoff: boolean } {
  const q = message.trim().toLowerCase()
  const exact = pocketSupportFaqs.find(item => item.question.toLowerCase() === q)
  if (exact) return { text: exact.answer, handoff: false }
  const topic = ({deposit: 1, transfer: 2, bills: 4, xstocks: 7, account: 9} as Record<string, number>)[q]
  if (topic !== undefined) return { text: pocketSupportFaqs[topic].answer + ' Tell me what you need help with.', handoff: false }
  if (/^(hi|hello|hey|good morning|good afternoon)[!. ]*$/.test(q)) return {text: 'Hello! How can I help with Pocket today?', handoff: false}
  return { text: q === 'talk to support' ? 'Your conversation is with Pocket Support now. Tell us what happened; your messages will stay here for the team.' : 'I have saved this for Pocket Support to review. If it concerns a transaction, open it in Activity and use Report an issue to attach its verified details. I cannot confirm a cause from this message alone.', handoff: true }
}
