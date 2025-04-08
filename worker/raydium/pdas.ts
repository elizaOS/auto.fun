import * as anchor from "@coral-xyz/anchor";

//constants
export const LOCKING_PROGRAM = new anchor.web3.PublicKey(
  "LockrWmn6K5twhz3y9w1dQERbmgSaRkfnTeTKbpofwE",
);
export const LOCK_CP_AUTH_SEED = "lock_cp_authority_seed";
export const VAULT_CONFIG_SEED = "raydium_vault_config";
export const POSITION_SEED = "raydium_position";
export const NFT_FAUCET_SEED = "raydium_vault_nft_seed";
export const LOCKED_CP_LIQUIDITY_SEED = "locked_liquidity";

// PDAs
export function getVaultConfig(
  programId: anchor.web3.PublicKey,
): anchor.web3.PublicKey {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(VAULT_CONFIG_SEED)],
    programId,
  )[0];
}

export function getUserPosition(
  programId: anchor.web3.PublicKey,
  positionNft: anchor.web3.PublicKey,
): anchor.web3.PublicKey {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(POSITION_SEED), positionNft.toBuffer()],
    programId,
  )[0];
}

export function getNftTokenFaucet(
  programId: anchor.web3.PublicKey,
  positionNft: anchor.web3.PublicKey,
): anchor.web3.PublicKey {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(NFT_FAUCET_SEED), positionNft.toBuffer()],
    programId,
  )[0];
}

export function getLockedLiquidity(
  positionNft: anchor.web3.PublicKey,
  lockingProgram: anchor.web3.PublicKey = LOCKING_PROGRAM,
): anchor.web3.PublicKey {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(LOCKED_CP_LIQUIDITY_SEED), positionNft.toBuffer()],
    lockingProgram,
  )[0];
}
