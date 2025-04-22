use crate::*;
use anchor_spl::token::{self, Token};
use anchor_lang::solana_program;

// TODO, remove all floats and conversions for precision
pub fn convert_to_float(value: u64, decimals: u8) -> f64 {
    let denominator = 10u64.checked_pow(decimals as u32)
        .expect("Decimal power overflow") as f64;
    (value as f64) / denominator
}

pub fn convert_from_float(value: f64, decimals: u8) -> u64 {
    let multiplier = 10u64.checked_pow(decimals as u32)
        .expect("Decimal power overflow") as f64;
    (value * multiplier) as u64
}

//  transfer sol from user
pub fn sol_transfer_from_user<'info>(
    signer: &Signer<'info>,
    destination: AccountInfo<'info>,
    system_program: &Program<'info, System>,
    amount: u64,
) -> Result<()> {
    let ix = solana_program::system_instruction::transfer(
        signer.key,
        destination.key,
        amount,
    );
    solana_program::program::invoke(
        &ix,
        &[
            signer.to_account_info(),
            destination,
            system_program.to_account_info(),
        ],
    )
    .map_err(anchor_lang::error::Error::from)?;
    Ok(())
}

// transfer sol from PDA
pub fn sol_transfer_with_signer<'info>(
    source: AccountInfo<'info>,
    destination: AccountInfo<'info>,
    system_program: &Program<'info, System>,
    signers_seeds: &[&[&[u8]]],
    amount: u64,
) -> Result<()> {
    let ix = solana_program::system_instruction::transfer(
        source.key,
        destination.key,
        amount,
    );
    solana_program::program::invoke_signed(
        &ix,
        &[source, destination, system_program.to_account_info()],
        signers_seeds,
    )
    .map_err(anchor_lang::error::Error::from)?;
    Ok(())
}

//  transfer token from user
pub fn token_transfer_user<'info>(
    from: AccountInfo<'info>,
    authority: &Signer<'info>,
    to: AccountInfo<'info>,
    token_program: &Program<'info, Token>,
    amount: u64,
) -> Result<()> {
    let cpi_ctx: CpiContext<_> = CpiContext::new(
        token_program.to_account_info(),
        token::Transfer {
            from,
            authority: authority.to_account_info(),
            to,
        },
    );
    token::transfer(cpi_ctx, amount)?;

    Ok(())
}

//  transfer token from PDA
pub fn token_transfer_with_signer<'info>(
    from: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    to: AccountInfo<'info>,
    token_program: &Program<'info, Token>,
    signer_seeds: &[&[&[u8]]],
    amount: u64,
) -> Result<()> {
    let cpi_ctx: CpiContext<_> = CpiContext::new_with_signer(
        token_program.to_account_info(),
        token::Transfer {
            from,
            to,
            authority,
        },
        signer_seeds,
    );
    token::transfer(cpi_ctx, amount)?;

    Ok(())
}
