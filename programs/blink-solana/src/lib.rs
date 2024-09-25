use anchor_lang::prelude::*;
use anchor_spl::{
    token_interface::{ self, Mint, TokenAccount, TokenInterface, TransferChecked },
    associated_token::AssociatedToken,
};
use std::mem::size_of;

declare_id!("FsXSdTn8whuMgCk93P1yHDUBy3xzPtrknnWx3YgWJ2VK");

pub const STATE: &str = "state";
pub const POOL: &str = "pool";
pub const USER_POOL: &str = "user_pool";
pub const VAULT: &str = "vault";
pub const FEE_VAULT: &str = "fee-vault";

const _100_PERCENT: u64 = 10000;
pub const SLUG_LENGTH: usize = 32;

#[program]
pub mod blink_solana {
    use super::*;

    pub fn create_state(ctx: Context<CreateState>) -> Result<()> {
        let mut state = ctx.accounts.state.load_init()?;
        state.authority = ctx.accounts.authority.key();
        Ok(())
    }

    pub fn create_pool(
        ctx: Context<CreatePool>,
        slug: String,
        user_accepted_amount: u64,
        fee: u64
    ) -> Result<()> {
        require!(slug.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'), AppErrorCode::InvalidSlug);
        // require!(slug.len() <= SLUG_LENGTH, AppErrorCode::InvalidSlug); // no need to check
        require!(user_accepted_amount > 0, AppErrorCode::InvalidAcceptedAmount);
        require!(fee <= _100_PERCENT, AppErrorCode::InvalidFeePercent);

        let mut pool = ctx.accounts.pool.load_init()?;

        pool.authority = ctx.accounts.authority.key();
        pool.mint = ctx.accounts.mint.key();
        pool.slug = str_to_slug(&slug);

        pool.user_accepted_amount = user_accepted_amount;
        pool.fee_percent = fee;
        pool.vault = ctx.accounts.vault.key();
        pool.fee_vault = ctx.accounts.fee_vault.key();

        Ok(())
    }

    pub fn deposit(_ctx: Context<Deposit>, _slug: String) -> Result<()> {
        let mut pool = _ctx.accounts.pool.load_mut()?;
        let mut user_pool = match _ctx.accounts.user_pool.load_mut() {
            Ok(user_pool) => user_pool,
            Err(_) => {
                let mut user_pool = _ctx.accounts.user_pool.load_init()?;
                user_pool.pool = _ctx.accounts.pool.key();
                user_pool.authority = _ctx.accounts.authority.key();
                user_pool
            }
        };

        require_eq!(user_pool.amount, 0, AppErrorCode::Deposited);

        token_interface::transfer_checked(
            CpiContext::new(_ctx.accounts.token_program.to_account_info(), TransferChecked {
                from: _ctx.accounts.user_vault.to_account_info(),
                to: _ctx.accounts.vault.to_account_info(),
                authority: _ctx.accounts.authority.to_account_info(),
                mint: _ctx.accounts.mint.to_account_info(),
            }),
            pool.user_accepted_amount,
            _ctx.accounts.mint.decimals
        )?;

        user_pool.amount = pool.user_accepted_amount;
        pool.total_amount += pool.user_accepted_amount;

        Ok(())
    }

    pub fn withdraw(_ctx: Context<Withdraw>, _slug: String) -> Result<()> {
        let mut pool = _ctx.accounts.pool.load_mut()?;
        let mut user_pool = _ctx.accounts.user_pool.load_mut()?;

        require_gt!(user_pool.amount, 0, AppErrorCode::NotDeposited);

        let fee: u64 = u128
            ::from(user_pool.amount)
            .checked_mul(pool.fee_percent as u128)
            .unwrap()
            .checked_div(_100_PERCENT as u128)
            .unwrap()
            .try_into()
            .unwrap();
        let withdraw_amount: u64 = user_pool.amount - fee;

        pool.total_amount -= user_pool.amount;
        pool.fee_amount += fee;
        user_pool.amount = 0;

        drop(pool);

        let seeds = &[POOL.as_bytes(), _slug.as_bytes(), &[_ctx.bumps.pool]];
        let signer = &[&seeds[..]];

        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                _ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: _ctx.accounts.vault.to_account_info(),
                    to: _ctx.accounts.user_vault.to_account_info(),
                    authority: _ctx.accounts.pool.to_account_info(),
                    mint: _ctx.accounts.mint.to_account_info(),
                },
                signer
            ),
            withdraw_amount,
            _ctx.accounts.mint.decimals
        )?;

        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                _ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: _ctx.accounts.vault.to_account_info(),
                    to: _ctx.accounts.fee_vault.to_account_info(),
                    authority: _ctx.accounts.pool.to_account_info(),
                    mint: _ctx.accounts.mint.to_account_info(),
                },
                signer
            ),
            fee,
            _ctx.accounts.mint.decimals
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateState<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        seeds = [STATE.as_bytes()],
        bump,
        payer = authority,
        space = 8 + size_of::<StateAccount>()
    )]
    pub state: AccountLoader<'info, StateAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(slug: String)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [STATE.as_bytes()], bump, has_one = authority)]
    pub state: AccountLoader<'info, StateAccount>,
    #[account(
        init,
        payer = authority,
        seeds = [POOL.as_bytes(), slug.as_bytes()],
        bump,
        space = 8 + size_of::<PoolAccount>()
    )]
    pub pool: AccountLoader<'info, PoolAccount>,
    #[account(
        init,
        seeds = [VAULT.as_bytes(), slug.as_bytes()],
        bump,
        payer = authority,
        token::mint = mint,
        token::authority = pool,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        seeds = [FEE_VAULT.as_bytes(), slug.as_bytes()],
        bump,
        payer = authority,
        token::mint = mint,
        token::authority = pool,
    )]
    pub fee_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(slug: String)]
