import { getAssociatedTokenAddress } from '@solana/spl-token'
import { BLINK_PROGRAM_ID, program } from './CONFIG'
import { web3 } from '@coral-xyz/anchor'

async function main() {
  console.log('Creating state...')
  await program.methods.createState().rpc()
}

console.log('Running client.')
main()
  .then(() => console.log('Success'))
  .catch((e) => console.error(e))
