export type BusinessOwner={id:string;fullName:string;birthDate:string;address:string;ownership:string;pep:boolean|null;idType:string;idNumber:string;issuingCountry:string;bvn:string;nin:string;controlPerson:boolean;director?:boolean}
export type BusinessApplication={companyName:string;tradingName:string;phone:string;website:string;address:string;registrationNumber:string;country:string;description:string;owners:BusinessOwner[];attested:boolean}
export type VerificationDocument={id:string;slot:string;name:string;mime:string;size:number;sha256:string;uploadedAt:string}
export type VerificationStatus='not_started'|'draft'|'submitted'|'changes_requested'|'approved'|'rejected'
export type BusinessVerification={status:VerificationStatus;revision:number;required:boolean;documents:VerificationDocument[];submittedAt?:string;reviewedAt?:string;feedback?:string}
export const businessDocumentSlots=[['incorporation','Certificate of incorporation'],['articles','Articles of incorporation'],['business-address','Proof of business address'],['aml','AML policy'],['kyc','KYC policy'],['licence','Business licence (if applicable)'],['other-1','Supporting document 1 (optional)'],['other-2','Supporting document 2 (optional)'],['other-3','Supporting document 3 (optional)']] as const
export const verificationLabels:Record<VerificationStatus,string>={not_started:'Not started',draft:'Draft',submitted:'Under review',changes_requested:'Changes requested',approved:'Verified',rejected:'Not approved'}
export function emptyBusinessApplication():BusinessApplication{return {companyName:'',tradingName:'',phone:'',website:'',address:'',registrationNumber:'',country:'NG',description:'',owners:[emptyBusinessOwner()],attested:false}}
export function emptyBusinessOwner():BusinessOwner{return {id:crypto.randomUUID(),fullName:'',birthDate:'',address:'',ownership:'',pep:null,idType:'',idNumber:'',issuingCountry:'NG',bvn:'',nin:'',controlPerson:false,director:false}}

// Default merchant evidence; review may request additional policy documents.
export const requiredCompanyDocumentSlots=['incorporation','articles','business-address'] as const
export function isRequiredBusinessDocument(slot:string){return (requiredCompanyDocumentSlots as readonly string[]).includes(slot)||slot.startsWith('owner-id:')||slot.startsWith('owner-address:')}
