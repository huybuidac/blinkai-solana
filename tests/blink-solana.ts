import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BlinkSolana } from "../target/types/blink_solana";

describe("blink-solana", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.BlinkSolana as Program<BlinkSolana>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
