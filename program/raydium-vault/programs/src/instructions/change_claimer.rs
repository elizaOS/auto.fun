use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::{
    constants::{ POSITION_SEED, VAULT_CONFIG_SEED },
    errors::VaultError,
    events::ClaimerChanged,
    state::{ UserPosition, VaultConfig },
};

// Change claimer address
#[derive(Accounts)]
pub struct ChangeClaimer<'info> {
    #[account(mut, constraint = authority.key() == vault_config.executor_authority.key() @VaultError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(seeds = [VAULT_CONFIG_SEED], bump)]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(seeds = [POSITION_SEED, position_nft.key().as_ref()], bump)]
    pub user_position: Account<'info, UserPosition>,

    // Position token mint
    pub position_nft: Account<'info, Mint>,
}

pub fn process_change_claimer(ctx: Context<ChangeClaimer>, new_claimer: Pubkey) -> Result<()> {
    let old_claimer = ctx.accounts.user_position.claimer;
    ctx.accounts.user_position.claimer = new_claimer;

    emit!(ClaimerChanged { old_claimer, new_claimer });

    Ok(())
}
