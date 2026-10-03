import {ethers,network} from 'hardhat'
import fs from 'node:fs'
import path from 'node:path'
async function main(){
 if(network.name!=='hardhat')throw Error('Local simulation network only.')
 const manifest=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../src/pocket/lib/pocketStockGiftDeployment.json'),'utf8'))
 const token='0xc845b2894dbddd03858fd2d643b4ef725fe0849d'
 await ethers.provider.send('hardhat_setCode',[token,'0x00'])
 const contract=await(await ethers.getContractFactory('PocketStockGiftEscrow')).deploy([token],manifest.treasury,manifest.authority)
 await contract.waitForDeployment()
 fs.writeFileSync(path.resolve(__dirname,'../../.codex-temp/stock-share-runtime.json'),JSON.stringify({runtime:await ethers.provider.getCode(await contract.getAddress())}))
 console.log('Exported local simulation runtime; no live deployment.')
}
main().catch(e=>{console.error(e);process.exitCode=1})
