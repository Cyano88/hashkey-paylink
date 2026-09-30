import { HardhatUserConfig, subtask } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from 'hardhat/builtin-tasks/task-names'
// Isolated local tests. No dotenv, deployer key or mainnet network configuration.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({solcVersion}) => {
  const longVersion = require('solc').version()
  if (solcVersion !== '0.8.26' || !longVersion.startsWith('0.8.26+')) throw Error('Unexpected local gift compiler')
  return {compilerPath:require.resolve('solc/soljson.js'),isSolcJs:true,version:solcVersion,longVersion}
})
const config: HardhatUserConfig = {
 defaultNetwork:'hardhat',solidity:{version:'0.8.26',settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun'}},
 networks:{hardhat:{chainId:31337}},paths:{sources:'./contracts/gifts',tests:'./test',artifacts:'./artifacts-gifts',cache:'./cache-gifts'},
 typechain:{outDir:'./typechain-gifts',target:'ethers-v6'},
}
export default config
