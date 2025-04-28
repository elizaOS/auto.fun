import * as anchor from "@coral-xyz/anchor";

const executeSecretKeyNumber: number[] = [
    28, 104, 143, 128, 59, 0, 181, 137, 7, 0, 109, 192, 171, 174, 70, 209, 124,
    48, 106, 41, 5, 110, 192, 150, 4, 153, 122, 29, 37, 55, 167, 35, 150, 116,
    188, 53, 101, 8, 41, 45, 59, 159, 5, 78, 229, 87, 43, 43, 209, 147, 216,
    183, 65, 162, 56, 174, 144, 160, 58, 35, 63, 225, 242, 32,
];
const executeSecretKey = new Uint8Array(executeSecretKeyNumber);
export const executeWallet =
    anchor.web3.Keypair.fromSecretKey(executeSecretKey);

export const position_nft = new anchor.web3.PublicKey(
    "6vKambNz9K8vgtTNN86ToMUBR3GM4JR6isfpiGUFqJzD"
);
export const meteora_damm_v2 = new anchor.web3.PublicKey(
    "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG"
);

export const vaultConfigSeed = "meteora_vault_config";
export const positionSeed = "meteora_position";
export const nftFaucetSeed = "meteora_vault_nft_seed";
export const solTokenAddress = new anchor.web3.PublicKey(
    "So11111111111111111111111111111111111111112"
);
export function randomID(min = 0, max = 10000) {
    return Math.floor(Math.random() * (max - min) + min);
}

module.exports = {
    position_nft,
    executeWallet,
    meteora_damm_v2,
    vaultConfigSeed,
    positionSeed,
    nftFaucetSeed,
    solTokenAddress,
    randomID,
};
