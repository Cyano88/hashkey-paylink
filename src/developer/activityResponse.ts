export async function readActivityResponse(response: Response) {
  if (response.status === 401) throw Error('Sign in again to view activity.')
  if (response.status === 403) throw Error('You do not have access to this project’s activity.')
  if (response.status >= 500) throw Error('Activity is temporarily unavailable. Please try again shortly.')
  const data = await response.json().catch(() => null)
  if (!data || typeof data !== 'object' || Array.isArray(data) || !response.ok || data.ok !== true) {
    throw Error('Activity could not be loaded. Please try again.')
  }
  return data
}
