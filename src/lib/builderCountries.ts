export const BUILDER_COUNTRIES = [{code:'NG',name:'Nigeria'},{code:'UG',name:'Uganda'},{code:'US',name:'United States'}] as const
export type BuilderCountry = typeof BUILDER_COUNTRIES[number]['code']
export function validBuilderCountry(value:unknown):value is BuilderCountry{return BUILDER_COUNTRIES.some(country=>country.code===value)}
export function builderCountryName(value?:string){return BUILDER_COUNTRIES.find(country=>country.code===value)?.name||value||'Not set'}
