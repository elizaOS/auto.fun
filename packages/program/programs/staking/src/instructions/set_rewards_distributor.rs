use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::{constants::SEED_POOL, events::SetDistributorEvent, state::Pool};
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct SetRewardsDistributor<'info> {
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

    /// CHECK: This account will not be checked by anchor
    pub new_distributor: AccountInfo<'info>,
}

pub fn process_set_rewards_distributor(ctx: Context<SetRewardsDistributor>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    require!( ctx.accounts.signer.key() == pool.distributor, ErrorCode::NotDistributor);

    pool.distributor = ctx.accounts.new_distributor.key();

    let timestamp = Clock::get()?.unix_timestamp as u64;

    emit!(SetDistributorEvent {pool: pool.key(), new_distributor: ctx.accounts.new_distributor.key(), timestamp: timestamp});
    Ok(())
}