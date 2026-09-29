import type {LocalCurrencyProfile,ProfileRepository} from '../local-currency-profile.js'
import {readPocketKycLevel} from './kyc-level.js'
export function withPocketKycIdentity(repository:ProfileRepository,readIdentity=readPocketKycLevel):ProfileRepository {
 async function attach(profile:LocalCurrencyProfile|undefined){
  if(!profile)return profile
  const identity=await readIdentity(profile.privyUserId)
  const name=identity.level!=='none'?identity.legalName||'':''
  // Legacy bank names remain historical data only. Never confer identity rights.
  return {...profile,firstName:name?(identity.firstName||name.split(/\s+/).slice(0,-1).join(' ')||name):'',lastName:name?(identity.lastName||name.split(/\s+/).at(-1)||''):'',resolvedName:name,nameStatus:name?'kyc_verified' as const:'unverified' as const}
 }
 return {...repository,
  get:async id=>attach(await repository.get(id)),
  getByPocketId:async id=>attach(await repository.getByPocketId(id)),
  ensure:async identity=>{const result=await repository.ensure(identity);return {...result,profile:(await attach(result.profile))!}},
  updateProfile:async(...args)=>{const result=await repository.updateProfile(...args);return {...result,profile:(await attach(result.profile))!}},
  bindBankResolvedName:async()=>{throw Object.assign(Error('Bank-name enrollment has been retired. Complete identity verification in Pocket.'),{status:410})},
 }
}
