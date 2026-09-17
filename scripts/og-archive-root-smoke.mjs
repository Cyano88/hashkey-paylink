import assert from 'node:assert/strict'
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ZgFile } from '@0gfoundation/0g-ts-sdk'
import { ethers } from 'ethers'
import { archiveRootHash } from '../api/og-archive-proof.ts'
const dir=await mkdtemp(join(tmpdir(),'hpl-og-root-'))
const path=join(dir,'fixture.json')
let file
try {
 await writeFile(path,JSON.stringify({eventId:'local-regression',amount:'1',chain:'arc'}))
 file=await ZgFile.fromFilePath(path)
 const [tree,error]=await file.merkleTree()
 assert.equal(error,null)
 const root=archiveRootHash(tree.rootHash())
 const abi=new ethers.Interface(['function archive(string,bytes32,string,string,string,uint256)'])
 const data=abi.encodeFunctionData('archive',['local-regression',root,'arc','fixture','1',1n])
 assert.equal(abi.decodeFunctionData('archive',data)[1],root.toLowerCase())
 const old=ethers.hexlify(ethers.toUtf8Bytes(root).slice(0,32)).padEnd(66,'0')
 assert.notEqual(old,root)
 assert.notEqual(abi.decodeFunctionData('archive',abi.encodeFunctionData('archive',['local-regression',old,'arc','fixture','1',1n]))[1],root)
 for(const value of [null,undefined,'','0x1234','0x'+'g'.repeat(64),'0x'+'1'.repeat(66),123])assert.throws(()=>archiveRootHash(value))
 console.log('Real 0G SDK Merkle root survives contract ABI encoding byte-for-byte; prior truncation and malformed roots rejected. No network calls or transactions.')
} finally {if(file)await file.close();await unlink(path);await rmdir(dir)}
