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

declare_id!("aUToHWG2U3E33oDyKm68pwUygDE1sUUGUM1mnLppMVQ");

#[program]
pub mod serlaunchalot {
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

        //  metadata
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        ctx.accounts.process(
            decimals,
            token_supply,
            virtual_lamport_reserves,
            name,
            symbol,
            uri,
            ctx.bumps.global_vault,
        )
    }

    //  amount - swap amount
    //  direction - 0: buy, 1: sell
    pub fn swap(
        ctx: Context<Swap>,
        amount: u64,
        direction: u8,
        minimum_receive_amount: u64,
        deadline: i64,
    ) -> Result<u64> {
        ctx.accounts.process(
            amount,
            direction,
            minimum_receive_amount,
            deadline,
            ctx.bumps.global_vault,
        )
    }

    // Combined launch and swap instruction for initial buy on token launch
    pub fn launch_and_swap(
        ctx: Context<LaunchAndSwap>,
        // launch config
        decimals: u8,
        token_supply: u64,
        virtual_lamport_reserves: u64,
        // metadata
        name: String,
        symbol: String,
        uri: String,
        // swap config
        swap_amount: u64,
        minimum_receive_amount: u64,
        deadline: i64,
    ) -> Result<u64> {
        ctx.accounts.process(
            decimals,
            token_supply,
            virtual_lamport_reserves,
            name,
            symbol,
            uri,
            swap_amount,
            minimum_receive_amount,
            deadline,
            ctx.bumps.global_vault,
        )
    }

    //  admin withdraws token & sol
    //  migration should be done on backend
    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        ctx.accounts.process(ctx.bumps.global_vault)
    }
}
