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
import { MeteoraVault } from "../../target/types/meteora_vault";

describe("Deposit NFT to Meteora Vault", () => {
    // Configure the client to use the local cluster.
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace.MeteoraVault as Program<MeteoraVault>;
    const connection = provider.connection;

    const nodeWallet = provider.wallet as NodeWallet;
    const signerWallet = anchor.web3.Keypair.fromSecretKey(
        nodeWallet.payer.secretKey
    );

    it("Check Balance", async () => {
        await spl.getOrCreateAssociatedTokenAccount(
            connection,
            signerWallet,
            position_nft,
            signerWallet.publicKey,
            true,
            undefined,
            undefined,
            spl.TOKEN_2022_PROGRAM_ID
        );

        const signer_nft_account = spl.getAssociatedTokenAddressSync(
            position_nft,
            signerWallet.publicKey,
            true,
            spl.TOKEN_2022_PROGRAM_ID
        );
        console.log("signer_nft_account: ", signer_nft_account.toString());
        const signer_balance = await connection.getTokenAccountBalance(
            signer_nft_account
        );
        console.log("signer_balance: ", signer_balance.value.uiAmount);

        assert.equal(
            signer_balance.value.uiAmount >= 1,
            true,
            "Insuffcient Balance"
        );
    });

    it("Deposit NFT and check", async function () {
        const claimer_address = signerWallet.publicKey;
        const [vault_config] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(vaultConfigSeed)],
            program.programId
        );
        const [user_position] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(positionSeed), position_nft.toBuffer()],
            program.programId
        );
        const from_account = spl.getAssociatedTokenAddressSync(
            position_nft,
            signerWallet.publicKey,
            true,
            spl.TOKEN_2022_PROGRAM_ID
        );
        const [nft_token_faucet] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(nftFaucetSeed), position_nft.toBuffer()],
            program.programId
        );

        await program.rpc.deposit(claimer_address, {
            accounts: {
                authority: signerWallet.publicKey,
                vaultConfig: vault_config,
                userPosition: user_position,
                positionNft: position_nft,
                fromAccount: from_account,
                nftTokenFaucet: nft_token_faucet,
                tokenProgram: spl.TOKEN_2022_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        });
    });
});
