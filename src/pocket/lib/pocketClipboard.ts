import {Capacitor,registerPlugin} from '@capacitor/core'
const PocketClipboard=registerPlugin<{read():Promise<{value:string}>}>('PocketClipboard')
// Read only in response to the user's Paste tap; never poll or log clipboard contents.
export async function readPocketClipboard(){
 if(Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable('PocketClipboard'))return (await PocketClipboard.read()).value
 return navigator.clipboard.readText()
}
