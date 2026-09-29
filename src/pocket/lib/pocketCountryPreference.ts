// Display preference only. Verification and payment permissions are server-owned.
export type PocketCountry = 'NG' | 'UG'
const key = (owner: string) => 'pocket.country:' + owner.trim().toLowerCase()
export function readPocketCountry(owner: string): PocketCountry {
 try { return owner && localStorage.getItem(key(owner)) === 'UG' ? 'UG' : 'NG' } catch { return 'NG' }
}
export function savePocketCountry(owner: string, country: PocketCountry) {
 if (!owner || !['NG', 'UG'].includes(country)) return
 try { localStorage.setItem(key(owner), country) } catch { /* A display preference must not block verification. */ }
}
export const currencyForPocketCountry = (country: PocketCountry): 'NGN' | 'UGX' => country === 'UG' ? 'UGX' : 'NGN'
