/** Cash funding is only valid for a delivery to the user's Base wallet. */
export function cashBridgePurpose(value:unknown,destination:unknown):{purpose?:'cash'}{
 if(value===undefined)return {}
 if(value!=='cash'||destination!=='base')throw Object.assign(Error('Invalid Cash funding reference.'),{status:400})
 return {purpose:'cash'}
}
