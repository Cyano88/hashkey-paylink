const RESEND_API_KEY = process.env.RESEND_API_KEY

export type SendEmailInput = {
  to: string
  fromEmail?: string
  fromName?: string
  subject: string
  text: string
  html: string
  context: string
  replyTo?: string
  idempotencyKey?: string
  attachments?: Array<{filename:string;content:string;content_type?:string}>
}

function formatFrom(email?: string, name?: string) {
  if (!email) return ''
  return name ? `${name} <${email}>` : email
}

export async function sendTransactionalEmail(input: SendEmailInput) {
  if (!RESEND_API_KEY || !input.fromEmail) {
    throw new Error(`${input.context} email is not configured. Set RESEND_API_KEY and a verified FROM email.`)
  }
  const from = formatFrom(input.fromEmail, input.fromName)
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      ...(input.idempotencyKey?{'Idempotency-Key':input.idempotencyKey}:{}),
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
      ...(input.replyTo?{reply_to:input.replyTo}:{}),
      ...(input.attachments?.length?{attachments:input.attachments}:{}),
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body ? `Resend rejected ${input.context}: ${body.slice(0, 180)}` : `Resend rejected ${input.context} email.`)
  }
  const result=await response.json() as {id?:string}
  if(!result.id)throw new Error('Email provider did not return a delivery reference.')
  return result.id
}
