use std::ops::{ Div, Mul };

use crate::{
    constants::{ BONDING_CURVE, CONFIG, GLOBAL, METADATA },
    errors::*,
    state::{ BondingCurve, BondingCurveAccount, Config },
};
use anchor_lang::{ prelude::*, solana_program::sysvar::SysvarId, system_program };
use anchor_spl::{
    associated_token::{ self, AssociatedToken },
    metadata::{ self, mpl_token_metadata::types::DataV2, Metadata },
    token::{ self, spl_token::instruction::AuthorityType, Mint, Token },
};

#[derive(Accounts)]
#[instruction(decimals: u8)]
pub struct LaunchAndSwap<'info> {
    #[account(
        mut,
        seeds = [CONFIG.as_bytes()],
        bump,
    )]
    global_config: Box<Account<'info, Config>>,

    /// CHECK: global vault pda which stores SOL
    #[account(
        mut,
        seeds = [GLOBAL.as_bytes()],
        bump,
    )]
    pub global_vault: AccountInfo<'info>,

    #[account(mut)]
    creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        mint::decimals = decimals,
        mint::authority = global_vault.key()
    )]
    token: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = creator,
        space = 8 + BondingCurve::INIT_SPACE,
        seeds = [BONDING_CURVE.as_bytes(), &token.key().to_bytes()],
        bump
    )]
    bonding_curve: Box<Account<'info, BondingCurve>>,

    /// CHECK: passed to token metadata program
    #[account(
        mut,
        seeds = [
            METADATA.as_bytes(),
            metadata::ID.as_ref(),
            token.key().as_ref(),
        ],
        bump,
        seeds::program = metadata::ID
    )]
    token_metadata_account: UncheckedAccount<'info>,

    /// CHECK: created in instruction
    #[account(
        mut,
        seeds = [
            global_vault.key().as_ref(),
            token::spl_token::ID.as_ref(),
            token.key().as_ref(),
        ],
        bump,
        seeds::program = associated_token::ID
    )]
    global_token_account: UncheckedAccount<'info>,

    //  team wallet
    /// CHECK: should be same with the address in the global_config
    #[account(
        mut,
        constraint = global_config.team_wallet == team_wallet.key() @PumpfunError::IncorrectAuthority
    )]
    pub team_wallet: AccountInfo<'info>,

    /// CHECK: ata of team wallet
    #[account(
        mut,
        seeds = [
            team_wallet.key().as_ref(),
            anchor_spl::token::spl_token::ID.as_ref(),
            token.key().as_ref(),
        ],
        bump,
        seeds::program = anchor_spl::associated_token::ID
    )]
    team_wallet_ata: AccountInfo<'info>,

    /// CHECK: ata of user (creator is the user for the swap)
    #[account(
        mut,
        seeds = [
            creator.key().as_ref(),
            anchor_spl::token::spl_token::ID.as_ref(),
            token.key().as_ref(),
        ],
        bump,
        seeds::program = anchor_spl::associated_token::ID
    )]
    user_ata: AccountInfo<'info>,

    #[account(address = system_program::ID)]
    system_program: Program<'info, System>,

    #[account(address = Rent::id())]
    rent: Sysvar<'info, Rent>,

    #[account(address = token::ID)]
    token_program: Program<'info, Token>,

    #[account(address = associated_token::ID)]
    associated_token_program: Program<'info, AssociatedToken>,

    #[account(address = metadata::ID)]
    mpl_token_metadata_program: Program<'info, Metadata>,
}

impl<'info> LaunchAndSwap<'info> {
    pub fn process(
        &mut self,
        // launch config
        decimals: u8,
        token_supply: u64,
        reserve_lamport: u64,
        curve_limit: u64,
        init_bonding_curve: f64,
        // metadata
        name: String,
        symbol: String,
        uri: String,
        // swap config
        swap_amount: u64,
        minimum_receive_amount: u64,
        deadline: i64,
        global_vault_bump: u8
    ) -> Result<u64> {
        // First, process the launch part
        self.process_launch(
            decimals,
            token_supply,
            reserve_lamport,
            curve_limit,
            init_bonding_curve,
            name,
            symbol,
            uri,
            global_vault_bump
        )?;

        // Then, process the swap part
        self.process_swap(
            swap_amount,
            0, // direction = 0 for buying tokens with SOL
            minimum_receive_amount,
            deadline,
            global_vault_bump
        )
    }

