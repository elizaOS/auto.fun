pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use crate::instructions::*;
use anchor_lang::prelude::*;
use state::Config;
// use crate::errors::PumpfunError;

declare_id!("autoUmixaMaYKFjexMpQuBpNYntgbkzCo2b1ZqUaAZ5");

#[program]
pub mod autofun {
    use super::*;

    //  called by admin to set global config
    //  need to check the signer is authority
    pub fn configure(ctx: Context<Configure>, new_config: Config) -> Result<()> {
        ctx.accounts.process(new_config, ctx.bumps.config)
    }

    //  Admin can hand over admin role
    pub fn nominate_authority(ctx: Context<NominateAuthority>, new_admin: Pubkey) -> Result<()> {
        ctx.accounts.process(new_admin)
    }

    //  Pending admin should accept the admin role
    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        ctx.accounts.process()
    }

    pub fn launch(
        ctx: Context<Launch>,

        // launch config
        decimals: u8,
        token_supply: u64,
        virtual_lamport_reserves: u64,
        curve_limit: u64,
        init_bonding_curve: f64,

        //  metadata
        name: String,
        symbol: String,
        uri: String
    ) -> Result<()> {
        ctx.accounts.process(
            decimals,
            token_supply,
            virtual_lamport_reserves,
            curve_limit,
            init_bonding_curve,
            name,
            symbol,
            uri,
            ctx.bumps.global_vault
        )
    }

    //  amount - swap amount
    //  direction - 0: buy, 1: sell
    pub fn swap(
        ctx: Context<Swap>,
        amount: u64,
        direction: u8,
        minimum_receive_amount: u64,
        deadline: i64
    ) -> Result<u64> {
        ctx.accounts.process(
            amount,
            direction,
            minimum_receive_amount,
            deadline,
            ctx.bumps.global_vault
        )
    }

    // Combined launch and swap instruction for initial buy on token launch
    pub fn launch_and_swap(
        ctx: Context<LaunchAndSwap>,
        // launch config
        decimals: u8,
        token_supply: u64,
        virtual_lamport_reserves: u64,
        curve_limit: u64,
        init_bonding_curve: f64,
        // metadata
        name: String,
        symbol: String,
        uri: String,
        // swap config
        swap_amount: u64,
        minimum_receive_amount: u64,
        deadline: i64
    ) -> Result<u64> {
        ctx.accounts.process(
            decimals,
            token_supply,
            virtual_lamport_reserves,
            curve_limit,
            init_bonding_curve,
            name,
            symbol,
            uri,
            swap_amount,
            minimum_receive_amount,
            deadline,
            ctx.bumps.global_vault
        )
    }

    //  admin withdraws token & sol
    //  migration should be done on backend
    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        ctx.accounts.process(ctx.bumps.global_vault)
    }

    pub fn switch_to_instant_mode(ctx: Context<SwitchInstantMode>) -> Result<()> {
        switch_instant_mode::process_switch_to_instant_mode(ctx)
    }

    pub fn switch_to_delay_mode(ctx: Context<SwitchInstantMode>) -> Result<()> {
        switch_instant_mode::process_switch_to_delay_mode(ctx)
    }

    pub fn set_max_amounts(
        ctx: Context<SetMaxAmounts>,
        max_buy_amount: u64,
        max_sell_amount: u64
    ) -> Result<()> {
        set_max_amount::process_set_max_amounts(ctx, max_buy_amount, max_sell_amount)
    }
}
