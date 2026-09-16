import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import * as dotenv from 'dotenv'

dotenv.config()

const RAW_DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? process.env.RELAYER_PRIVATE_KEY_ARC

const PK = RAW_DEPLOYER_KEY
  ? [`0x${RAW_DEPLOYER_KEY.replace(/^0x/, '')}`]
  : []

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },

  // .sol files live one level up in contracts/
  paths: {
    sources:   './contracts',
    tests:     './test',
    artifacts: './artifacts',
    cache:     './cache',
  },

  networks: {
    base: {
      url:      'https://mainnet.base.org',
      chainId:  8453,
      accounts: PK,
    },
    arc: {
      url:      'https://rpc.mainnet.arc.io',
      chainId:  5042,
      accounts: process.env.ARC_MAINNET_DEPLOYER_PRIVATE_KEY ? [process.env.ARC_MAINNET_DEPLOYER_PRIVATE_KEY] : [],
    },
    arbitrum: {
      url:      'https://arb1.arbitrum.io/rpc',
      chainId:  42161,
      accounts: PK,
    },
    og: {
      url:      process.env.OG_RPC_URL ?? process.env.OG_EVM_RPC_URL ?? process.env.ZG_RPC_URL ?? 'https://evmrpc.0g.ai',
      chainId:  16661,
      accounts: PK,
    },
  },

  etherscan: {
    apiKey: {
      base:     process.env.BASESCAN_API_KEY  ?? '',
      arbitrum: process.env.ARBISCAN_API_KEY  ?? '',
    },
    customChains: [
      {
        network: 'arc',
        chainId: 5042,
        urls: {
          apiURL:     'https://explorer.arc.io/api',
          browserURL: 'https://explorer.arc.io',
        },
      },
    ],
  },
}

export default config
