use anchor_lang::{system_program, prelude::*};
use anchor_spl::{
    associated_token::{self, AssociatedToken},
    token::{self, Mint, Token},
};
use crate::{
    constants::{BONDING_CURVE, CONFIG, GLOBAL}, 
    errors::PumpfunError, 
    state::{BondingCurve, Config, BondingCurveAccount}
};

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(
        seeds = [CONFIG.as_bytes()],
        bump,
    )]
    global_config: Box<Account<'info, Config>>,
    
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
            token_mint.key().as_ref(),
        ],
        bump,
        seeds::program = anchor_spl::associated_token::ID
    )]
    team_wallet_ata: AccountInfo<'info>,


    #[account(
        mut,
        seeds = [BONDING_CURVE.as_bytes(), &token_mint.key().to_bytes()], 
        bump
    )]
    bonding_curve: Account<'info, BondingCurve>,

    /// CHECK: global vault pda which stores SOL
    #[account(
        mut,
        seeds = [GLOBAL.as_bytes()],
        bump,
    )]
    pub global_vault: AccountInfo<'info>,

    pub token_mint: Box<Account<'info, Mint>>,

    /// CHECK: ata of global vault
    #[account(
        mut,
        seeds = [
            global_vault.key().as_ref(),
            anchor_spl::token::spl_token::ID.as_ref(),
            token_mint.key().as_ref(),
        ],
        bump,
        seeds::program = anchor_spl::associated_token::ID
    )]
    global_ata: AccountInfo<'info>,

    /// CHECK: ata of user
    #[account(
        mut,
        seeds = [
            user.key().as_ref(),
            anchor_spl::token::spl_token::ID.as_ref(),
            token_mint.key().as_ref(),
        ],
        bump,
        seeds::program = anchor_spl::associated_token::ID
    )]
    user_ata: AccountInfo<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(address = system_program::ID)]
    pub system_program: Program<'info, System>,

    #[account(address = token::ID)]
    pub token_program: Program<'info, Token>,

    #[account(address = associated_token::ID)]
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> Swap<'info> { 
pub fn process(&mut self, amount: u64, direction: u8, minimum_receive_amount: u64, deadline: i64, global_vault_bump:u8) -> Result<u64> {
    // Check deadline hasn't passed
    let current_timestamp = Clock::get()?.unix_timestamp;
    require!(
        current_timestamp <= deadline,
        PumpfunError::TransactionExpired
    );
    
    let bonding_curve = &mut self.bonding_curve;

    //  check curve is not completed
    require!(
        !bonding_curve.is_completed,
        PumpfunError::CurveAlreadyCompleted
    );

    let source = &mut self.global_vault.to_account_info();

    let token = &mut self.token_mint;
    let team_wallet = &mut self.team_wallet;
    let team_wallet_ata = &mut self.team_wallet_ata;
    let user_ata = &mut self.user_ata;

    //  create user wallet ata, if it doean't exit
    if user_ata.data_is_empty() {
        anchor_spl::associated_token::create(CpiContext::new(
            self.associated_token_program.to_account_info(),
            anchor_spl::associated_token::Create {
                payer: self.user.to_account_info(),
                associated_token: user_ata.to_account_info(),
                authority: self.user.to_account_info(),

                mint: token.to_account_info(),
                system_program: self.system_program.to_account_info(),
                token_program: self.token_program.to_account_info(),
            }
        ))?;
    }

    //  create team wallet ata, if it doesn't exist
    if team_wallet_ata.data_is_empty() {
        anchor_spl::associated_token::create(CpiContext::new(
            self.associated_token_program.to_account_info(),
            anchor_spl::associated_token::Create {
                payer: self.user.to_account_info(),
                associated_token: team_wallet_ata.to_account_info(),
                authority: team_wallet.to_account_info(),

                mint: token.to_account_info(),
                system_program: self.system_program.to_account_info(),
                token_program: self.token_program.to_account_info(),
            }
        ))?;
    }

    let signer_seeds: &[&[&[u8]]] = &[&[
        GLOBAL.as_bytes(),
        &[global_vault_bump],
    ]];

    
    let amount_out = bonding_curve.swap(
        &self.global_config,
        token.as_ref(),
        &mut self.global_ata,
        user_ata,
        source,
        team_wallet,
        team_wallet_ata,
        amount,
        direction,
        minimum_receive_amount,
        deadline,

        &self.user,
        signer_seeds,

        &self.token_program,
        &self.system_program,
    )?;
    
    Ok(amount_out)
}

}