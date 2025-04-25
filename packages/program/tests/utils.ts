import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import {
    sendAndConfirmTransaction,
    SystemProgram,
    Transaction,
} from "@solana/web3.js";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

export const connection = provider.connection;
export const fixedPoint = parseFloat("1000000000");
export const vaultConfigSeed = "raydium_vault_config";
export const positionSeed = "raydium_position";
export const claimerInfoSeed = "raydium_claimer_info";
export const nftFaucetSeed = "raydium_vault_nft_seed";

/// USDC
const token0 = new anchor.web3.PublicKey(
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

/// Ansem
let token1 = new anchor.web3.PublicKey(
    "HAs8hvTB8ZH6dBG26KQGik4fxitNYi41jnYd49bvtime"
);

const dev_nft_address = new anchor.web3.PublicKey(
    "BmdxcFyjLtoXykcszqqEvxZApwTnD9ya3BeHUCdJ7ZP5"
);
const clmm_nft_address = new anchor.web3.PublicKey(
    "B1iyEdGyP11DBasG4FMZv5KisFqGkVzhbtqwMvm1gnQ4"
);
const cpmm_nft_address_0 = new anchor.web3.PublicKey(
    "AsWThwVGcWtPmCAPHkikLvuqQzhNxQ8eRcYk7GzDSoDo"
);
const cpmm_nft_address_1 = new anchor.web3.PublicKey(
    "EekJPuXSAP5hfcBbUQZrYfPtQGWK2FHQtYsDJAsjiVz6"
);

export const claimer_address_0 = new anchor.web3.PublicKey(
    "6HHoqvXfNF1aQpwhn4k13CL7iyzFpjghLhG2eBG6xMVV"
);

export const getNftAddress = (isDev: boolean) => {
    return isDev == false ? cpmm_nft_address_0 : dev_nft_address;
};

const devnetEndpoint = "https://api.devnet.solana.com";

export const sendSolTo = async (
    amount: any,
    signerWallet: any,
    recvWallet: anchor.web3.PublicKey
) => {
    let beforeBal = await connection.getBalance(recvWallet);
    console.log("beforeBal: ", parseFloat(beforeBal.toString()) / fixedPoint);
    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: signerWallet.publicKey,
            toPubkey: recvWallet,
            lamports: amount,
        })
    );

    try {
        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [signerWallet]
        );
        console.log("confirmed transaction with signature ", signature);
    } catch (error: any) {
        console.log("transaction failed: ", error);
    }

    let afterBal = await connection.getBalance(recvWallet);
    console.log("afterBal: ", parseFloat(afterBal.toString()) / fixedPoint);
};

export const sendTokenTo = async (
    amount: any,
    signerWallet: any,
    recvWallet: anchor.web3.PublicKey,
    tokenAddress: anchor.web3.PublicKey
) => {
    const signerTokenAccount = spl.getAssociatedTokenAddressSync(
        tokenAddress,
        signerWallet.publicKey
    );
    const bobTokenAccount = spl.getAssociatedTokenAddressSync(
        tokenAddress,
        recvWallet
    );

    let beforeSignerBal = await connection.getTokenAccountBalance(
        signerTokenAccount
    );
    let beforeBobBal = await connection.getTokenAccountBalance(bobTokenAccount);

    const transaction = new Transaction().add(
        spl.createTransferInstruction(
            signerTokenAccount,
            bobTokenAccount,
            signerWallet.publicKey,
            amount,
            [],
            spl.TOKEN_PROGRAM_ID
        )
    );
    const signature = await connection.sendTransaction(transaction, [
        signerWallet,
    ]);
    await connection.confirmTransaction(signature, "confirmed");

    let afterSignerBal = await connection.getTokenAccountBalance(
        signerTokenAccount
    );
    let afterBobBal = await connection.getTokenAccountBalance(bobTokenAccount);
};

export const isDevnet = (connection: anchor.web3.Connection): boolean => {
    return connection.rpcEndpoint == devnetEndpoint;
};

export const utils = {
    sendSolTo,
    sendTokenTo,
    isDevnet,
    getNftAddress,
    vaultConfigSeed,
    positionSeed,
    claimerInfoSeed,
    nftFaucetSeed,
    claimer_address_0,
};