    fn process_launch(
        &mut self,
        // launch config
        decimals: u8,
        token_supply: u64,
        reserve_lamport: u64,
        curve_limit: u64,
        init_bonding_curve: f64,
        // metadata
        name: String,
        symbol: String,
        uri: String,
        global_vault_bump: u8
    ) -> Result<()> {
        let global_config = &self.global_config;
        let creator = &self.creator;
        let token = &self.token;
        let global_token_account = &self.global_token_account;
        let bonding_curve = &mut self.bonding_curve;
        let global_vault = &self.global_vault;
        let team_wallet = &mut self.team_wallet;
        let team_wallet_ata = &self.team_wallet_ata;

        // Decimal overflow check
        if decimals >= 20 {
            return err!(PumpfunError::DecimalOverflow);
        }

        // Check if token supply is a whole number of tokens
        let decimal_multiplier = (10u64).pow(decimals as u32);
        let fractional_tokens = token_supply % decimal_multiplier;
        if fractional_tokens != 0 {
            msg!("expected whole number of tokens, got fractional tokens: 0.{fractional_tokens}");
            return Err(ValueInvalid.into());
        }

        global_config.lamport_amount_config.validate(&reserve_lamport)?;

        global_config.token_supply_config.validate(&(token_supply / decimal_multiplier))?;

        global_config.token_decimals_config.validate(&decimals)?;

        let init_bonding_curve = (token_supply as f64).mul(init_bonding_curve).div(100_f64) as u64;

        let amount_to_team = token_supply - init_bonding_curve;

        // create token launch pda
        bonding_curve.token_mint = token.key();
        bonding_curve.creator = creator.key();
        bonding_curve.init_lamport = reserve_lamport;
        bonding_curve.reserve_lamport = reserve_lamport;
        bonding_curve.reserve_token = init_bonding_curve;
        bonding_curve.curve_limit = curve_limit;
        bonding_curve.created_time = Clock::get()?.unix_timestamp;

        // create global token account
        associated_token::create(
            CpiContext::new(
                self.associated_token_program.to_account_info(),
                associated_token::Create {
                    payer: creator.to_account_info(),
                    associated_token: global_token_account.to_account_info(),
                    authority: global_vault.to_account_info(),
                    mint: token.to_account_info(),
                    token_program: self.token_program.to_account_info(),
                    system_program: self.system_program.to_account_info(),
                }
            )
        )?;

        // create team token account
        anchor_spl::associated_token::create(
            CpiContext::new(
                self.associated_token_program.to_account_info(),
                anchor_spl::associated_token::Create {
                    payer: creator.to_account_info(),
                    associated_token: team_wallet_ata.to_account_info(),
                    authority: team_wallet.to_account_info(),
                    mint: token.to_account_info(),
                    system_program: self.system_program.to_account_info(),
                    token_program: self.token_program.to_account_info(),
                }
            )
        )?;

        // create user token account
        if self.user_ata.data_is_empty() {
            anchor_spl::associated_token::create(
                CpiContext::new(
                    self.associated_token_program.to_account_info(),
                    anchor_spl::associated_token::Create {
                        payer: creator.to_account_info(),
                        associated_token: self.user_ata.to_account_info(),
                        authority: creator.to_account_info(),
                        mint: token.to_account_info(),
                        system_program: self.system_program.to_account_info(),
                        token_program: self.token_program.to_account_info(),
                    }
                )
            )?;
        }

        let signer_seeds: &[&[&[u8]]] = &[&[GLOBAL.as_bytes(), &[global_vault_bump]]];

        // mint tokens to bonding curve & team
        token::mint_to(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                token::MintTo {
                    mint: token.to_account_info(),
                    to: global_token_account.to_account_info(),
                    authority: global_vault.to_account_info(),
                },
                signer_seeds
            ),
            init_bonding_curve
        )?;
        token::mint_to(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                token::MintTo {
                    mint: token.to_account_info(),
                    to: team_wallet_ata.to_account_info(),
                    authority: global_vault.to_account_info(),
                },
                signer_seeds
            ),
            amount_to_team
        )?;

        // create metadata
        metadata::create_metadata_accounts_v3(
            CpiContext::new_with_signer(
                self.mpl_token_metadata_program.to_account_info(),
                metadata::CreateMetadataAccountsV3 {
                    metadata: self.token_metadata_account.to_account_info(),
                    mint: token.to_account_info(),
                    mint_authority: global_vault.to_account_info(),
                    payer: creator.to_account_info(),
                    update_authority: global_vault.to_account_info(),
                    system_program: self.system_program.to_account_info(),
                    rent: self.rent.to_account_info(),
                },
                signer_seeds
            ),
            DataV2 {
                name,
                symbol,
                uri,
                seller_fee_basis_points: 0,
                creators: None,
                collection: None,
                uses: None,
            },
            false,
            true,
            None
        )?;

        //  revoke mint authority
        token::set_authority(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                token::SetAuthority {
                    current_authority: global_vault.to_account_info(),
                    account_or_mint: token.to_account_info(),
                },
                signer_seeds
            ),
            AuthorityType::MintTokens,
            None
        )?;

        bonding_curve.is_completed = false;

        msg!("NewToken: {} {}", bonding_curve.token_mint, bonding_curve.creator);

        Ok(())
    }

    fn process_swap(
        &mut self,
        amount: u64,
        direction: u8,
        minimum_receive_amount: u64,
        deadline: i64,
        global_vault_bump: u8
    ) -> Result<u64> {
        // Check deadline hasn't passed
        let current_timestamp = Clock::get()?.unix_timestamp;
        let bonding_curve = &mut self.bonding_curve;
        let hours_24 = 60i64 * 60i64 * 24i64;
        require!(current_timestamp <= deadline, PumpfunError::TransactionExpired);
        require!(
            self.global_config.clone().is_instant_trading == true ||
                current_timestamp.clone() - bonding_curve.clone().created_time >= hours_24,
            PumpfunError::TradeTooEarly
        );

        //  check curve is not completed - should always be false since we just created it
        require!(!bonding_curve.is_completed, PumpfunError::CurveAlreadyCompleted);

        // 0: buy, 1: sell
        if direction.clone() == 0 {
            require!(
                bonding_curve.clone().max_buy_amount == 0 ||
                    bonding_curve.clone().max_buy_amount > amount,
                PumpfunError::ExceedsMaxBuyAmount
            );
        } else {
            require!(
                bonding_curve.clone().max_sell_amount == 0 ||
                    bonding_curve.clone().max_sell_amount > amount,
                PumpfunError::ExceedsMaxSellAMount
            );
        }

        let source = &mut self.global_vault.to_account_info();
        let token = &mut self.token;
        let team_wallet = &mut self.team_wallet;
        let team_wallet_ata = &mut self.team_wallet_ata;
        let user_ata = &mut self.user_ata;

        let signer_seeds: &[&[&[u8]]] = &[&[GLOBAL.as_bytes(), &[global_vault_bump]]];

        // Perform the swap operation using the bonding curve's swap method
        let amount_out = bonding_curve.swap(
            &self.global_config,
            token.as_ref(),
            &mut self.global_token_account.to_account_info(),
            user_ata,
            source,
            team_wallet,
            team_wallet_ata,
            amount,
            direction,
            minimum_receive_amount,
            deadline,
            &self.creator,
            signer_seeds,
            &self.token_program,
            &self.system_program
        )?;

        Ok(amount_out)
    }
}
