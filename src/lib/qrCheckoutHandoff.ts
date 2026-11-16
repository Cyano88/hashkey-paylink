export function qrCheckoutHandoff(id:string,cash=false){
 if(!/^xp_[0-9a-f-]{36}$/.test(id))throw Error('Invalid QR reference.')
 const path='/xpay/checkout/'+id,query='?method='+(cash?'cash_balance':'stablecoins')
 const nativePath='/open/checkout/'+id+query
 const url='https://app.hashpaylink.com'+nativePath
 const fallback='https://app.hashpaylink.com'+path+query+'&pocketFallback=1'
 return {url,fallback:path+query+'&pocketFallback=1',browser:path+query+'&browser=1',android:'intent://app.hashpaylink.com'+nativePath+'#Intent;scheme=https;package=com.hashpaylink.pocket;S.browser_fallback_url='+encodeURIComponent(fallback)+';end'}
}
