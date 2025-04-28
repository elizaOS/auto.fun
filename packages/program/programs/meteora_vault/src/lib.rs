use anchor_lang::prelude::*;

pub mod instructions;
pub use instructions::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod state;
pub mod utils;

declare_program!(dynamic_amm_v1);
declare_program!(dynamic_amm_v2);

declare_id!("26XF6JHoDEAW1TBXhRrmP5pwwyxjem2jBpjvZoxJEhx1");

#[program]
pub mod meteora_vault {
    use super::*;

    pub fn initialize(ctx: Context<InitializeVault>, init_config: InitVaultConfig) -> Result<()> {
        vault_initialize::process_initialize(ctx, init_config)?;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, claimer_address: Pubkey) -> Result<()> {
        deposit::process_deposit(ctx, claimer_address)?;
        Ok(())
    }

    pub fn change_executor(ctx: Context<UpdateExecutor>, new_executor: Pubkey) -> Result<()> {
        manage_authority::change_executor_authority(ctx, new_executor)?;
        Ok(())
    }

    pub fn change_manager(ctx: Context<UpdateManager>, new_manager: Pubkey) -> Result<()> {
        manage_authority::change_manager_authority(ctx, new_manager)?;
        Ok(())
    }

    pub fn change_emergency(ctx: Context<UpdateEmergency>, new_emergency: Pubkey) -> Result<()> {
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

    pub fn claim_position_fee(ctx: Context<ClaimPositionFee>) -> Result<()> {
        claim_position_fee::handle_claim_position_fee(ctx)?;
        Ok(())
    }
}
