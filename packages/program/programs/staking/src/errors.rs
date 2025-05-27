use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("Not Distributor")]
  NotDistributor,
  #[msg("Zero Amount Added")]
  ZeroAmount,
  #[msg("Insufficient Funds")]
  InsufficientFunds,
  #[msg("Not Reward Register")]
  NotRewardRegister,
  #[msg("Reward Already Exists")]
  RewardAlreadyExists,
  #[msg("Pool Already Initialized")]
  AlreadyInitialized,
  #[msg("Invalid Rewards Distributor")]
  InvalidDistributor,
  #[msg("Math Overflow")]
  Overflow,
  #[msg("User Account Not Provided")]
  UserAccountNotProvided,
  #[msg("User Reward Account Not Provided")]
  UserRewardNotProvided,
  #[msg("User Reward Accounts Have Different Length to Reward Accounts")]
  RewardsUnalignedWithUserRewards,
  #[msg("Rewards Passed Do Not Equal the Amount of Rewards in the Pool")]
  PoolRewardsUnequalToRewardsPassed,
  #[msg("Order of Rewards Not Same As Pool")]
  MismatchedReward,
  #[msg("Mint doesn't Match Reward Mint")]
  InvalidMint,
  #[msg("Reward Period Is Still Active")]
  RewardsStillActive,
  #[msg("Pool Does Not Match User Account")]
  MismatchedUserPool,
  #[msg("Zero Reward Rate")]
  ZeroRewardRate,
  #[msg("Invalid Duration")]
  InvalidDuration,
}