use anchor_lang::prelude::*;
use crate::errors::VaultError;
use crate::constants::*;
use crate::events::{ EmergencyChanged, ExecutorChanged, ManagerChanged };
use crate::state::*;

#[derive(Accounts)]
pub struct UpdateExecutor<'info> {
    #[account(mut, constraint = authority.key() == vault_config.manager_authority.key() @VaultError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(mut, seeds = [VAULT_CONFIG_SEED], bump)]
    pub vault_config: Account<'info, VaultConfig>,
}

#[derive(Accounts)]
pub struct UpdateEmergency<'info> {
    #[account(mut, constraint = authority.key() == vault_config.emergency_authority.key() @VaultError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(mut, seeds = [VAULT_CONFIG_SEED], bump)]
    pub vault_config: Account<'info, VaultConfig>,
}

#[derive(Accounts)]
pub struct UpdateManager<'info> {
    #[account(mut, constraint = authority.key() == vault_config.manager_authority.key() @VaultError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(mut, seeds = [VAULT_CONFIG_SEED], bump)]
    pub vault_config: Account<'info, VaultConfig>,
}

pub fn change_executor_authority(ctx: Context<UpdateExecutor>, new_address: Pubkey) -> Result<()> {
    let old_executor = ctx.accounts.vault_config.executor_authority;
    ctx.accounts.vault_config.executor_authority = new_address;

    emit!(ExecutorChanged {
        old_executor,
        new_executor: new_address,
    });

    Ok(())
}

pub fn change_emergency_authority(
    ctx: Context<UpdateEmergency>,
    new_address: Pubkey
) -> Result<()> {
    let old_emergency = ctx.accounts.vault_config.emergency_authority;
    ctx.accounts.vault_config.emergency_authority = new_address;

    emit!(EmergencyChanged {
        old_emergency,
        new_emergency: new_address.key(),
    });

    Ok(())
}

pub fn change_manager_authority(ctx: Context<UpdateManager>, new_address: Pubkey) -> Result<()> {
    let old_manager = ctx.accounts.vault_config.manager_authority;
    ctx.accounts.vault_config.manager_authority = new_address;

    emit!(ManagerChanged {
        old_manager,
        new_manager: new_address.key(),
    });

    Ok(())
}
