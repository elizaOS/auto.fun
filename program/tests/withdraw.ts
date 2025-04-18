import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { Program } from "@coral-xyz/anchor";
import { RaydiumVault } from "../target/types/raydium_vault";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import {
    getNftAddress,
    isDevnet,
    nftFaucetSeed,
    positionSeed,
    vaultConfigSeed,
} from "./utils";

describe("raydium_vault", () => {
    // Configure the client to use the local cluster.
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const nodeWallet = provider.wallet as NodeWallet;
    const signerWallet = anchor.web3.Keypair.fromSecretKey(
        nodeWallet.payer.secretKey
    );

    const program = anchor.workspace.RaydiumVault as Program<RaydiumVault>;

    it("Emergency Withdraw", async function () {
        const isDev = isDevnet(connection);
        const position_nft = getNftAddress(isDev);

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
            signerWallet.publicKey
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
                toAccount: to_account,
                nftTokenFaucet: nft_token_faucet,
                tokenProgram: spl.TOKEN_PROGRAM_ID,
            },
        });
    });
});
