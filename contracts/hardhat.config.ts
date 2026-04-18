import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import * as dotenv from 'dotenv'

dotenv.config()

const PK = process.env.DEPLOYER_PRIVATE_KEY
  ? [`0x${process.env.DEPLOYER_PRIVATE_KEY.replace(/^0x/, '')}`]
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
    sources:   '.',
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
    hashkey: {
      url:      'https://mainnet.hsk.xyz',
      chainId:  177,
      accounts: PK,
    },
    arc: {
      url:      'https://rpc.testnet.arc.network',
      chainId:  5042002,
      accounts: PK,
    },
  },

  etherscan: {
    apiKey: {
      base: process.env.BASESCAN_API_KEY ?? '',
    },
    customChains: [
      {
        network: 'hashkey',
        chainId: 177,
        urls: {
          apiURL:     'https://explorer.hsk.xyz/api',
          browserURL: 'https://explorer.hsk.xyz',
        },
      },
      {
        network: 'arc',
        chainId: 5042002,
        urls: {
          apiURL:     'https://testnet.arcscan.app/api',
          browserURL: 'https://testnet.arcscan.app',
        },
      },
    ],
  },
}

export default config
