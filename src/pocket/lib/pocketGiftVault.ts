import {Capacitor} from '@capacitor/core'
import {NativeBiometric,AccessControl} from '@capgo/capacitor-native-biometric'
import {createGiftDraftVault} from '../features/gifts/giftDraftVault'
/** OS-protected credentials, matching the existing Pocket wallet-session storage. */
export function nativeGiftDraftVault(owner:string){
 if(!Capacitor.isNativePlatform())throw Error('Create gifts in the Pocket app.')
 return createGiftDraftVault(owner,{
  put:async(server,password)=>{await NativeBiometric.setCredentials({server,username:owner,password,accessControl:AccessControl.NONE})},
  remove:async server=>{await NativeBiometric.deleteCredentials({server})},
  get:async server=>{const exists=await NativeBiometric.isCredentialsSaved({server});if(!exists.isSaved)return null;const value=await NativeBiometric.getCredentials({server});if(value.username!==owner)throw Error('Gift belongs to another account.');return value.password},
 },localStorage)
}
