import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import * as meteora_sdk from "@meteora-ag/cp-amm-sdk";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import {
    executeWallet,
    nftFaucetSeed,
    position_nft,
    positionSeed,
    randomID,
    solTokenAddress,
    vaultConfigSeed,
} from "./utils";
import { MeteoraVault } from "../target/types/meteora_vault";

describe("Claim position fee", function () {
    // Configure the client to use the local cluster.
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace.MeteoraVault as Program<MeteoraVault>;
    const connection = provider.connection;

    const nodeWallet = provider.wallet as NodeWallet;
    const signerWallet = anchor.web3.Keypair.fromSecretKey(
        nodeWallet.payer.secretKey
    );

    it("Check claimer balance", async function () {
        const claimer_address = signerWallet.publicKey;
        const [claimer_position] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(positionSeed), position_nft.toBuffer()],
            program.programId
        );
        const claimer_position_info = await program.account.userPosition.fetch(
            claimer_position
        );
        assert.equal(claimer_position_info.amount, 1, "Invalid Balance");
        assert.equal(
            claimer_position_info.claimer.toString(),
            claimer_address.toString(),
            "Invalid Claimer"
        );
        assert.equal(
            claimer_position_info.positionNft.toString(),
            position_nft.toString(),
            "Invalid Position NFT"
        );
    });

    it("Claim Position Fee", async function () {
        const [vaultConfig] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(vaultConfigSeed)],
            program.programId
        );

        const poolAuthority = meteora_sdk.derivePoolAuthority();
        const token_mint_a = solTokenAddress;
        const token_mint_b = new anchor.web3.PublicKey(
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        );
        const pool = new anchor.web3.PublicKey(
            "JAb3MtVMw5RtCaQRcxDRFn4EYQoy18BDE5ZwxbHazmbE"
        );
        const token_vault_a = meteora_sdk.deriveTokenVaultAddress(
            token_mint_a,
            pool
        );
        const token_vault_b = meteora_sdk.deriveTokenVaultAddress(
            token_mint_b,
            pool
        );
        const token_a_program = spl.TOKEN_PROGRAM_ID;
        const token_b_program = spl.TOKEN_PROGRAM_ID;
        const [position_nft_account] =
            anchor.web3.PublicKey.findProgramAddressSync(
                [Buffer.from(nftFaucetSeed), position_nft.toBuffer()],
                program.programId
            );
        const claimer_address = signerWallet.publicKey;

        await spl.getOrCreateAssociatedTokenAccount(
            connection,
            signerWallet,
            token_mint_a,
            claimer_address,
            true,
            undefined,
            undefined,
            token_a_program
        );
        await spl.getOrCreateAssociatedTokenAccount(
            connection,
            signerWallet,
            token_mint_b,
            claimer_address,
            true,
            undefined,
            undefined,
            token_b_program
        );
        const token_a_account = spl.getAssociatedTokenAddressSync(
            token_mint_a,
            claimer_address,
            true,
            token_a_program
        );
        const token_b_account = spl.getAssociatedTokenAddressSync(
            token_mint_b,
            claimer_address,
            true,
            token_b_program
        );
        const position = meteora_sdk.derivePositionAddress(position_nft);
        const [eventAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("__event_authority")],
            meteora_sdk.CP_AMM_PROGRAM_ID
        );
        await program.rpc.claimPositionFee({
            accounts: {
                authority: signerWallet.publicKey,
                vaultConfig: vaultConfig,
                poolAuthority: poolAuthority,
                pool: pool,
                position: position,
                tokenAAccount: token_a_account,
                tokenBAccount: token_b_account,
                tokenAVault: token_vault_a,
                tokenBVault: token_vault_b,
                tokenAMint: token_mint_a,
                tokenBMint: token_mint_b,
                positionNftAccount: position_nft_account,
                owner: vaultConfig,
                tokenAProgram: token_a_program,
                tokenBProgram: token_b_program,
                eventAuthority: eventAuthority,
                dynamicAmm: meteora_sdk.CP_AMM_PROGRAM_ID,
            }
        });
    });
});
