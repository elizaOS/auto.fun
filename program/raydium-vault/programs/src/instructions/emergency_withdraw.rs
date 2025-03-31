use anchor_lang::prelude::*;
use anchor_spl::token::{ Token, TokenAccount, Transfer };

use crate::{
    constants::{ NFT_FAUCET_SEED, POSITION_SEED, VAULT_CONFIG_SEED },
    errors::VaultError,
    events::EmergencyWithdrawed,
    state::{ UserPosition, VaultConfig },
    utils::get_current_timestamp,
};

// Emergency Withdraw instructions
#[derive(Accounts)]
pub struct EmergencyWithdraw<'info> {
    #[account(mut, constraint = authority.key() == vault_config.emergency_authority @VaultError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(seeds = [VAULT_CONFIG_SEED], bump)]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(mut, seeds = [POSITION_SEED, position_nft.key().as_ref()], bump)]
    pub user_position: Account<'info, UserPosition>,

    /// CHECK: position nft token address
    #[account(mut)]
    pub position_nft: AccountInfo<'info>,

    #[account(mut, seeds = [NFT_FAUCET_SEED, position_nft.key().as_ref()], bump)]
    pub nft_token_faucet: Account<'info, TokenAccount>,

    /// CHECK: receive token account address
    #[account(mut)]
    pub to_account: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn process_emergency_withdraw(ctx: Context<EmergencyWithdraw>) -> Result<()> {
    ctx.accounts.user_position.amount = ctx.accounts.user_position.amount
        .checked_sub(1)
        .ok_or(VaultError::InsufficientBalance)?;

    let current_time = get_current_timestamp()?;
    ctx.accounts.user_position.last_updated = current_time;

    let program_id = *ctx.program_id;
    let (_, faucet_bump) = Pubkey::find_program_address(
        &[NFT_FAUCET_SEED, ctx.accounts.position_nft.key().as_ref()],
        &program_id
    );
    let (_, vault_bump) = Pubkey::find_program_address(&[VAULT_CONFIG_SEED], &program_id);
    let faucet_bumps: &[u8] = &[faucet_bump];
    let vault_bumps: &[u8] = &[vault_bump];
    let binding = ctx.accounts.position_nft.key();
    let signer_seeds: &[&[&[u8]]] = &[
        &[NFT_FAUCET_SEED, binding.as_ref(), faucet_bumps],
        &[VAULT_CONFIG_SEED, vault_bumps],
    ];

    // Transfer the NFT to the vault
    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.nft_token_faucet.to_account_info(),
                to: ctx.accounts.to_account.to_account_info(),
                authority: ctx.accounts.vault_config.to_account_info(),
            },
            signer_seeds
        ),
        1 // Amount is 1 for NFTs
    )?;

    emit!(EmergencyWithdrawed {
        claimer: ctx.accounts.user_position.claimer.key(),
        position_nft: ctx.accounts.position_nft.key(),
        withdrawed_time: current_time,
    });

    Ok(())
}
