export type AttentionCase={id:string;workspaceId?:string;projectId?:string;humanSupport?:boolean;status:string;escalation?:{status:string;destination:string}}
export function needsSupportReply(c:AttentionCase){return c.humanSupport!==false&&['open','assigned'].includes(c.status)&&c.escalation?.status!=='pending'}
export function needsBusinessReview(p:{accountType?:string;verificationStatus?:string}){return p.accountType!=='individual'&&p.verificationStatus==='submitted'}
