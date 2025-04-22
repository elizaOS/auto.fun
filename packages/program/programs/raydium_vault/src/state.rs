use anchor_lang::prelude::*;

#[account]
pub struct VaultConfig {
    /// The authority that can manage executing operations
    pub executor_authority: Pubkey,

    /// The authority that can manage emergency operations
    pub emergency_authority: Pubkey,

    /// The authority that can manage administrative operations
    pub manager_authority: Pubkey,
}

#[account]
pub struct UserPosition {
    /// The owner of this position
    pub claimer: Pubkey,

    /// The NFT or token representing this position
    pub position_nft: Pubkey,

    /// The amount deposited in this position (default 1 for NFTs)
    pub amount: u8,

    /// Timestamp when the position was created
    pub created_at: i64,

    /// Timestamp of the last update to the position
    pub last_updated: i64,
}
