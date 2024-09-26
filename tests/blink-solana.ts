import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, web3 } from '@coral-xyz/anchor';
import chaiAsPromised from 'chai-as-promised';
import chai, { assert, expect } from 'chai';

import { BlinkSolana } from '../target/types/blink_solana';

import { BN } from 'bn.js';
import {
  createAssociatedTokenAccount,
  createMint,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
  getMint,
  getTokenMetadata,
  mintTo,
  TOKEN_PROGRAM_ID,
  transfer,
} from '@solana/spl-token';

chai.use(chaiAsPromised);

const ZERO = new BN(0);
const POOL = Buffer.from('pool');
const USER_POOL = Buffer.from('user_pool');

const provider = anchor.getProvider() as AnchorProvider;
const connection = provider.connection;
const blink: Program<BlinkSolana> = anchor.workspace.BlinkSolana as Program<BlinkSolana>;
const blinkErrors = anchor.parseIdlErrors(blink.idl);

const users = Array.from({ length: 2 }, (_, index) => {
  const user = anchor.web3.Keypair.generate();
  const wallet = new anchor.Wallet(user);
  const payer = (wallet as any).payer;
  const provider = new anchor.AnchorProvider(connection, wallet, {});

  return {
    user,
    payer,
    wallet,
    provider,
    publicKey: user.publicKey,
  };
});
type IUser = (typeof users)[0]
const user1 = users[0];
const user2 = users[1];

