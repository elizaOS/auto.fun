use anchor_lang::prelude::*;
use std::cmp;
use crate::{constants::PRECISION, state::{Pool, User}};
use crate::errors::ErrorCode;

pub(crate) fn update_reward(pool: &mut Account<Pool>, user: Option<&mut Account<User>>) -> Result<()> {
    pool.reward_per_token_stored = reward_per_token(&pool)?;
    pool.last_updated = last_time_reward_applicable(&pool)?;

    if let Some(user_account) = user {   
        user_account.pending_payout = earned(&pool, &user_account)?;
        user_account.reward_per_token_paid = pool.reward_per_token_stored;
    }

    Ok(())
}

fn earned(pool: &Pool, user: &User) -> Result<u64> {
    let reward_per_token = reward_per_token(pool)?;
    
    // Convert to u128 before performing calculations
    let user_balance_u128 = user.balance as u128;
    let reward_diff_u128 = (reward_per_token
        .checked_sub(user.reward_per_token_paid)
        .expect("underflow subtraction the user reward_per_token_pair from the pool reward per token")) as u128;
    
    // Calculate numerator using u128
    let numerator_u128 = user_balance_u128
        .checked_mul(reward_diff_u128)
        .expect("overflow in multiplying the user balance by the real user reward per token");
    
    // Divide by PRECISION (also as u128)
    let pre_added_rewards_u128 = numerator_u128
        .checked_div(PRECISION as u128)
        .expect("division by zero in precision");
    
    // Convert back to u64 for storage, capping at u64::MAX if needed
    require!(pre_added_rewards_u128 <= u64::MAX as u128, ErrorCode::Overflow);

    let pre_added_rewards = pre_added_rewards_u128 as u64;
    
    // Add pending payout, capping at u64::MAX if it would overflow
    let pending_payout = pre_added_rewards
        .checked_add(user.pending_payout)
        .expect("overflow in adding the user pending payout to the pre added rewards");
    
    Ok(pending_payout)
}

fn reward_per_token(pool: &Pool) -> Result<u64> {
    if pool.total_supply == 0 {
        return Ok(pool.reward_per_token_stored);
    }

    let last_time_reward_applied = last_time_reward_applicable(&pool)?;
    let reward_last_updated = pool.last_updated;

    // Convert to u128 for intermediate calculations
    let time_diff = (last_time_reward_applied
        .checked_sub(reward_last_updated)
        .expect("underflow in reward calculation")) as u128;
    let reward_rate = pool.reward_rate as u128;
    let total_supply = pool.total_supply as u128;
    let precision = PRECISION as u128;
    
    // Calculate using u128, maintaining original order:
    // (time_diff * reward_rate * PRECISION) / total_supply
    let amount_to_add_u128 = time_diff
        .checked_mul(reward_rate)
        .expect("overflow in reward rate multiplication")
        .checked_mul(precision)
        .expect("overflow in precision multiplication")
        .checked_div(total_supply)
        .expect("division by zero in total supply");
    
    // Convert back to u64 safely
    require!(amount_to_add_u128 <= u64::MAX as u128, ErrorCode::Overflow);
    let amount_to_add = amount_to_add_u128 as u64;

    // Add to stored value, capping at u64::MAX if needed
    let amount_to_return = pool.reward_per_token_stored
        .checked_add(amount_to_add)
        .expect("overflow in adding the reward per token stored to the amount to add");

    Ok(amount_to_return)
}

fn last_time_reward_applicable(pool: &Pool) -> Result<u64> {
    let current_timestamp = Clock::get()?.unix_timestamp as u64;
    let min = cmp::min(current_timestamp, pool.period_finish);
    Ok(min)
}