
import {
    AddressLookupTableAccount,
    TransactionInstruction,
    VersionedTransaction,
    Transaction,
    PublicKey,
    Connection,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    ComputeBudgetProgram,
    Keypair
} from "@solana/web3.js";

import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { Market, OpenOrders } from '@project-serum/serum';
import { raydiumProgramId } from "./constant";
import { logger } from "../logger";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Serlaunchalot } from "../target/types/serlaunchalot";
import mongoose from "mongoose";

export const connectDB = async (retries = 5, delay = 500) => {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        maxPoolSize: 10,
        minPoolSize: 5,
        retryWrites: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      console.log('Connected to MongoDB');
      return;
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`Connection attempt ${i + 1} failed. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

export const initializeConfig = async () => {
  const connection = new Connection(process.env.NETWORK === 'devnet' ? process.env.DEVNET_SOLANA_RPC_URL! : process.env.MAINNET_SOLANA_RPC_URL!);
  
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.WALLET_PRIVATE_KEY)),
    { skipValidation: true }
  );
  const payer = new NodeWallet(walletKeypair);


  logger.log("Wallet Address: ", payer.publicKey.toBase58());

  anchor.setProvider(
    new anchor.AnchorProvider(connection, payer, {
      skipPreflight: true,
      commitment: "confirmed",
    })
  );

  // Generate the program client from IDL
  const program = anchor.workspace.Serlaunchalot as Program<Serlaunchalot>;
  
  logger.log("ProgramId: ", program.programId.toBase58());
  
  return { connection, program, wallet: payer };
};

export const getAssociatedTokenAccount = (
    ownerPubkey: PublicKey,
    mintPk: PublicKey
): PublicKey => {
    let associatedTokenAccountPubkey = (PublicKey.findProgramAddressSync(
        [
            ownerPubkey.toBytes(),
            TOKEN_PROGRAM_ID.toBytes(),
            mintPk.toBytes(), // mint address
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
    ))[0];

    return associatedTokenAccountPubkey;
}

export const execTx = async (
    transaction: Transaction,
    connection: Connection,
    payer: NodeWallet,
    commitment: "confirmed" | "finalized" = 'confirmed'
) => {
    try {
        //  Sign the transaction with payer wallet
        const signedTx = await payer.signTransaction(transaction);

        // Serialize, send and confirm the transaction
        const rawTransaction = signedTx.serialize()

        logger.log(await connection.simulateTransaction(signedTx));

        const txid = await connection.sendRawTransaction(rawTransaction, {
            skipPreflight: true,
            maxRetries: 2,
            preflightCommitment: "processed"
        });

        logger.log(`https://solscan.io/tx/${txid}?cluster=custom&customUrl=${connection.rpcEndpoint}`);

        const confirmed = await connection.confirmTransaction(txid, commitment);

        if (confirmed.value.err) {
            logger.error("err ", confirmed.value.err)
        }

        return txid;
    } catch (e) {
        console.log(e);
    }
}

export async function execWithdrawTx(
  tx: Transaction,
  connection: Connection,
  wallet: NodeWallet,
  maxRetries = 1
): Promise<{ signature: string; logs: string[] }> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
      try {
          const signedTx = await wallet.signTransaction(tx);
          
          // Simulate before sending
          const simulation = await connection.simulateTransaction(signedTx);
          if (simulation.value.err) {
              throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
          }

          logger.log(simulation)
          const logs = simulation.value.logs || [];
          
          const signature = await connection.sendRawTransaction(signedTx.serialize(), {
              skipPreflight: true,
              maxRetries: 2,
              preflightCommitment: 'confirmed'
          });

          // Wait for confirmation
          const confirmation = await connection.confirmTransaction({
              signature,
              blockhash: tx.recentBlockhash,
              lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight
          }, 'confirmed');

          // Check if we got ProgramFailedToComplete but program actually succeeded
          if (confirmation.value.err === 'ProgramFailedToComplete' || 
              (confirmation.value.err && 
               JSON.stringify(confirmation.value.err).includes('ProgramFailedToComplete'))) {
              
              // Get transaction logs to verify actual execution
              const txInfo = await connection.getTransaction(signature, {
                  maxSupportedTransactionVersion: 0
              });
              
              if (txInfo?.meta?.logMessages?.some(log => 
                  log.includes(`Program success`))) {
                  logger.log('Transaction succeeded despite ProgramFailedToComplete error');
                  return { signature, logs: txInfo.meta.logMessages };
              }
          } else if (confirmation.value.err) {
              throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
          }
  
          logger.log('Transaction succeeded');
        //   logger.log('TXID:', signature)

          return { signature, logs: logs };

      } catch (error: any) {
          lastError = error;
          logger.error(`Withdrawal execution attempt ${i + 1} failed:`, error);
          
          if (!error.message?.includes('ProgramFailedToComplete') && 
              (error.message?.includes('Transaction was not confirmed') ||
               error.message?.includes('Block height exceeded'))) {
              await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, i), 15000)));
              continue;
          }
          
          throw error;
      }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

export const createAssociatedTokenAccountInstruction = (
    associatedTokenAddress: PublicKey,
    payer: PublicKey,
    walletAddress: PublicKey,
    splTokenMintAddress: PublicKey
) => {
    const keys = [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
        { pubkey: walletAddress, isSigner: false, isWritable: false },
        { pubkey: splTokenMintAddress, isSigner: false, isWritable: false },
        {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
        },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        {
            pubkey: SYSVAR_RENT_PUBKEY,
            isSigner: false,
            isWritable: false,
        },
    ];
    return new TransactionInstruction({
        keys,
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
        data: Buffer.from([]),
    });
};

export const getATokenAccountsNeedCreate = async (
    connection: Connection,
    walletAddress: PublicKey,
    owner: PublicKey,
    nfts: PublicKey[],
) => {
    const instructions = []; const destinationAccounts = [];
    for (const mint of nfts) {
        const destinationPubkey = getAssociatedTokenAccount(owner, mint);
        let response = await connection.getAccountInfo(destinationPubkey);
        if (!response) {
            const createATAIx = createAssociatedTokenAccountInstruction(
                destinationPubkey,
                walletAddress,
                owner,
                mint,
            );
            instructions.push(createATAIx);
        }
        destinationAccounts.push(destinationPubkey);
        if (walletAddress != owner) {
            const userAccount = getAssociatedTokenAccount(walletAddress, mint);
            response = await connection.getAccountInfo(userAccount);
            if (!response) {
                const createATAIx = createAssociatedTokenAccountInstruction(
                    userAccount,
                    walletAddress,
                    walletAddress,
                    mint,
                );
                instructions.push(createATAIx);
            }
        }
    }
    return {
        instructions,
        destinationAccounts,
    };
};

export function splitIntoLines(text?: string): string[] | undefined {
    if (!text) return undefined;
    return text
      .split("\n")
      .map((line) => line.trim().replace("\n", ""))
      .filter((line) => line.length > 0);
}