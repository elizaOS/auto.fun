use anchor_lang::prelude::*;

#[event]
pub struct VaultInitialized {
    pub executor: Pubkey,
    pub emergency: Pubkey,
    pub manager: Pubkey,
}

#[event]
pub struct NftPositionDeposited {
    pub position_nft: Pubkey,
    pub claimer: Pubkey,
}

#[event]
pub struct ExecutorChanged {
    pub old_executor: Pubkey,
    pub new_executor: Pubkey,
}

#[event]
pub struct EmergencyChanged {
    pub old_emergency: Pubkey,
    pub new_emergency: Pubkey,
}

#[event]
pub struct ManagerChanged {
    pub old_manager: Pubkey,
    pub new_manager: Pubkey,
}

#[event]
pub struct CpFeeCollected {
    pub claimer: Pubkey,
    pub position_nft: Pubkey,
    pub claimed_time: i64,
}

#[event]
pub struct EmergencyWithdrawed {
    pub claimer: Pubkey,
    pub position_nft: Pubkey,
    pub withdrawed_time: i64,
}

#[event]
pub struct ClaimerChanged {
    pub old_claimer: Pubkey,
    pub new_claimer: Pubkey,
}
