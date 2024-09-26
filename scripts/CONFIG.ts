import * as anchor from '@coral-xyz/anchor';
import { Cluster, PublicKey, Connection } from '@solana/web3.js';
import IDL from '../target/idl/blink_solana.json';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { BlinkSolana } from '../target/types/blink_solana';

export const wallet = Wallet.local()
export const connection = new Connection(process.env.SOL_URL)
export const provider = new AnchorProvider(connection, wallet)
anchor.setProvider(provider)

export const BLINK_PROGRAM_ID = new PublicKey(IDL.address);
export const program = new Program<BlinkSolana>(IDL as any, provider)
