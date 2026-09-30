// Routes are derived from the request identity, never an old persisted URL.
export function pocketRequestPaymentPath(id: string): string {
 if(!/^[a-zA-Z0-9:_-]{1,160}$/.test(id))throw Error('This request has an invalid reference.')
 return '/home/send?request='+encodeURIComponent(id)
}
