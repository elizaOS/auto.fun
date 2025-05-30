use anchor_lang::prelude::*;
use anchor_spl::{
    memo::Memo,
    token::Token,
    token_2022::Token2022,
    token_interface::{ Mint, TokenAccount },
};
use raydium_cpmm_cpi::program::RaydiumCpmm;
use raydium_locking_cpi::{ cpi, program::RaydiumLiquidityLocking, states::LockedCpLiquidityState };

use crate::{
    constants::{ POSITION_SEED, VAULT_CONFIG_SEED },
    errors::VaultError,
    events::CpFeeCollected,
    state::{ UserPosition, VaultConfig },
    utils::get_current_timestamp,
};

// Claim instructions
#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut, constraint = authority.key() == vault_config.executor_authority.key() @VaultError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(seeds = [VAULT_CONFIG_SEED], bump)]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(seeds = [POSITION_SEED, locked_liquidity.fee_nft_mint.key().as_ref()], bump)]
    pub user_position: Account<'info, UserPosition>,

    pub locking_program: Program<'info, RaydiumLiquidityLocking>,

    /// CHECK: the authority of token vault that cp is locked
    #[account(
        seeds = [raydium_locking_cpi::LOCK_CP_AUTH_SEED.as_bytes()],
        bump,
        seeds::program = locking_program.key()
    )]
    pub locked_authority: UncheckedAccount<'info>,

    /// Fee nft owner who is allowed to receive fees
    /// CHECK: owner of nft
    pub fee_nft_owner: AccountInfo<'info>,

    /// Fee token account
    #[account(
        token::mint = locked_liquidity.fee_nft_mint,
        token::authority = fee_nft_owner,
        constraint = fee_nft_account.amount == 1
    )]
    pub fee_nft_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Store the locked the information of liquidity
    #[account(
        mut,
        constraint = locked_liquidity.fee_nft_mint == fee_nft_account.mint
    )]
    pub locked_liquidity: Account<'info, LockedCpLiquidityState>,

    /// cpmm program
    pub cpmm_program: Program<'info, RaydiumCpmm>,

    /// CHECK: cp program vault and lp mint authority
    #[account(
        seeds = [raydium_cpmm_cpi::AUTH_SEED.as_bytes()],
        bump,
        seeds::program = cpmm_program.key()
    )]
    pub cp_authority: UncheckedAccount<'info>,

    /// CHECK: Pool state account
    #[account(
        mut,
        address = locked_liquidity.pool_id
    )]
    pub pool_state: UncheckedAccount<'info>,

    /// The mint of liquidity token
    /// address = pool_state.lp_mint
    #[account(mut)]
    pub lp_mint: Box<InterfaceAccount<'info, Mint>>,

    /// The token account for receive token_0
    #[account(
        mut,
        associated_token::mint = token_0_vault.mint,
        associated_token::authority = user_position.claimer
    )]
    pub recipient_token_0_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The token account for receive token_1
    #[account(
        mut,
        associated_token::mint = token_1_vault.mint,
        associated_token::authority = user_position.claimer
    )]
    pub recipient_token_1_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The address that holds pool tokens for token_0
    /// address = pool_state.token_0_vault
    #[account(mut)]
    pub token_0_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The address that holds pool tokens for token_1
    /// address = pool_state.token_1_vault
    #[account(mut)]
    pub token_1_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The mint of token_0 vault
    #[account(address = token_0_vault.mint)]
    pub vault_0_mint: Box<InterfaceAccount<'info, Mint>>,

    /// The mint of token_1 vault
    #[account(address = token_1_vault.mint)]
    pub vault_1_mint: Box<InterfaceAccount<'info, Mint>>,

    /// locked lp token account
    #[account(
        mut,
        associated_token::mint = lp_mint,
        associated_token::authority = locked_authority,
        token::token_program = token_program,
    )]
    pub locked_lp_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// token Program
    pub token_program: Program<'info, Token>,

    /// Token program 2022
    pub token_program_2022: Program<'info, Token2022>,

    /// memo program
    #[account()]
    pub memo_program: Program<'info, Memo>,
}

#[inline(never)]
pub fn process_claim<'a, 'b, 'c: 'info, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, Claim<'info>>
) -> Result<()> {
    require!(
        ctx.accounts.fee_nft_owner.key() == ctx.accounts.vault_config.key(),
        VaultError::InvalidNftOwner
    );
    let program_id = *ctx.program_id;
    let (_, vault_bump) = Pubkey::find_program_address(&[VAULT_CONFIG_SEED], &program_id);
    let vault_bumps: &[u8] = &[vault_bump];
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_CONFIG_SEED, vault_bumps]];
    let current_time = get_current_timestamp()?;
    let cpi_accounts = cpi::accounts::CollectCpFee {
        authority: ctx.accounts.locked_authority.to_account_info(),
        fee_nft_owner: ctx.accounts.fee_nft_owner.to_account_info(),
        fee_nft_account: ctx.accounts.fee_nft_account.to_account_info(),
        locked_liquidity: ctx.accounts.locked_liquidity.to_account_info(),
        cpmm_program: ctx.accounts.cpmm_program.to_account_info(),
        cp_authority: ctx.accounts.cp_authority.to_account_info(),
        pool_state: ctx.accounts.pool_state.to_account_info(),
        lp_mint: ctx.accounts.lp_mint.to_account_info(),
        recipient_token_0_account: ctx.accounts.recipient_token_0_account.to_account_info(),
        recipient_token_1_account: ctx.accounts.recipient_token_1_account.to_account_info(),
        token_0_vault: ctx.accounts.token_0_vault.to_account_info(),
        token_1_vault: ctx.accounts.token_1_vault.to_account_info(),
        vault_0_mint: ctx.accounts.vault_0_mint.to_account_info(),
        vault_1_mint: ctx.accounts.vault_1_mint.to_account_info(),
        locked_lp_vault: ctx.accounts.locked_lp_vault.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        token_program_2022: ctx.accounts.token_program_2022.to_account_info(),
        memo_program: ctx.accounts.memo_program.to_account_info(),
    };
    let cpi_context = CpiContext::new_with_signer(
        ctx.accounts.locking_program.to_account_info(),
        cpi_accounts,
        signer_seeds
    );
    cpi::collect_cp_fees(cpi_context, u64::MAX)?;

    ctx.accounts.user_position.last_updated = current_time;

    emit!(CpFeeCollected {
        claimer: ctx.accounts.user_position.claimer.key(),
        position_nft: ctx.accounts.locked_liquidity.fee_nft_mint.key(),
        claimed_time: current_time,
    });

    Ok(())
}
