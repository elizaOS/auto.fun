use anchor_lang::prelude::*;

// SEEDS -> ALWAYS PREFIX WITH POOL KEY
// Reward = reward + mint.key
// User = signer.key
// UserReward = reward + mint.key + user.key
pub const SEED_POOL: &[u8] = b"pool";
pub const SEED_STAKING_TOKEN_ACCOUNT: &[u8] = b"staking_token_account";
pub const SEED_REWARD_TOKEN_ACCOUNT: &[u8] = b"reward_token_account";
pub const SEED_USER: &[u8] = b"user";

#[constant]
pub const PRECISION: u64 = 1_000_000_000;