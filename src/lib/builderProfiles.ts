export type BuilderProfile = {id:string;name:string;type:'individual'|'business';createdAt?:string;needsSetup?:boolean;legacyAppName?:string}
export type ProfileProject = {id:string;name:string;accountType?:'individual'|'business';builderProfileId?:string;removal?:{status:string}}
export const PERSONAL_PROFILE:BuilderProfile={id:'personal',name:'Personal',type:'individual'}
export function projectBuilderProfileId(project:ProfileProject) {
 return project.builderProfileId || (project.accountType==='individual'?'personal':'business_'+project.id)
}
// Existing company apps stay in distinct business contexts: a shared login is not proof of one legal entity.
export function builderProfilesForProjects(projects:readonly ProfileProject[],stored:readonly BuilderProfile[]=[]):BuilderProfile[] {
 const visibleProjects=projects.filter(project=>project.removal?.status!=='deleted')
 const profiles=new Map<string,BuilderProfile>([[PERSONAL_PROFILE.id,PERSONAL_PROFILE]])
 for(const profile of stored)if(profile.type==='business' && (profile.createdAt && !profile.needsSetup || visibleProjects.some(project=>projectBuilderProfileId(project)===profile.id)))profiles.set(profile.id,profile.createdAt&&!profile.needsSetup?profile:{...profile,name:'Business profile not set',needsSetup:true})
 for(const project of visibleProjects){const id=projectBuilderProfileId(project);if(id!=='personal'&&!profiles.has(id))profiles.set(id,{id,name:'Business profile not set',type:'business',needsSetup:true,legacyAppName:project.name})}
 return [...profiles.values()]
}
export function validBuilderProfileId(value:unknown):value is string {
 return typeof value==='string'&&(value==='personal'||/^business_[a-zA-Z0-9_-]{8,90}$/.test(value))
}
