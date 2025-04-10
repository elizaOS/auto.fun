use anchor_lang::prelude::*;

pub mod state;
pub mod instructions;
pub mod constants;
pub mod errors;
pub mod utils;
pub mod events;

use instructions::*;

declare_id!("F7cFbGWynSconpJvoYnA3WQ8R3xWNUDYfoEp3NBvoEgh");

/**
 * Raydium CLMM
 * devnet: devi51mZmdwUJGU9hjN27vEz64Gps7uUefqxg27EAtH
 * mainnet: CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK
 */

#[program]
pub mod raydium_vault {
    use super::*;

    pub fn initialize(ctx: Context<InitializeVault>, init_config: InitVaultConfig) -> Result<()> {
        vault_initialize::process_initialize(ctx, init_config)?;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, claimer_address: Pubkey) -> Result<()> {
        deposit::process_deposit(ctx, claimer_address)?;
        Ok(())
    }

    pub fn change_executor_authority(
        ctx: Context<UpdateExecutor>,
        new_executor: Pubkey
    ) -> Result<()> {
        manage_authority::change_executor_authority(ctx, new_executor)?;
        Ok(())
    }

    pub fn change_manager_authority(
        ctx: Context<UpdateManager>,
        new_manager: Pubkey
    ) -> Result<()> {
        manage_authority::change_manager_authority(ctx, new_manager)?;
        Ok(())
    }

    pub fn change_emergency_authority(
        ctx: Context<UpdateEmergency>,
        new_emergency: Pubkey
    ) -> Result<()> {
        manage_authority::change_emergency_authority(ctx, new_emergency)?;
        Ok(())
    }

    pub fn change_claimer(ctx: Context<ChangeClaimer>, new_claimer: Pubkey) -> Result<()> {
        change_claimer::process_change_claimer(ctx, new_claimer)?;
        Ok(())
    }

    pub fn emergency_withdraw(ctx: Context<EmergencyWithdraw>) -> Result<()> {
        emergency_withdraw::process_emergency_withdraw(ctx)?;
        Ok(())
    }

    #[inline(never)]
    pub fn claim<'a, 'b, 'c: 'info, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, Claim<'info>>
    ) -> Result<()> {
        claim::process_claim(ctx)?;
        Ok(())
    }
}
