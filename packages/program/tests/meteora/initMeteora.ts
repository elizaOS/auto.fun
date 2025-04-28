import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { vaultConfigSeed } from "./utils";
import { MeteoraVault } from "../../target/types/meteora_vault";

describe("Initialize Meteora Vault", function () {
    // Configure the client to use the local cluster.
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const nodeWallet = provider.wallet as NodeWallet;
    const signerWallet = anchor.web3.Keypair.fromSecretKey(
        nodeWallet.payer.secretKey
    );

    const program = anchor.workspace.MeteoraVault as Program<MeteoraVault>;

    it("Initialize Vault Config", async function () {
        let vaultConfig = {
            executorAuthority: signerWallet.publicKey,
            emergencyAuthority: signerWallet.publicKey,
            managerAuthority: signerWallet.publicKey,
        };
        const [vault] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(vaultConfigSeed)],
            program.programId
        );
        let vaultConfigInfo: any;

        try {
            vaultConfigInfo = await program.account.vaultConfig.fetch(vault);
        } catch (error) {
            await program.rpc.initialize(vaultConfig, {
                accounts: {
                    payer: signerWallet.publicKey,
                    vaultConfig: vault,
                    systemProgram: anchor.web3.SystemProgram.programId,
                },
            });
            vaultConfigInfo = await program.account.vaultConfig.fetch(vault);
        }

        console.log("executor: ", vaultConfigInfo.executorAuthority.toString());
        console.log(
            "emergency: ",
            vaultConfigInfo.emergencyAuthority.toString()
        );
        console.log("manager: ", vaultConfigInfo.managerAuthority.toString());
    });
});
