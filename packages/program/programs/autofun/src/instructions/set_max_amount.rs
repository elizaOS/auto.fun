use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::{
    constants::BONDING_CURVE,
    errors::PumpfunError,
    events::MaxAmountsSet,
    state::BondingCurve,
};

// Switch instant mode
#[derive(Accounts)]
pub struct SetMaxAmounts<'info> {
    #[account(mut, constraint = authority.key() == bonding_curve.creator)]
    authority: Signer<'info>,

    pub token_mint: Box<Account<'info, Mint>>,

    #[account(mut, seeds = [BONDING_CURVE.as_bytes(), &token_mint.key().to_bytes()], bump)]
    bonding_curve: Account<'info, BondingCurve>,
}

pub fn process_set_max_amounts(
    ctx: Context<SetMaxAmounts>,
    max_buy_amount: u64,
    max_sell_amount: u64
) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    let hours_8 = 60i64 * 60i64 * 8i64;
    require!(
        current_time - ctx.accounts.bonding_curve.created_time <= hours_8,
        PumpfunError::OverSetTime
    );
    ctx.accounts.bonding_curve.max_buy_amount = max_buy_amount;
    ctx.accounts.bonding_curve.max_sell_amount = max_sell_amount;

    emit!(MaxAmountsSet {
        bonding_curve: ctx.accounts.bonding_curve.key(),
        creator: ctx.accounts.authority.key(),
        modified_time: current_time,
        max_buy_amount,
        max_sell_amount,
    });

    Ok(())
}
