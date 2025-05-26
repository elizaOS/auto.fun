use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;
use crate::events::SetDurationEvent;
use crate::{constants::SEED_POOL, state::Pool};
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct SetRewardsDuration<'info> {
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
}

pub fn process_set_rewards_duration(ctx: Context<SetRewardsDuration>, duration: u64) -> Result<()> {
    require!(duration > 0, ErrorCode::InvalidDuration);
    require!(duration <= 31536000, ErrorCode::InvalidDuration); // 1 year in seconds

    let pool = &mut ctx.accounts.pool;

    require!( ctx.accounts.signer.key() == pool.distributor, ErrorCode::NotDistributor);

    let current_timestamp = Clock::get()?.unix_timestamp as u64;

    require!(current_timestamp > pool.period_finish, ErrorCode::RewardsStillActive);

    pool.duration = duration;

    emit!(SetDurationEvent {pool: pool.key(), duration: duration, timestamp: current_timestamp});

    Ok(())
}