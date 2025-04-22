use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token::Token;
use anchor_spl::token::TokenAccount;
use anchor_spl::token::Transfer;
use crate::constants::*;
use crate::events::NftPositionDeposited;
use crate::state::*;
use crate::errors::VaultError;
use crate::utils::*;

// Deposit instructions
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, constraint = authority.key() == vault_config.executor_authority.key() @VaultError::Unauthorized)]
    pub authority: Signer<'info>,

    #[account(seeds = [VAULT_CONFIG_SEED], bump)]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + std::mem::size_of::<UserPosition>(),
        seeds = [POSITION_SEED, position_nft.key().as_ref()],
        bump
    )]
    pub user_position: Account<'info, UserPosition>,

    // Position token mint
    pub position_nft: Account<'info, Mint>,

    // Account that holds the NFT to deposit
    #[account(
        mut,
        constraint = from_account.mint == position_nft.key() 
            && from_account.owner == authority.key() @ VaultError::Unauthorized
    )]
    pub from_account: Account<'info, TokenAccount>,

    // Faucet token account to receive the position_nft
    #[account(
        init_if_needed,
        payer = authority,
        token::mint = position_nft,
        token::authority = vault_config,
        seeds = [NFT_FAUCET_SEED, position_nft.key().as_ref()],
        bump
    )]
    pub nft_token_faucet: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn process_deposit(ctx: Context<Deposit>, claimer_address: Pubkey) -> Result<()> {
    let current_time = get_current_timestamp()?;
    let position = &mut ctx.accounts.user_position;

    // Initialize position if it's new
    if position.claimer.eq(&Pubkey::default()) {
        (position.claimer, position.position_nft, position.created_at, position.amount) = (
            claimer_address,
            ctx.accounts.position_nft.key(),
            current_time,
            1,
        );
    } else {
        require!(
            position.claimer.key() == claimer_address.key(),
            VaultError::InvalidClaimerAddress
        );
        require!(
            position.position_nft.key() == ctx.accounts.position_nft.key(),
            VaultError::InvalidToken
        );
        require!(position.amount == 1, VaultError::OnlyOneNftAllowed);

        position.amount = position.amount.checked_add(1u8).ok_or(VaultError::BalanceOverflow)?;
    }

    position.last_updated = current_time;

    // Transfer the NFT to the vault
    anchor_spl::token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), Transfer {
            from: ctx.accounts.from_account.to_account_info(),
            to: ctx.accounts.nft_token_faucet.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        }),
        1 // Amount is 1 for NFTs
    )?;

    emit!(NftPositionDeposited {
        position_nft: ctx.accounts.position_nft.key(),
        claimer: claimer_address,
    });

    Ok(())
}
