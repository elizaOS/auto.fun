use crate::constants::LAMPORT_DECIMALS;
use crate::errors::*;
use crate::events::CompleteEvent;
use crate::utils::*;
use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};
use anchor_spl::token::Mint;
use anchor_spl::token::Token;
use core::fmt::Debug;

pub const FEE_BASIS_POINTS: u128 = 10000;
pub const HUNDRED_PERCENT_BPS: u128 = 10000;
#[account]
pub struct Config {
    pub authority: Pubkey,
    //  use this for 2 step ownership transfer
    pub pending_authority: Pubkey,

    pub team_wallet: Pubkey,

    pub init_bonding_curve: f64, // bonding curve init percentage. The remaining amount is sent to team wallet for distribution to agent

    pub platform_buy_fee: u128, //  platform fee percentage
    pub platform_sell_fee: u128,

    pub curve_limit: u64, //  lamports to complete the bonding curve

    pub lamport_amount_config: AmountConfig<u64>,
    pub token_supply_config: AmountConfig<u64>,
    pub token_decimals_config: AmountConfig<u8>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum AmountConfig<T: PartialEq + PartialOrd + Debug> {
    Range { min: Option<T>, max: Option<T> },
    Enum(Vec<T>),
}

impl<T: PartialEq + PartialOrd + Debug> AmountConfig<T> {
    pub fn validate(&self, value: &T) -> Result<()> {
        match self {
            Self::Range { min, max } => {
                if let Some(min) = min {
                    if value < min {
                        msg!("value {value:?} too small, expected at least {min:?}");
                        return Err(ValueTooSmall.into());
                    }
                }
                if let Some(max) = max {
                    if value > max {
                        msg!("value {value:?} too large, expected at most {max:?}");
                        return Err(ValueTooLarge.into());
                    }
                }

                Ok(())
            }
            Self::Enum(options) => {
                if options.contains(value) {
                    Ok(())
                } else {
                    msg!("invalid value {value:?}, expected one of: {options:?}");
                    Err(ValueInvalid.into())
                }
            }
        }
    }
}

#[account]
#[derive(InitSpace)]
pub struct BondingCurve {
    pub token_mint: Pubkey,
    pub creator: Pubkey,
    pub init_lamport: u64,
    pub reserve_lamport: u64,
    pub reserve_token: u64,
    pub curve_limit: u64,  // Store curve limit at launch time
    pub is_completed: bool,
}
pub trait BondingCurveAccount<'info> {
    // Updates the token reserves in the liquidity pool
    fn update_reserves(
        &mut self,
        global_config: &Account<'info, Config>,
        reserve_one: u64,
        reserve_two: u64,
    ) -> Result<bool>;
    #[allow(clippy::too_many_arguments)]
    fn swap(
        &mut self,
        global_config: &Account<'info, Config>,
        token_mint: &Account<'info, Mint>,
        global_ata: &mut AccountInfo<'info>,
        user_ata: &mut AccountInfo<'info>,
        source: &mut AccountInfo<'info>,
        team_wallet: &mut AccountInfo<'info>,
        team_wallet_ata: &mut AccountInfo<'info>,
        amount: u64,
        direction: u8,
        minimum_receive_amount: u64,
        deadline: i64,

        user: &Signer<'info>,
        signer: &[&[&[u8]]],

        token_program: &Program<'info, Token>,
        system_program: &Program<'info, System>,
    ) -> Result<u64>;

    fn cal_amount_out(
        &self,
        amount: u64,
        token_one_decimals: u8,
        direction: u8,
        platform_sell_fee: u128,
        platform_buy_fee: u128,
    ) -> Result<(u64, u64)>;
}

