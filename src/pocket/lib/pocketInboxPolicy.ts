export type PocketNoticeCategory = 'announcement' | 'security' | 'verification' | 'support'
export function isPocketInboxNotice(notice: {category?: unknown}): boolean {
 return ['announcement','security','verification','support'].includes(String(notice.category || ''))
}
export function isIncomingPocketRequest(request: {direction: string; status: string}): boolean {
 return request.direction === 'incoming' && ['pending','accepted'].includes(request.status)
}
