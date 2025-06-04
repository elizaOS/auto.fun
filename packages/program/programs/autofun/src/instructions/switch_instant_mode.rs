use anchor_lang::prelude::*;

use crate::{ constants::CONFIG, errors::PumpfunError, events::InstantModeSwitched, state::Config };

// Switch instant mode
#[derive(Accounts)]
pub struct SwitchInstantMode<'info> {
    #[account(mut, constraint = authority.key() == global_config.authority @PumpfunError::IncorrectAuthority)]
    authority: Signer<'info>,

    #[account(mut, seeds = [CONFIG.as_bytes()], bump)]
    pub global_config: Account<'info, Config>,
}

pub fn process_switch_to_instant_mode(ctx: Context<SwitchInstantMode>) -> Result<()> {
    ctx.accounts.global_config.is_instant_trading = true;

    emit!(InstantModeSwitched { instant_trade: true });

    Ok(())
}

pub fn process_switch_to_delay_mode(ctx: Context<SwitchInstantMode>) -> Result<()> {
    ctx.accounts.global_config.is_instant_trading = false;

    emit!(InstantModeSwitched { instant_trade: false });

    Ok(())
}
