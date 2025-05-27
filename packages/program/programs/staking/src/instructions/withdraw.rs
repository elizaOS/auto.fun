use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked}};
use crate::{constants::{SEED_POOL, SEED_STAKING_TOKEN_ACCOUNT, SEED_USER}, state::{Pool, User}, utils::update_reward};
use crate::events::WithdrawEvent;
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct Withdraw<'info> {
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
        seeds = [SEED_STAKING_TOKEN_ACCOUNT, pool.key().as_ref()],
        bump = pool.bump_token_account,
    )]
    pub pool_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [SEED_USER, pool.key().as_ref(), signer.key().as_ref()],
        bump = user.bump,
    )]
    pub user: Account<'info, User>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = signer,
        associated_token::token_program = token_program,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn process_withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::ZeroAmount);

    let pool = &mut ctx.accounts.pool;
    let user = &mut ctx.accounts.user;

    require!(pool.mint == ctx.accounts.mint.key(), ErrorCode::InvalidMint);
    require!(user.balance >= amount, ErrorCode::InsufficientFunds);

    update_reward(pool, Some(user))?;

    let cpi_program = ctx.accounts.token_program.to_account_info();

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.pool_token_account.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.pool_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info()
    };

    let pool_key = pool.key();

    // from account seeds + from account bump
    let signer_seeds: &[&[&[u8]]] = &[
        &[
            SEED_STAKING_TOKEN_ACCOUNT,
            pool_key.as_ref(),
            &[pool.bump_token_account],
        ]
    ];

    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

    transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

    pool.total_supply -= amount;
    user.balance -= amount;

    let timestamp = Clock::get()?.unix_timestamp as u64;

    emit!(WithdrawEvent { pool: pool.key(), withdrawer: ctx.accounts.signer.key(), amount: amount, timestamp: timestamp });

    Ok(())
}