impl<'info> BondingCurveAccount<'info> for Account<'info, BondingCurve> {
    fn update_reserves(
        &mut self,
        _global_config: &Account<'info, Config>,
        reserve_token: u64,
        reserve_lamport: u64,
    ) -> Result<bool> {
        self.reserve_token = reserve_token;
        self.reserve_lamport = reserve_lamport;
    
        if reserve_lamport >= self.curve_limit {
            msg!("curve is completed");
            self.is_completed = true;
            return Ok(true);
        }
    
        Ok(false)
    }

    fn swap(
        &mut self,
        global_config: &Account<'info, Config>,

        token_mint: &Account<'info, Mint>,
        global_ata: &mut AccountInfo<'info>,
        user_ata: &mut AccountInfo<'info>,

        source: &mut AccountInfo<'info>,
        team_wallet: &mut AccountInfo<'info>,
        team_wallet_ata: &mut AccountInfo<'info>,

        amount: u64,
        direction: u8,
        minimum_receive_amount: u64,
        deadline: i64,

        user: &Signer<'info>,
        signer: &[&[&[u8]]],

        token_program: &Program<'info, Token>,
        system_program: &Program<'info, System>,
    ) -> Result<u64> {
        if amount == 0 {
            return err!(PumpfunError::InvalidAmount);
        }

        // Deadline check
        let current_timestamp = Clock::get()?.unix_timestamp;
        require!(
            current_timestamp <= deadline,
            PumpfunError::TransactionExpired
        );

        msg!("curve_limit: {:?} ", global_config.curve_limit);
        msg!("reserve_lamport: {:?} ", self.reserve_lamport);

        // if side = buy, amount to swap = min(amount, remaining reserve)
        // let amount = if direction == 1 {
        //     amount
        // } else {
        //     amount.min(global_config.curve_limit - self.reserve_lamport)
        // };

        // if side = buy, amount to swap = min(amount, remaining reserve)
        // Calculate swap and refund amounts
        let (amount_to_swap, refund_amount, adjusted_minimum_receive) = if direction == 1 {
            (amount, 0, minimum_receive_amount)
        } else {
            let remaining = self.curve_limit.saturating_sub(self.reserve_lamport);
            if amount > remaining {
                let adjustment_ratio = convert_to_float(remaining, LAMPORT_DECIMALS) / 
                                    convert_to_float(amount, LAMPORT_DECIMALS);
                let adjusted_minimum = convert_from_float(
                    convert_to_float(minimum_receive_amount, token_mint.decimals) * adjustment_ratio,
                    token_mint.decimals
                );
                (remaining, amount - remaining, adjusted_minimum)
            } else {
                (amount, 0, minimum_receive_amount)
            }
        };

        msg!("Mint: {:?} ", token_mint.key());
        msg!("Swap: {:?} {:?} {:?}", user.key(), direction, amount_to_swap);

        // xy = k => Constant product formula
        // (x + dx)(y - dy) = k
        // y - dy = k / (x + dx)
        // y - dy = xy / (x + dx)
        // dy = y - (xy / (x + dx))
        // dy = yx + ydx - xy / (x + dx)
        // formula => dy = ydx / (x + dx)

        let (adjusted_amount, amount_out) = self.cal_amount_out(
            amount_to_swap,
            token_mint.decimals,
            direction,
            global_config.platform_sell_fee,
            global_config.platform_buy_fee,
        )?;

        if amount_out < adjusted_minimum_receive {
            return Err(PumpfunError::ReturnAmountTooSmall.into());
        }

        if direction == 1 {

            let new_reserves_one = self
                .reserve_token
                .checked_add(adjusted_amount)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            let new_reserves_two = self
                .reserve_lamport
                .checked_sub(amount_out)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            self.update_reserves(global_config, new_reserves_one, new_reserves_two)?;

            msg! {"Reserves: {:?} {:?}", new_reserves_one, new_reserves_two};

            token_transfer_user(
                user_ata.clone(),
                user,
                global_ata.clone(),
                token_program,
                adjusted_amount,
            )?;

            sol_transfer_with_signer(
                source.clone(),
                user.to_account_info(),
                system_program,
                signer,
                amount_out,
            )?;

            //  transfer fee to team wallet
            let fee_amount = amount_to_swap - adjusted_amount;

            msg! {"fee: {:?}", fee_amount}

            // msg!("SwapEvent: {:?} {:?} {:?}", user.key(), direction, amount_out);

            token_transfer_user(
                user_ata.clone(),
                user,
                team_wallet_ata.clone(),
                token_program,
                fee_amount,
            )?;
        } else {
            let new_reserves_one = self
                .reserve_token
                .checked_sub(amount_out)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            let new_reserves_two = self
                .reserve_lamport
                .checked_add(amount_to_swap)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;

            let is_completed =
                self.update_reserves(global_config, new_reserves_one, new_reserves_two)?;

            if is_completed {
                emit!(CompleteEvent {
                    user: user.key(),
                    mint: token_mint.key(),
                    bonding_curve: self.key()
                });
            }

            msg! {"Reserves: {:?} {:?}", new_reserves_one, new_reserves_two};

            token_transfer_with_signer(
                global_ata.clone(),
                source.clone(),
                user_ata.clone(),
                token_program,
                signer,
                amount_out,
            )?;

            sol_transfer_from_user(user, source.clone(), system_program, amount_to_swap)?;

            // msg!("SwapEvent: {:?} {:?} {:?}", user.key(), direction, amount_out);

            //  transfer fee to team wallet
            let fee_amount = amount_to_swap - adjusted_amount;
            msg! {"fee: {:?}", fee_amount}

            sol_transfer_from_user(user, team_wallet.clone(), system_program, fee_amount)?;

            // Refund excess SOL directly back to user
            if refund_amount > 0 {
                sol_transfer_from_user(user, user.to_account_info(), system_program, refund_amount)?;
            }
        }
        msg!("SwapEvent: {:?} {:?} {:?}", user.key(), direction, amount_out);
        Ok(amount_out)
    }

    fn cal_amount_out(
        &self,
        amount: u64,
        _token_one_decimals: u8,
        direction: u8,
        platform_sell_fee: u128,
        platform_buy_fee: u128,
    ) -> Result<(u64, u64)> {
        // Convert percentage fees to basis points
        let fee_basis_points = if direction == 1 {
            platform_sell_fee
        } else {
            platform_buy_fee
        };
    
        let amount_u128 = amount as u128;
        let adjusted_amount = amount_u128
            .checked_mul(HUNDRED_PERCENT_BPS.checked_sub(fee_basis_points).ok_or(PumpfunError::OverflowOrUnderflowOccurred)?)
            .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?
            .checked_div(FEE_BASIS_POINTS)
            .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;
    
        let adjusted_amount = adjusted_amount as u64;
    
        let amount_out = if direction == 1 {
            // Selling tokens for SOL: dy = (y * dx) / (x + dx)
            let numerator = (self.reserve_lamport as u128)
                .checked_mul(adjusted_amount as u128)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;
                
            let denominator = (self.reserve_token as u128)
                .checked_add(adjusted_amount as u128)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;
                
            (numerator.checked_div(denominator)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?) as u64
        } else {
            // Buying tokens with SOL: dx = (x * dy) / (y + dy)
            let numerator = (self.reserve_token as u128)
                .checked_mul(adjusted_amount as u128)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;
                
            let denominator = (self.reserve_lamport as u128)
                .checked_add(adjusted_amount as u128)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?;
                
            (numerator.checked_div(denominator)
                .ok_or(PumpfunError::OverflowOrUnderflowOccurred)?) as u64
        };
    
        Ok((adjusted_amount, amount_out))
    }
}
