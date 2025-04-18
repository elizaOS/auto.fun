use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Unauthorized access attempt")]
    Unauthorized,

    #[msg("Position not found")]
    PositionNotFound,

    #[msg("Claimer not found")]
    ClaimerNotFound,

    #[msg("Invalid position")]
    InvalidPosition,

    #[msg("Invalid authority")]
    InvalidAuthority,

    #[msg("Invalid fee claimer")]
    InvalidFeeClaimer,

    #[msg("Invalid token or NFT")]
    InvalidToken,

    #[msg("Invalid claimer address")]
    InvalidClaimerAddress,

    #[msg("Balance Overflow")]
    BalanceOverflow,

    #[msg("Invalid NFT Owner")]
    InvalidNftOwner,

    #[msg("Only One NFT Allowed")]
    OnlyOneNftAllowed,

    #[msg("Insufficient Balance")]
    InsufficientBalance,
}
