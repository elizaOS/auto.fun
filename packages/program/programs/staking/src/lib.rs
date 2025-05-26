#![allow(clippy::result_large_err)]
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use instructions::*;

mod state;
mod instructions;
mod events;
mod errors;
mod constants;
mod utils;

declare_id!("BB9hUaLkTzWhzdVzi8BxjVD1CQuYMpqP3SiwQ5saAQ2W");

#[program]
pub mod staking_rewards {
    use super::*;

    pub fn init_pool(ctx: Context<InitPool>, duration: u64) -> Result<()> {
        process_init_pool(ctx, duration)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        process_deposit(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        process_withdraw(ctx, amount)
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        process_claim(ctx)
    }

    pub fn add_reward(ctx: Context<AddReward>, amount: u64) -> Result<()> {
        process_add_reward(ctx, amount)
    }

    pub fn set_rewards_distributor(ctx: Context<SetRewardsDistributor>) -> Result<()> {
        process_set_rewards_distributor(ctx)
    }

    pub fn set_rewards_duration(ctx: Context<SetRewardsDuration>, duration: u64) -> Result<()> {
        process_set_rewards_duration(ctx, duration)
    }
}