import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import {
    meteora_damm_v2,
    nftFaucetSeed,
    position_nft,
    positionSeed,
} from "./utils";
import { MeteoraVault } from "../../target/types/meteora_vault";
import { assert } from "chai";

describe("check NFT balance", () => {
    // Configure the client to use the local cluster.
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;
    const program = anchor.workspace
        .MeteoraVault as anchor.Program<MeteoraVault>;

    const nodeWallet = provider.wallet as NodeWallet;
    const signerWallet = anchor.web3.Keypair.fromSecretKey(
        nodeWallet.payer.secretKey
    );

    it("Check Balance", async () => {
        const claimer = new anchor.web3.PublicKey(
            "muggmwgB6zEjZ2uJhH7Sq9P9vYdWwZB5UsQ9zKmtkue"
        );

        console.log(
            (await connection.getAccountInfo(position_nft)).owner.toString()
        );
        console.log(spl.TOKEN_2022_PROGRAM_ID.toString());

        const [claimer_nft_account] =
            anchor.web3.PublicKey.findProgramAddressSync(
                [Buffer.from("position_nft_account"), position_nft.toBuffer()],
                meteora_damm_v2
            );
        console.log("claimer_nft_account: ", claimer_nft_account.toString());

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

        const claimer_balance = await connection.getTokenAccountBalance(
            claimer_nft_account
        );
        console.log("claimer_balance: ", claimer_balance.value.uiAmount);
        const signer_balance = await connection.getTokenAccountBalance(
            signer_nft_account
        );
        console.log("signer_balance: ", signer_balance.value.uiAmount);

        const [user_position] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(positionSeed), position_nft.toBuffer()],
            program.programId
        );
        const [nft_token_faucet] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(nftFaucetSeed), position_nft.toBuffer()],
            program.programId
        );
        console.log(
            "user_position_info: ",
            await program.account.userPosition.fetch(user_position)
        );
        const nft_faucet_balance = await connection.getTokenAccountBalance(
            nft_token_faucet
        );
        console.log("nft_faucet_balance: ", nft_faucet_balance.value.amount);
    });
});
