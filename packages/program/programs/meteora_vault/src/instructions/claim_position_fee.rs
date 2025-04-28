use anchor_lang::prelude::*;
use anchor_spl::token_interface::{ Mint, TokenAccount, TokenInterface };

use crate::{ constants::VAULT_CONFIG_SEED, dynamic_amm_v2, errors::VaultError, state::VaultConfig };

#[derive(Accounts)]
pub struct ClaimPositionFee<'info> {
    #[account(mut, constraint = authority.key() == vault_config.executor_authority.key() @VaultError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(seeds = [VAULT_CONFIG_SEED], bump)]
    pub vault_config: Account<'info, VaultConfig>,

    /// CHECK: pool authority
    #[account(mut)]
    pub pool_authority: UncheckedAccount<'info>,

    /// CHECK: pool
    #[account(mut)]
    pub pool: UncheckedAccount<'info>,

    /// CHECK: position
    #[account(mut)]
    pub position: UncheckedAccount<'info>,

    /// The user token a account
    #[account(mut)]
    pub token_a_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The user token b account
    #[account(mut)]
    pub token_b_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The vault token account for input token
    #[account(mut, token::token_program = token_a_program, token::mint = token_a_mint)]
    pub token_a_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The vault token account for output token
    #[account(mut, token::token_program = token_b_program, token::mint = token_b_mint)]
    pub token_b_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The mint of token a
    pub token_a_mint: Box<InterfaceAccount<'info, Mint>>,

    /// The mint of token b
    pub token_b_mint: Box<InterfaceAccount<'info, Mint>>,

    /// The token account for nft
    #[account(mut)]
    pub position_nft_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: owner of position
    pub owner: UncheckedAccount<'info>,

    /// Token a program
    pub token_a_program: Interface<'info, TokenInterface>,

    /// Token b program
    pub token_b_program: Interface<'info, TokenInterface>,

    /// CHECK: event authority pda
    pub event_authority: UncheckedAccount<'info>,

    /// CHECK: Dynamic AMM V2
    #[account(address = dynamic_amm_v2::ID)]
    pub dynamic_amm: UncheckedAccount<'info>,
}

pub fn handle_claim_position_fee(ctx: Context<ClaimPositionFee>) -> Result<()> {
    let program_id = *ctx.program_id;
    let (_, vault_bump) = Pubkey::find_program_address(&[VAULT_CONFIG_SEED], &program_id);
    let vault_bumps: &[u8] = &[vault_bump];
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_CONFIG_SEED, vault_bumps]];

    let cpi_accounts = dynamic_amm_v2::cpi::accounts::ClaimPositionFee {
        pool_authority: ctx.accounts.pool_authority.to_account_info(),
        pool: ctx.accounts.pool.to_account_info(),
        position: ctx.accounts.position.to_account_info(),
        token_a_account: ctx.accounts.token_a_account.to_account_info(),
        token_b_account: ctx.accounts.token_b_account.to_account_info(),
        token_a_vault: ctx.accounts.token_a_vault.to_account_info(),
        token_b_vault: ctx.accounts.token_b_vault.to_account_info(),
        token_a_mint: ctx.accounts.token_a_mint.to_account_info(),
        token_b_mint: ctx.accounts.token_b_mint.to_account_info(),
        position_nft_account: ctx.accounts.position_nft_account.to_account_info(),
        owner: ctx.accounts.owner.to_account_info(),
        token_a_program: ctx.accounts.token_a_program.to_account_info(),
        token_b_program: ctx.accounts.token_b_program.to_account_info(),
        event_authority: ctx.accounts.event_authority.to_account_info(),
        program: ctx.accounts.dynamic_amm.to_account_info(),
    };
    let cpi_context = CpiContext::new_with_signer(
        ctx.accounts.dynamic_amm.to_account_info(),
        cpi_accounts,
        signer_seeds
    );

    dynamic_amm_v2::cpi::claim_position_fee(cpi_context)?;
    Ok(())
}
