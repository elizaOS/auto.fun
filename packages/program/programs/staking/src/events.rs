use anchor_lang::prelude::*;

#[event]
pub struct InitializedPoolEvent {
    pub pool: Pubkey,
    pub mint: Pubkey,
    pub reward: Pubkey,
    pub distributor: Pubkey,
    pub staking_token_program: Pubkey,
    pub reward_token_program: Pubkey,
    pub duration: u64,
    pub timestamp: u64,
    pub mint_decimals: u8,
    pub reward_mint_decimals: u8,
}

#[event]
pub struct AddedRewardEvent {
    pub pool: Pubkey,
    pub contributor: Pubkey,
    pub reward_token_program: Pubkey,
    pub amount: u64,
    pub new_pool_reward_amount: u64,
    pub timestamp: u64,
}

#[event]
pub struct DepositEvent {
    pub pool: Pubkey,
    pub depositor: Pubkey,
    pub amount: u64,
    pub timestamp: u64,
}

#[event]
pub struct WithdrawEvent {
    pub pool: Pubkey,
    pub withdrawer: Pubkey,
    pub amount: u64,
    pub timestamp: u64,
}

#[event]
pub struct ClaimEvent {
    pub pool: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub timestamp: u64,
}

#[event]
pub struct SetDistributorEvent {
    pub pool: Pubkey,
    pub new_distributor: Pubkey,
    pub timestamp: u64,
}

#[event]
pub struct SetDurationEvent {
    pub pool: Pubkey,
    pub duration: u64,
    pub timestamp: u64,
}