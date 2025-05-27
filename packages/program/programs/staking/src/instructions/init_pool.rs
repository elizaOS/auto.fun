use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use crate::{constants::{SEED_POOL, SEED_STAKING_TOKEN_ACCOUNT}, events::InitializedPoolEvent, state::Pool};
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct InitPool<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mint::token_program = staking_token_program,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mint::token_program = reward_token_program,
    )]
    pub reward_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = signer,
        space = 8 + Pool::INIT_SPACE,
        seeds = [SEED_POOL, mint.key().as_ref(), reward_mint.key().as_ref()],
        bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = signer,
        seeds = [SEED_STAKING_TOKEN_ACCOUNT, pool.key().as_ref()],
        token::mint = mint,
        token::authority = pool_token_account,
        token::token_program = staking_token_program,
        bump
    )]
    pub pool_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub staking_token_program: Interface<'info, TokenInterface>,
    pub reward_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn process_init_pool(ctx: Context<InitPool>, duration: u64) -> Result<()> {
    require!(duration > 0, ErrorCode::InvalidDuration);
    require!(duration <= 31536000, ErrorCode::InvalidDuration); // 1 year in seconds

    *ctx.accounts.pool = Pool {
        id: ctx.accounts.pool.key(),
        distributor: ctx.accounts.signer.key(),
        mint: ctx.accounts.mint.key(),
        reward_mint: ctx.accounts.reward_mint.key(),
        staking_token_account: ctx.accounts.pool_token_account.key(),
        reward_token_account: Pubkey::default(), // This is initialized on the first call to add_reward
        duration,
        total_supply: 0,
        last_updated: 0,
        period_finish: 0,
        reward_per_token_stored: 0,
        reward_rate: 0,
        bump: ctx.bumps.pool,
        bump_reward_token_account: 0, // This is initialized on the first call to add_reward
        bump_token_account: ctx.bumps.pool_token_account,
    };

    let timestamp = Clock::get()?.unix_timestamp as u64;

    emit!(InitializedPoolEvent { pool: ctx.accounts.pool.key(), mint: ctx.accounts.mint.key(), reward: ctx.accounts.reward_mint.key(), distributor: ctx.accounts.signer.key(), staking_token_program: ctx.accounts.staking_token_program.key(), reward_token_program: ctx.accounts.reward_token_program.key(), duration: duration, timestamp: timestamp, mint_decimals: ctx.accounts.mint.decimals, reward_mint_decimals: ctx.accounts.reward_mint.decimals });

    Ok(())
}