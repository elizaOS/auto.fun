use crate::{
    constants::{BONDING_CURVE, CONFIG, GLOBAL}, errors::*, state::{BondingCurve, BondingCurveAccount, Config}, utils::{sol_transfer_with_signer, token_transfer_with_signer}
};
use anchor_lang::{prelude::*, system_program};
use anchor_spl::{
    associated_token::{self, AssociatedToken}, 
    token::{self, Mint, Token, TokenAccount},
};

#[derive(Accounts)]
pub struct Withdraw<'info> {
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
    
    #[account(
        mut,
        constraint = global_config.authority == admin.key() @PumpfunError::IncorrectAuthority
    )]
    admin: Signer<'info>,

    token_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [BONDING_CURVE.as_bytes(), &token_mint.key().to_bytes()], 
        bump
    )]
    bonding_curve: Box<Account<'info, BondingCurve>>,

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
    global_vault_ata: AccountInfo<'info>,

    /// CHECK: ata of admin
    #[account(
        mut,
        seeds = [
            admin.key().as_ref(),
            anchor_spl::token::spl_token::ID.as_ref(),
            token_mint.key().as_ref(),
        ],
        bump,
        seeds::program = anchor_spl::associated_token::ID
    )]
    admin_ata: AccountInfo<'info>,

    #[account(address = system_program::ID)]
    system_program: Program<'info, System>,

    #[account(address = token::ID)]
    token_program: Program<'info, Token>,

    #[account(address = associated_token::ID)]
    associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> Withdraw<'info> {
pub fn process(
    &mut self,
    global_vault_bump:u8,
) -> Result<()> {
    let bonding_curve = &mut self.bonding_curve;
    let global_config = &mut self.global_config;
    let admin_ata = &mut self.admin_ata;

    require!(bonding_curve.is_completed, PumpfunError::CurveNotCompleted);

    //  create admin wallet ata, if it doesn't exist
    if admin_ata.data_is_empty() {
        anchor_spl::associated_token::create(CpiContext::new(
            self.associated_token_program.to_account_info(),
            anchor_spl::associated_token::Create {
                payer: self.admin.to_account_info(),
                associated_token: admin_ata.to_account_info(),
                authority: self.admin.to_account_info(),

                mint: self.token_mint.to_account_info(),
                system_program: self.system_program.to_account_info(),
                token_program: self.token_program.to_account_info(),
            }
        ))?;
    }

    // transfer sol/token to admin wallet
    let lamport_amount = bonding_curve.reserve_lamport - bonding_curve.init_lamport;
    let signer_seeds: &[&[&[u8]]] = &[&[
        GLOBAL.as_bytes(),
        &[global_vault_bump],
    ]];

    let token_acc =
        TokenAccount::try_deserialize(&mut &**self.global_vault_ata.try_borrow_mut_data()?)?;
    msg!("lamports balance: {:?}", self.global_vault.lamports());
    msg!("token balance: {:?}", token_acc.amount);

    msg!("withdraw lamports: {:?}", lamport_amount);
    msg!("withdraw token: {:?}", bonding_curve.reserve_token);

    sol_transfer_with_signer(
        self.global_vault.clone(),
        self.admin.to_account_info(),
        &self.system_program,
        signer_seeds,
        lamport_amount,
    )?;

    token_transfer_with_signer(
        self.global_vault_ata.clone(),
        self.global_vault.clone(),
        self.admin_ata.clone(),
        &self.token_program,
        signer_seeds,
        bonding_curve.reserve_token,
    )?;

    bonding_curve.update_reserves(global_config, 0, 0)?;

    Ok(())
}

}