import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RaydiumVault } from "../target/types/raydium_vault";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { vaultConfigSeed } from "./utils";

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

    it("Get Current authority wallets", async function () {
        const [vault_config] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(vaultConfigSeed)],
            program.programId
        );

        const vault_config_info = await program.account.vaultConfig.fetch(
            vault_config
        );

        console.log(
            "executor authority: ",
            vault_config_info.executorAuthority.toString()
        );
        console.log(
            "emergency authority: ",
            vault_config_info.executorAuthority.toString()
        );
        console.log(
            "manager authority: ",
            vault_config_info.managerAuthority.toString()
        );
    });

    it("Update executor, emergency and manager authority", async function () {
        const [vaultConfig] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(vaultConfigSeed)],
            program.programId
        );
        console.log("Update Executor Wallet...");
        let newExecutorAddress = new anchor.web3.PublicKey(
            "6HHoqvXfNF1aQpwhn4k13CL7iyzFpjghLhG2eBG6xMVV"
        );
        let newEmergencyAddress = new anchor.web3.PublicKey(
            "6HHoqvXfNF1aQpwhn4k13CL7iyzFpjghLhG2eBG6xMVV"
        );
        let newManagerAddress = new anchor.web3.PublicKey(
            "6HHoqvXfNF1aQpwhn4k13CL7iyzFpjghLhG2eBG6xMVV"
        );
        await program.rpc.changeExecutorAuthority(newExecutorAddress, {
            accounts: {
                authority: signerWallet.publicKey,
                vaultConfig: vaultConfig,
            },
        });

        console.log("Update Emergency Wallet...");
        await program.rpc.changeEmergencyAuthority(newEmergencyAddress, {
            accounts: {
                authority: signerWallet.publicKey,
                vaultConfig: vaultConfig,
            },
        });

        console.log("Update Manager Wallet...");
        await program.rpc.changeManagerAuthority(newManagerAddress, {
            accounts: {
                authority: signerWallet.publicKey,
                vaultConfig: vaultConfig,
            },
        });

        const vaultConfigInfo = await program.account.vaultConfig.fetch(
            vaultConfig
        );

        console.log(
            "executor authority: ",
            vaultConfigInfo.executorAuthority.toString()
        );
        console.log(
            "emergency authority: ",
            vaultConfigInfo.executorAuthority.toString()
        );
        console.log(
            "manager authority: ",
            vaultConfigInfo.managerAuthority.toString()
        );
    });
});
