use constants::CONFIG;
use errors::PumpfunError;

use crate::*;

#[derive(Accounts)]
pub struct NominateAuthority<'info> {
    // Current admin
    #[account(
        mut,
        constraint = global_config.authority == *admin.key @PumpfunError::IncorrectAuthority
    )]
    pub admin: Signer<'info>,

    //  Stores admin address
    #[account(
        mut,
        seeds = [CONFIG.as_bytes()],
        bump,
    )]
    global_config: Box<Account<'info, Config>>,
}

impl NominateAuthority<'_> {
    pub fn process(&mut self, new_admin: Pubkey) -> Result<()> {
        self.global_config.pending_authority = new_admin;
        Ok(())
    }
}
