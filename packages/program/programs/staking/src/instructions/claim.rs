use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked};
use crate::{constants::{SEED_POOL, SEED_REWARD_TOKEN_ACCOUNT, SEED_USER}, events::ClaimEvent, state::{Pool, User}, utils::update_reward};
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,
    pub reward_mint: InterfaceAccount<'info, Mint>,
    
    #[account(
        mut,
        seeds = [SEED_POOL, mint.key().as_ref(), reward_mint.key().as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [SEED_REWARD_TOKEN_ACCOUNT, pool.key().as_ref()],
        bump = pool.bump_reward_token_account,
    )]
    pub pool_reward_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [SEED_USER, pool.key().as_ref(), signer.key().as_ref()],
        bump,
    )]
    pub user: Account<'info, User>,

    #[account(
        mut, // Don't need to init as this is done during deposit
        associated_token::mint = reward_mint,
        associated_token::authority = signer,
        associated_token::token_program = reward_token_program,
    )]
    pub user_reward_token_account: InterfaceAccount<'info, TokenAccount>,

    pub reward_token_program: Interface<'info, TokenInterface>,
}

pub fn process_claim(ctx: Context<Claim>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let user = &mut ctx.accounts.user;

    require!(pool.mint == ctx.accounts.mint.key(), ErrorCode::InvalidMint);

    update_reward(pool, Some(user))?;

    let cpi_program = ctx.accounts.reward_token_program.to_account_info();

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.pool_reward_token_account.to_account_info(),
        to: ctx.accounts.user_reward_token_account.to_account_info(),
        authority: ctx.accounts.pool_reward_token_account.to_account_info(),
        mint: ctx.accounts.reward_mint.to_account_info()
    };

    let pool_key = pool.key();

    // from account seeds + from account bump
    let signer_seeds: &[&[&[u8]]] = &[
        &[
            SEED_REWARD_TOKEN_ACCOUNT,
            pool_key.as_ref(),
            &[pool.bump_reward_token_account],
        ]
    ];

    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

    let amount = user.pending_payout;

    transfer_checked(cpi_ctx, amount, ctx.accounts.reward_mint.decimals)?;

    user.pending_payout = 0;

    let timestamp = Clock::get()?.unix_timestamp as u64;

    emit!(ClaimEvent { pool: pool.key(), recipient: ctx.accounts.signer.key(), amount: amount, timestamp: timestamp });

    Ok(())
}