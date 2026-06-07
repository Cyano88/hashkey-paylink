const RESEND_API_KEY = process.env.RESEND_API_KEY

type SendEmailInput = {
  to: string
  fromEmail?: string
  fromName?: string
  subject: string
  text: string
  html: string
  context: string
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
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body ? `Resend rejected ${input.context}: ${body.slice(0, 180)}` : `Resend rejected ${input.context} email.`)
  }
}
