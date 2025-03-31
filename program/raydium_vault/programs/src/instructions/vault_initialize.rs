use crate::constants::*;
use crate::events::VaultInitialized;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + std::mem::size_of::<VaultConfig>(),
        seeds = [VAULT_CONFIG_SEED],
        bump
    )]
    pub vault_config: Account<'info, VaultConfig>,

    /// System program
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitVaultConfig {
    executor_authority: Pubkey,
    emergency_authority: Pubkey,
    manager_authority: Pubkey,
}

pub fn process_initialize(
    ctx: Context<InitializeVault>,
    init_config: InitVaultConfig
) -> Result<()> {
    let vault_config = &mut ctx.accounts.vault_config;

    // Initialize the vault configuration
    (
        vault_config.executor_authority,
        vault_config.emergency_authority,
        vault_config.manager_authority,
    ) = (
        init_config.executor_authority,
        init_config.emergency_authority,
        init_config.manager_authority,
    );

    emit!(VaultInitialized {
        executor: vault_config.executor_authority,
        emergency: vault_config.emergency_authority,
        manager: vault_config.manager_authority,
    });

    Ok(())
}
