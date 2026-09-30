import assert from 'node:assert/strict'
import {recoverTypedDataAddress,hashTypedData,decodeFunctionData,parseAbi} from 'viem'
import {createGiftCapability,giftContractId,giftClaimTypedData,signGiftClaim} from '../src/pocket/features/gifts/pocketGiftSigning.ts'
import {paymentFeeBreakdown} from '../src/lib/platformFees.ts'
const capability=createGiftCapability(), other=createGiftCapability()
assert.notEqual(capability.secret,other.secret)
assert.match(capability.secret,/^[A-Za-z0-9_-]{43}$/)
const input={chainId:31337,escrow:'0x1111111111111111111111111111111111111111',giftId:'0x'+'ab'.repeat(32),recipient:'0x2222222222222222222222222222222222222222',deadline:2000000000n}
const data=giftClaimTypedData(input), signature=await signGiftClaim(capability.secret,input)
assert.equal(await recoverTypedDataAddress({...data,signature}),capability.signer)
for(const override of [{chainId:1},{escrow:'0x3333333333333333333333333333333333333333'},{recipient:'0x3333333333333333333333333333333333333333'},{giftId:'0x'+'bc'.repeat(32)},{deadline:2000000001n}])assert.notEqual(await recoverTypedDataAddress({...giftClaimTypedData({...input,...override}),signature}),capability.signer)
for(const secret of ['', 'a'.repeat(42), 'a'.repeat(44), 'A'.repeat(43)])await assert.rejects(signGiftClaim(secret,input),/Invalid gift code/)
assert.throws(()=>giftClaimTypedData({...input,recipient:input.escrow}))
assert.throws(()=>giftClaimTypedData({...input,deadline:1n<<64n}))
assert.notEqual(giftContractId(input.recipient,input.giftId),giftContractId(input.escrow,input.giftId))
const {TypedDataEncoder}=await import('../contracts/node_modules/ethers/lib.esm/index.js')
assert.equal(hashTypedData(data),TypedDataEncoder.hash(data.domain,data.types,data.message),'Frontend typed data matches contract test signer')
console.log('PASS gift capability generation, recipient/chain/contract/gift/deadline binding and invalid credential rejection.')

const {prepareGiftFunding,GIFT_ESCROW_ABI}=await import('../src/pocket/features/gifts/pocketGiftFunding.ts')
const fundingInput={sender:input.recipient,escrow:input.escrow,token:'0x4444444444444444444444444444444444444444',claimSigner:capability.signer,salt:input.giftId,amount:'100',expiresAt:input.deadline,now:1n}
const funding=prepareGiftFunding(fundingInput)
assert.equal(funding.principal,100000000n)
assert.equal(funding.platformFee,250000n)
assert.equal(funding.fundingDebit,100250000n)
const decoded=decodeFunctionData({abi:GIFT_ESCROW_ABI,data:funding.funding.data})
assert.equal(decoded.functionName,'createGift');assert.equal(decoded.args[2],funding.principal)
const approval=decodeFunctionData({abi:parseAbi(['function approve(address spender,uint256 amount) returns(bool)']),data:funding.approval.data})
assert.equal(approval.args[1],funding.fundingDebit)
assert.throws(()=>prepareGiftFunding({...fundingInput,expiresAt:1n}))
assert.throws(()=>prepareGiftFunding({...fundingInput,salt:'0x'+'00'.repeat(32)}))
for(const amount of ['0.000001','0.0004','0.000401','1','100']){const f=prepareGiftFunding({...fundingInput,amount});assert.equal(f.platformFee,paymentFeeBreakdown(f.principal).platformFee)}
console.log('PASS gift funding calldata, exact approval, full principal, shared fee rounding and expiry validation.')