describe('blink-solana', () => {
  before(async () => {
    await blink.methods.createState().rpc();
    (await Promise.all([user1, user2])).map(async (u) => {
      const lastBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        blockhash: lastBlockhash.blockhash,
        lastValidBlockHeight: lastBlockhash.lastValidBlockHeight,
        signature: await connection.requestAirdrop(u.publicKey, 10000 * web3.LAMPORTS_PER_SOL),
      });
    });
  });
  it('Can not recreate state', async () => {
    await expect(blink.methods.createState().rpc()).rejectedWith('already in use');
  });
  describe('pools', () => {
    let mint: anchor.web3.PublicKey;
    let accounts: {};
    before(async () => {
      mint = await createToken(provider);
      accounts = {
        mint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      };
    });
    it('Invalid slug', async () => {
      await expect(blink.methods.createPool('test ', ZERO, ZERO).accounts(accounts).rpc()).rejectedWith('Invalid slug');
      await expect(blink.methods.createPool('test@', ZERO, ZERO).accounts(accounts).rpc()).rejectedWith('Invalid slug');
      await expect(blink.methods.createPool('t'.repeat(33), ZERO, ZERO).accounts(accounts).rpc()).rejectedWith();
    });
    it('Invalid accepted amount', async () => {
      await expect(blink.methods.createPool('test', ZERO, ZERO).accounts(accounts).rpc()).rejectedWith(
        'Invalid accepted amount'
      );
    });
    it('Invalid fee percent', async () => {
      await expect(blink.methods.createPool('test', new BN(1), new BN(10001)).accounts(accounts).rpc()).rejectedWith(
        'Invalid fee percent'
      );
    });
    it('Create Pool OK', async () => {
      await blink.methods.createPool('test', new BN(100), new BN(200)).accounts(accounts).rpc();
      const pool = await blink.account.poolAccount.fetch(getPoolAddr('test'));
      expect(pool.userMaxAmount.toNumber()).to.eq(100);
      expect(pool.feePercent.toNumber()).to.eq(200);
    });
  });
  describe('Deposit', () => {
    let mint: web3.PublicKey;
    let slug = 'dep1';
    before(async () => {
      mint = await createToken(provider);
      await blink.methods
        .createPool(slug, new BN(100), new BN(100))
        .accounts({
          mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    });
    it('Can not deposit by other vault', async () => {
      await mintToken(provider, mint, user2.publicKey, 1000);
      const tx = await blink.methods
        .deposit(slug, new BN(100))
        .accounts({
          authority: user1.publicKey,
          userVault: getAssociatedTokenAddressSync(mint, user2.publicKey),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .transaction();
      await expect(user1.provider.sendAndConfirm(tx)).rejectedWith('Unauthorized');
    });
    it('Require token for deposit', async () => {
      await expect(deposit(slug, user1, new BN(100))).rejectedWith('AccountNotInitialized');

      await mintToken(provider, mint, user1.publicKey, 99);
      await expect(deposit(slug, user1, new BN(100))).rejectedWith('insufficient funds');
    });
    it('User1 Deposit OK', async () => {
      await mintToken(provider, mint, user1.publicKey, 100);
      await deposit(slug, user1, new BN(50));

      let user1Acc = await getUserPoolData(slug, user1);
      expect(user1Acc.amount.toNumber()).to.eq(50);
      let pool = await blink.account.poolAccount.fetch(getPoolAddr(slug));
      expect(pool.totalAmount.toNumber()).to.eq(50);

      await deposit(slug, user1, new BN(50));
      user1Acc = await getUserPoolData(slug, user1);
      expect(user1Acc.amount.toNumber()).to.eq(100);
      pool = await blink.account.poolAccount.fetch(getPoolAddr(slug));
      expect(pool.totalAmount.toNumber()).to.eq(100);
    });
    it('User1 can not deposit more than max amount', async () => {
      await expect(deposit(slug, user1, new BN(1))).rejectedWith('Over max amount');
    });
    it('User2 Deposit OK', async () => {
      await mintToken(provider, mint, user2.publicKey, 100);
      await deposit(slug, user2, new BN(100));

      const user2Acc = await getUserPoolData(slug, user2);
      expect(user2Acc.amount.toNumber()).to.eq(100);

      const pool = await blink.account.poolAccount.fetch(getPoolAddr(slug));
      expect(pool.totalAmount.toNumber()).to.eq(200);
    });
  });
  describe('Withdraw', () => {
    let mint: web3.PublicKey;
    let slug = 'wit1';
    before(async () => {
      mint = await createToken(provider);
      await blink.methods
        .createPool(slug, new BN(100), new BN(100))
        .accounts({
          mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    });
    it('Deposits', async () => {
      await mintToken(provider, mint, user1.publicKey, 100);
      await mintToken(provider, mint, user2.publicKey, 100);
      await deposit(slug, user1, new BN(100));
      await deposit(slug, user2, new BN(100));
    });
    it('User1 Withdraw OK', async () => {
      await withdraw(slug, user1);

      const user1Acc = await getUserPoolData(slug, user1);
      expect(user1Acc.amount.toNumber()).to.eq(0);

      const pool = await blink.account.poolAccount.fetch(getPoolAddr(slug));
      expect(pool.totalAmount.toNumber()).to.eq(100);
      expect(pool.feeAmount.toNumber()).to.eq(1);
    });
    it('User1 can not withdraw twice', async () => {
      await expect(withdraw(slug, user1)).rejectedWith('User not deposited');
    });
    it('User2 Withdraw OK', async () => {
      await withdraw(slug, user2);

      const user2Acc = await getUserPoolData(slug, user2);
      expect(user2Acc.amount.toNumber()).to.eq(0);

      const pool = await blink.account.poolAccount.fetch(getPoolAddr(slug));
      expect(pool.totalAmount.toNumber()).to.eq(0);
      expect(pool.feeAmount.toNumber()).to.eq(2);
    });
    it('Deposit again and withdraw', async () => {
      await mintToken(provider, mint, user1.publicKey, 100);
      await deposit(slug, user1, new BN(100));
      await withdraw(slug, user1);
    });
  });
});

async function withdraw(slug: string, user: IUser, mint?: web3.PublicKey) {
  if (!mint) {
    const pool = await blink.account.poolAccount.fetch(getPoolAddr(slug));
    mint = pool.mint;
  }
  const tx = await blink.methods.withdraw(slug).accounts({
    authority: user.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  }).transaction();
  await user.provider.sendAndConfirm(tx);
}

async function deposit(slug: string, user: IUser, amount: anchor.BN, mint?: web3.PublicKey) {
  if (!mint) {
    const pool = await blink.account.poolAccount.fetch(getPoolAddr(slug));
    mint = pool.mint;
  }
  const tx = await blink.methods.deposit(slug, amount).accounts({
    authority: user.publicKey,
    userVault: getAssociatedTokenAddressSync(mint, user.publicKey),
    tokenProgram: TOKEN_PROGRAM_ID,
  }).transaction();
  await user.provider.sendAndConfirm(tx);
}

async function getUserPoolData(slug: string, user: IUser) {
  return await blink.account.userPoolAccount.fetch(getUserAccAddr(slug, user));
}

function getPoolAddr(slug: string) {
  return web3.PublicKey.findProgramAddressSync([POOL, Buffer.from(slug)], blink.programId)[0];
}

function getUserAccAddr(slug: string, user: web3.PublicKey | IUser) {
  let publicKey = 'publicKey' in user ? user.publicKey : user;
  return web3.PublicKey.findProgramAddressSync(
    [USER_POOL, Buffer.from(slug), publicKey.toBuffer()],
    blink.programId
  )[0];
}

export async function createToken(provider, authority = undefined, decimals = 9) {
  if (!authority) {
    authority = provider.wallet.publicKey;
  }
  const mint = await createMint(provider.connection, provider.wallet.payer, authority, null, decimals);
  return mint;
}

export async function mintToken(
  provider: AnchorProvider,
  mint: web3.PublicKey,
  toWallet: web3.PublicKey,
  amount: number | bigint,
  programId: web3.PublicKey = TOKEN_PROGRAM_ID
) {
  const payer = (provider.wallet as any).payer;
  const associatedTokenAddress = await getAssociatedTokenAddress(mint, toWallet, true, programId);

  const otaAcc = await provider.connection.getAccountInfo(associatedTokenAddress);
  if (!otaAcc) {
    await createAssociatedTokenAccount(provider.connection, payer, mint, toWallet, undefined, programId);
  }

  await mintTo(
    provider.connection,
    payer,
    mint,
    associatedTokenAddress,
    provider.wallet.publicKey,
    amount,
    [],
    {},
    programId
  );
}

export async function mintTokenToAccount(
  provider: AnchorProvider,
  mint: web3.PublicKey,
  toAccount: web3.PublicKey,
  amount: number | bigint
) {
  const payer = (provider.wallet as any).payer;

  await mintTo(provider.connection, payer, mint, toAccount, provider.wallet.publicKey, amount);
}

export async function transferTo(
  provider: AnchorProvider,
  mint: web3.PublicKey,
  toWallet: web3.PublicKey,
  amount: number | bigint
) {
  const payer = (provider.wallet as any).payer;
  const fromAcc = provider.wallet.publicKey;

  const fromAta = await getAssociatedTokenAddress(mint, fromAcc, true);
  const toAta = await getAssociatedTokenAddress(mint, toWallet, true);

  const otaAcc = await provider.connection.getAccountInfo(toAta);
  if (!otaAcc) {
    await createAssociatedTokenAccount(provider.connection, payer, mint, toWallet);
  }
  await transfer(provider.connection, payer, fromAta, toAta, fromAcc, amount);
}

// export function toBN(val: any, decimals: number = 9) {
//   const decimalAmount = parseUnits(val.toString(), decimals)
//   return new BN(decimalAmount.toString())
// }

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
