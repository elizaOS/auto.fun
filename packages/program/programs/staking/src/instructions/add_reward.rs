use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked};
use crate::{constants::{SEED_POOL, SEED_REWARD_TOKEN_ACCOUNT}, events::AddedRewardEvent, state::Pool, utils::update_reward};
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct AddReward<'info> {
    #[account(mut)]
    signer: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mint::token_program = reward_token_program,
    )]
    pub reward_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [SEED_POOL, mint.key().as_ref(), reward_mint.key().as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init_if_needed,
        payer = signer,
        seeds = [SEED_REWARD_TOKEN_ACCOUNT, pool.key().as_ref()],
        token::mint = reward_mint,
        token::authority = pool_reward_token_account,
        token::token_program = reward_token_program,
        bump,
    )]
    pub pool_reward_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = reward_mint,
        associated_token::authority = signer,
        associated_token::token_program = reward_token_program,
    )]
    pub user_reward_token_account: InterfaceAccount<'info, TokenAccount>,

    pub reward_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn process_add_reward(ctx: Context<AddReward>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::ZeroAmount);
    
    let pool = &mut ctx.accounts.pool;

    require!(pool.mint == ctx.accounts.mint.key(), ErrorCode::InvalidMint);

    let current_timestamp = Clock::get()?.unix_timestamp as u64;

    require!( ctx.accounts.signer.key() == pool.distributor, ErrorCode::NotDistributor);

    // Initializing pool_reward_token_account if not initialized
    if pool.reward_token_account == Pubkey::default() {
        pool.reward_token_account = ctx.accounts.pool_reward_token_account.key();
        pool.bump_reward_token_account = ctx.bumps.pool_reward_token_account
    }

    update_reward(pool, None)?;

    if current_timestamp >= pool.period_finish {
        pool.reward_rate = amount.saturating_div(pool.duration);
    } else {
        let remaining: u64 = pool.period_finish.saturating_sub(current_timestamp);
        let leftover: u64 = remaining.saturating_mul(pool.reward_rate);
        pool.reward_rate = (amount.saturating_add(leftover)).saturating_div(pool.duration);
    }

    require!(pool.reward_rate > 0, ErrorCode::ZeroRewardRate);

    pool.last_updated = current_timestamp;
    pool.period_finish = current_timestamp.saturating_add(pool.duration);

    // Do Transfer
    let transfer_cpi_accounts = TransferChecked {
        from: ctx.accounts.user_reward_token_account.to_account_info(),
        to: ctx.accounts.pool_reward_token_account.to_account_info(),
        authority: ctx.accounts.signer.to_account_info(),
        mint: ctx.accounts.reward_mint.to_account_info(),
    };

    let cpi_program = ctx.accounts.reward_token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, transfer_cpi_accounts);

    transfer_checked(cpi_ctx, amount, ctx.accounts.reward_mint.decimals)?;

    let new_pool_reward_amount = pool.duration.saturating_mul(pool.reward_rate);

    emit!(AddedRewardEvent { pool: pool.key(), contributor: ctx.accounts.signer.key(), reward_token_program: ctx.accounts.reward_token_program.key(), amount: amount, new_pool_reward_amount: new_pool_reward_amount, timestamp: current_timestamp });

    Ok(())
}