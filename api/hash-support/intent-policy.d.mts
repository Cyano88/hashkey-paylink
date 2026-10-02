export const intentCandidates: Array<{id:string;question:string}>;
export function safeIntentQuestion(value:unknown):string|null;
export function allowedIntentCandidates(question:string,hasPayment:boolean):Array<{id:string;question:string}>;
