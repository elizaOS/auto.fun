import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RaydiumVault } from "../target/types/raydium_vault";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import {
    claimer_address_0,
    getNftAddress,
    isDevnet,
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

    it("Change Claimer", async function () {
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
        const claimer_address = claimer_address_0;

        await program.rpc.changeClaimer(claimer_address, {
            accounts: {
                authority: signerWallet.publicKey,
                vaultConfig: vault_config,
                userPosition: user_position,
                positionNft: position_nft,
            },
        });
    });
});