pub struct Deposit<'info> {
    #[account(mut, seeds = [POOL.as_bytes(), slug.as_bytes()], bump, has_one = vault @AppErrorCode::InvalidVault, has_one = mint @AppErrorCode::InvalidMint)]
    pub pool: AccountLoader<'info, PoolAccount>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init_if_needed,
        seeds = [USER_POOL.as_bytes(), slug.as_bytes(), authority.key().as_ref()],
        bump,
        payer = authority,
        space = 8 + size_of::<UserPoolAccount>()
    )]
    pub user_pool: AccountLoader<'info, UserPoolAccount>,
    #[account(mut, constraint = user_vault.owner == authority.key() @AppErrorCode::Unauthorized, constraint = user_vault.mint == mint.key() @AppErrorCode::InvalidMint)]
    pub user_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(slug: String)]
pub struct Withdraw<'info> {
    #[account(mut, seeds = [POOL.as_bytes(), slug.as_bytes()], bump, has_one = vault @AppErrorCode::InvalidVault, has_one = mint @AppErrorCode::InvalidMint, has_one = fee_vault @AppErrorCode::InvalidFeeVault)]
    pub pool: AccountLoader<'info, PoolAccount>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub fee_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = authority
    )]
    pub user_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [USER_POOL.as_bytes(), slug.as_bytes(), authority.key().as_ref()], bump)]
    pub user_pool: AccountLoader<'info, UserPoolAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[account(zero_copy)]
pub struct StateAccount {
    pub authority: Pubkey,
}

#[account[zero_copy]]
pub struct PoolAccount {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub fee_vault: Pubkey,
    pub slug: [u8; SLUG_LENGTH],
    pub user_accepted_amount: u64, // fixed amount - Accept X amount of token despoit by any user
    pub total_amount: u64,
    pub fee_percent: u64, // decimal 2
    pub fee_amount: u64,
}

#[account(zero_copy)]
pub struct UserPoolAccount {
    pub pool: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum AppErrorCode {
    #[msg("Invalid slug")]
    InvalidSlug,
    #[msg("Invalid accepted amount")]
    InvalidAcceptedAmount,
    #[msg("Invalid fee percent")]
    InvalidFeePercent,
    #[msg("User already deposited")]
    Deposited,
    #[msg("User not deposited")]
    NotDeposited,
    #[msg("Invalid vault")]
    InvalidVault,
    #[msg("Invalid fee vault")]
    InvalidFeeVault,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Unauthorized")]
    Unauthorized,
}

pub fn str_to_slug(slug: &str) -> [u8; SLUG_LENGTH] {
    // check slug includes characters, numbers, and hyphens only
    let src = slug.as_bytes();
    let mut data = [0u8; SLUG_LENGTH];
    data[..src.len()].copy_from_slice(src);
    data
}
