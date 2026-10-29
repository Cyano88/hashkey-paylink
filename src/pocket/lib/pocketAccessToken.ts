/** Translate session transport failures without retrying any payment operation. */
export async function readPocketAccessToken(reader: () => Promise<string | null>) {
  try { return await reader() }
  catch (reason) {
    const error = reason as { name?: string; message?: string }
    if (/timeout|timed out|aborted|failed to fetch|network|<no response>/i.test(`${error?.name || ''} ${error?.message || ''}`)) {
      throw new Error('Could not refresh your sign-in session. Check your connection and try again.')
    }
    throw reason
  }
}
