import { createAssociatedTokenAccount, createMint, getAssociatedTokenAddress, mintTo, mintToChecked } from '@solana/spl-token'
import { BLINK_PROGRAM_ID, provider, wallet } from './CONFIG'
import { BN, web3 } from '@coral-xyz/anchor'

async function main() {
  const mint = await createMint(provider.connection, wallet.payer, provider.wallet.publicKey, null, 9);
  const payer = wallet.payer;
  const associatedTokenAddress = await getAssociatedTokenAddress(mint, wallet.publicKey, true);

  const otaAcc = await provider.connection.getAccountInfo(associatedTokenAddress);
  if (!otaAcc) {
    await createAssociatedTokenAccount(provider.connection, payer, mint, wallet.publicKey);
  }

  await mintTo(
    provider.connection,
    payer,
    mint,
    associatedTokenAddress,
    provider.wallet.publicKey,
    100_000_000_000n * BigInt(1e9),
    [],
    {},
  );
}

console.log('Running client.')
main()
  .then(() => console.log('Success'))
  .catch((e) => console.error(e))
