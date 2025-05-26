use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub id: Pubkey,
    pub distributor: Pubkey,
    pub duration: u64,
    pub period_finish: u64,
    pub reward_rate: u64,
    pub last_updated: u64,
    pub reward_per_token_stored: u64,

    pub mint: Pubkey,
    pub reward_mint: Pubkey,
    pub staking_token_account: Pubkey,
    pub reward_token_account: Pubkey,

    pub total_supply: u64,
    pub bump: u8,
    pub bump_token_account: u8,
    pub bump_reward_token_account: u8,
}

#[account]
#[derive(InitSpace)]
pub struct User {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub balance: u64,
    pub pending_payout: u64,
    pub reward_per_token_paid: u64,
    pub bump: u8,
}