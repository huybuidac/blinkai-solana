import { getAssociatedTokenAddress } from '@solana/spl-token'
import { BLINK_PROGRAM_ID, connection, program } from './CONFIG'
import { BN, web3 } from '@coral-xyz/anchor'

async function main() {
  const slug = 'test'
  const userMaxAmount = new BN(100).mul(new BN(10).pow(new BN(9)))
  const feePercent = new BN(200) // 2%
  const mint = new web3.PublicKey('F7m7xfuViVMLc7WT6vAvNDtFqSFqVSFE4YovTrLeBCro')

  const mintAcc = await connection.getAccountInfo(mint)

  await program.methods.createPool(slug, userMaxAmount, feePercent).accounts({
    mint,
    tokenProgram: mintAcc.owner
  }).rpc()
}

console.log('Running client.')
main()
  .then(() => console.log('Success'))
  .catch((e) => console.error(e))
