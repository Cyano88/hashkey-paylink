export type BuilderProfile = {id:string;name:string;type:'individual'|'business';createdAt?:string}
export type ProfileProject = {id:string;name:string;accountType?:'individual'|'business';builderProfileId?:string}
export const PERSONAL_PROFILE:BuilderProfile={id:'personal',name:'Personal',type:'individual'}
export function projectBuilderProfileId(project:ProfileProject) {
 return project.builderProfileId || (project.accountType==='individual'?'personal':'business_'+project.id)
}
// Existing company apps stay in distinct business contexts: a shared login is not proof of one legal entity.
export function builderProfilesForProjects(projects:readonly ProfileProject[],stored:readonly BuilderProfile[]=[]):BuilderProfile[] {
 const profiles=new Map<string,BuilderProfile>([[PERSONAL_PROFILE.id,PERSONAL_PROFILE]])
 for(const profile of stored)if(profile.type==='business')profiles.set(profile.id,profile)
 for(const project of projects){const id=projectBuilderProfileId(project);if(id!=='personal'&&!profiles.has(id))profiles.set(id,{id,name:project.name,type:'business'})}
 return [...profiles.values()]
}
export function validBuilderProfileId(value:unknown):value is string {
 return typeof value==='string'&&(value==='personal'||/^business_[a-zA-Z0-9_-]{8,90}$/.test(value))
}
