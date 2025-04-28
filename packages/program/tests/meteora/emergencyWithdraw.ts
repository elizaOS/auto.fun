import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import {
    nftFaucetSeed,
    position_nft,
    positionSeed,
    vaultConfigSeed,
} from "./utils";
import { MeteoraVault } from "../target/types/meteora_vault";

describe("Emergency Withdraw", function () {
    // Configure the client to use the local cluster.
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace.MeteoraVault as Program<MeteoraVault>;
    const connection = provider.connection;

    const nodeWallet = provider.wallet as NodeWallet;
    const signerWallet = anchor.web3.Keypair.fromSecretKey(
        nodeWallet.payer.secretKey
    );

    it("Emergency Withdraw", async function () {
        const [vault_config] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(vaultConfigSeed)],
            program.programId
        );
        const [user_position] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(positionSeed), position_nft.toBuffer()],
            program.programId
        );
        const to_account = spl.getAssociatedTokenAddressSync(
            position_nft,
            signerWallet.publicKey,
            true,
            spl.TOKEN_2022_PROGRAM_ID
        );
        const [nft_token_faucet] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(nftFaucetSeed), position_nft.toBuffer()],
            program.programId
        );

        await program.rpc.emergencyWithdraw({
            accounts: {
                authority: signerWallet.publicKey,
                vaultConfig: vault_config,
                userPosition: user_position,
                positionNft: position_nft,
                nftTokenFaucet: nft_token_faucet,
                toAccount: to_account,
                tokenProgram: spl.TOKEN_2022_PROGRAM_ID,
            },
        });
    });
});
