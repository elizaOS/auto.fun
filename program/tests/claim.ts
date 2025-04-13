import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import * as raydium_api from "@raydium-io/raydium-sdk-v2";
import { Program } from "@coral-xyz/anchor";
import { RaydiumVault } from "../target/types/raydium_vault";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { CREATE_CPMM_POOL_PROGRAM, Raydium } from "@raydium-io/raydium-sdk-v2";
import { Transaction } from "@solana/web3.js";
import {
    getNftAddress,
    isDevnet,
    nftFaucetSeed,
    positionSeed,
    sendTokenTo,
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

    it("Claim Rewards", async () => {
        const isDev = isDevnet(connection);
        const position_nft = getNftAddress(isDev);

        const locking_program = new anchor.web3.PublicKey(
            "LockrWmn6K5twhz3y9w1dQERbmgSaRkfnTeTKbpofwE"
        );
        const LOCK_CP_AUTH_SEED = "lock_cp_authority_seed";
        const LOCKED_CP_LIQUIDITY_SEED = "locked_liquidity";
        const CPSWAP_AUTH_SEED = Buffer.from(
            anchor.utils.bytes.utf8.encode("vault_and_lp_mint_auth_seed")
        );
        const [locked_authority] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(LOCK_CP_AUTH_SEED)],
            locking_program
        );
        const [nft_token_faucet] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(nftFaucetSeed), position_nft.toBuffer()],
            program.programId
        );
        const [vault_config] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(vaultConfigSeed)],
            program.programId
        );
        const fee_nft_owner = vault_config;
        const [locked_liquidity] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(LOCKED_CP_LIQUIDITY_SEED), position_nft.toBuffer()],
            locking_program
        );
        let fee_nft_account = nft_token_faucet;

        let cpmm_program = CREATE_CPMM_POOL_PROGRAM;
        let [cp_authority] = anchor.web3.PublicKey.findProgramAddressSync(
            [CPSWAP_AUTH_SEED],
            cpmm_program
        );
        const raydium = await Raydium.load({
            owner: signerWallet,
            connection,
            cluster: "mainnet",
            disableFeatureCheck: true,
            disableLoadToken: false,
            blockhashCommitment: "finalized",
        });
        const poolId = new anchor.web3.PublicKey(
            "CExPZUmwAdu6dDZFGQmkxM8UFu1zVkGwk3tDVHWMifR9"
        );

        const poolInfo = (
            await raydium.api.fetchPoolById({
                ids: poolId.toString(),
            })
        )[0];
        const poolInfoJson = JSON.parse(JSON.stringify(poolInfo));
        const pool_state = new anchor.web3.PublicKey(poolId.toString());
        const lp_mint = new anchor.web3.PublicKey(poolInfoJson.lpMint.address);
        const vault0_mint = new anchor.web3.PublicKey(
            poolInfo.mintA.address.toString()
        );
        const vault1_mint = new anchor.web3.PublicKey(
            poolInfo.mintB.address.toString()
        );
        const cpmm_pool_key = await raydium.cpmm.getCpmmPoolKeys(
            poolId.toString()
        );
        const token0_vault = new anchor.web3.PublicKey(
            cpmm_pool_key.vault.A.toString()
        );
        const token1_vault = new anchor.web3.PublicKey(
            cpmm_pool_key.vault.B.toString()
        );

        await spl.getOrCreateAssociatedTokenAccount(
            connection,
            signerWallet,
            vault0_mint,
            signerWallet.publicKey
        );

        await spl.getOrCreateAssociatedTokenAccount(
            connection,
            signerWallet,
            vault1_mint,
            signerWallet.publicKey
        );

        const recv_token0_account = spl.getAssociatedTokenAddressSync(
            vault0_mint,
            signerWallet.publicKey,
            true,
            spl.TOKEN_PROGRAM_ID
        );

        const recv_token1_account = spl.getAssociatedTokenAddressSync(
            vault1_mint,
            signerWallet.publicKey,
            true,
            spl.TOKEN_PROGRAM_ID
        );
        const locked_lp_vault = spl.getAssociatedTokenAddressSync(
            lp_mint,
            locked_authority,
            true,
            spl.TOKEN_PROGRAM_ID
        );
        const [user_position] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from(positionSeed), position_nft.toBuffer()],
            program.programId
        );

        await program.rpc.claim({
            accounts: {
                authority: signerWallet.publicKey,
                vaultConfig: vault_config,
                userPosition: user_position,
                lockingProgram: locking_program,
                lockedAuthority: locked_authority,
                feeNftOwner: fee_nft_owner, // move to raydium_vault contract
                feeNftAccount: fee_nft_account, // move to raydium_vault contract
                lockedLiquidity: locked_liquidity,
                cpmmProgram: cpmm_program,
                cpAuthority: cp_authority,
                poolState: pool_state,
                lpMint: lp_mint,
                recipientToken0Account: recv_token0_account, // move to raydium_vault contract
                recipientToken1Account: recv_token1_account, // move to raydium_vault contract
                token0Vault: token0_vault,
                token1Vault: token1_vault,
                vault0Mint: vault0_mint,
                vault1Mint: vault1_mint,
                lockedLpVault: locked_lp_vault,
                tokenProgram: spl.TOKEN_PROGRAM_ID,
                tokenProgram2022: spl.TOKEN_2022_PROGRAM_ID,
                memoProgram: raydium_api.MEMO_PROGRAM_ID,
            },
        });
    });
});
