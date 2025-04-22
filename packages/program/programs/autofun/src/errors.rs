use anchor_lang::prelude::*;

pub use PumpfunError::*;

#[error_code]
pub enum PumpfunError {
    #[msg("ValueTooSmall")]
    ValueTooSmall,

    #[msg("ValueTooLarge")]
    ValueTooLarge,

    #[msg("ValueInvalid")]
    ValueInvalid,

    #[msg("IncorrectConfigAccount")]
    IncorrectConfigAccount,

    #[msg("IncorrectAuthority")]
    IncorrectAuthority,

    #[msg("Overflow or underflow occured")]
    OverflowOrUnderflowOccurred,

    #[msg("Amount is invalid")]
    InvalidAmount,

    #[msg("Incorrect team wallet address")]
    IncorrectTeamWallet,
    
    #[msg("Curve is not completed")]
    CurveNotCompleted,
    
    #[msg("Can not swap after the curve is completed")]
    CurveAlreadyCompleted,
    
    #[msg("Mint authority should be revoked")]
    MintAuthorityEnabled,
    
    #[msg("Freeze authority should be revoked")]
    FreezeAuthorityEnabled,

    #[msg("Return amount is too small compared to the minimum received amount")]
    ReturnAmountTooSmall,

    #[msg("Transaction expired")]
    TransactionExpired,

    #[msg("Decimal overflow")]
    DecimalOverflow,
}
