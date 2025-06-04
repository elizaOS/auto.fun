use anchor_lang::prelude::*;

#[event]
pub struct CompleteEvent {
    pub user: Pubkey,
    pub mint: Pubkey,
    pub bonding_curve: Pubkey,
}

#[event]
pub struct InstantModeSwitched {
    pub instant_trade: bool,
}

#[event]
pub struct MaxAmountsSet {
    pub bonding_curve: Pubkey,
    pub creator: Pubkey,
    pub modified_time: i64,
    pub max_buy_amount: u64,
    pub max_sell_amount: u64,
}
