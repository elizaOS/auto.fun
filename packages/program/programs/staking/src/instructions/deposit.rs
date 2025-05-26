use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked}};
use crate::{constants::{SEED_POOL, SEED_STAKING_TOKEN_ACCOUNT, SEED_USER}, state::{Pool, User}, utils::update_reward};
use crate::events::DepositEvent;
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub reward_mint: Box<InterfaceAccount<'info, Mint>>,

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
    pub pool_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = signer,
        space = 8 + User::INIT_SPACE,
        seeds = [
            SEED_USER,
            pool.key().as_ref(),
            signer.key().as_ref()
        ],
        bump,
    )]
    pub user: Account<'info, User>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = signer,
        associated_token::token_program = token_program,
    )]
    pub user_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = reward_mint,
        associated_token::authority = signer,
        associated_token::token_program = reward_token_program,
    )]
    pub user_reward_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub reward_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>
}

pub fn process_deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::ZeroAmount);

    // If this is a new user account, initialize it
    if ctx.accounts.user.owner == Pubkey::default() {
        *ctx.accounts.user = User {
            owner: ctx.accounts.signer.key(),
            pool: ctx.accounts.pool.key(),
            balance: 0,
            pending_payout: 0,
            reward_per_token_paid: 0,
            bump: ctx.bumps.user,
        };
    }

    let pool = &mut ctx.accounts.pool;
    let user = &mut ctx.accounts.user;

    require!(pool.mint == ctx.accounts.mint.key(), ErrorCode::InvalidMint);
    require!(user.pool == pool.key(), ErrorCode::MismatchedUserPool);

    update_reward(pool, Some(user))?;

    let transfer_cpi_accounts = TransferChecked {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.pool_token_account.to_account_info(),
        authority: ctx.accounts.signer.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
    };

    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, transfer_cpi_accounts);

    transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

    pool.total_supply = pool.total_supply.checked_add(amount).ok_or(ErrorCode::Overflow)?;
    user.balance = user.balance.checked_add(amount).ok_or(ErrorCode::Overflow)?;

    let timestamp = Clock::get()?.unix_timestamp as u64;

    emit!(DepositEvent { pool: pool.key(), depositor: ctx.accounts.signer.key(), amount: amount, timestamp: timestamp });
    
    Ok(())
}