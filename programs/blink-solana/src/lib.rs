use anchor_lang::prelude::*;

declare_id!("FsXSdTn8whuMgCk93P1yHDUBy3xzPtrknnWx3YgWJ2VK");

#[program]
pub mod blink_solana {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
