import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Transaction,
  Keypair
} from "@solana/web3.js";
import { logger } from "../logger";
import { Autofun } from "@autodotfun/program/types";

export const withdrawTx = async (
  user: PublicKey,
  token: PublicKey,
  signer: Keypair,
  connection: Connection,
  program: Program<Autofun>,
) => {
  const tx = await program.methods
    .withdraw()
    .accounts({
      admin: user,
      tokenMint: token,
    })
    .transaction();


  tx.feePayer = user;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return tx;
};

export async function execWithdrawTx(
  tx: Transaction,
  connection: Connection,
  wallet: any,
  maxRetries = 1
): Promise<{ signature: string; logs: string[] }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // 1. Sign
      const signedTx = await wallet.signTransaction(tx);

      // // 2. Simulate
      const simulation = await connection.simulateTransaction(signedTx);
      if (simulation.value.err) {
        logger.error(
          'Transaction simulation failed:',
          simulation.value.err,
          simulation.value.logs
        );
        throw new Error(
          `Transaction simulation failed: ${JSON.stringify(
            simulation.value.err
          )}`
        );
      }
      const preflightLogs = simulation.value.logs || [];


      const signature = await connection.sendRawTransaction(
        signedTx.serialize(),
        {
          skipPreflight: false,
          maxRetries: 2,
          preflightCommitment: 'confirmed',
        }
      );


      // 4. Confirm
      const { value: confirmation } = await connection.confirmTransaction(
        {
          signature,
          blockhash: tx.recentBlockhash!,
          lastValidBlockHeight: (
            await connection.getLatestBlockhash()
          ).lastValidBlockHeight,
        },
        'confirmed'
      );
      if (!confirmation || confirmation.err) {
        logger.error('Transaction confirmation failed:', confirmation.err);
        throw new Error('Transaction confirmation failed');
      }

      // 5. If it reports ProgramFailedToComplete, verify via getTransaction
      if (
        confirmation.err === 'ProgramFailedToComplete' ||
        (confirmation.err &&
          JSON.stringify(confirmation.err).includes(
            'ProgramFailedToComplete'
          ))
      ) {
        const txInfo = await connection.getTransaction(signature, {
          maxSupportedTransactionVersion: 0,
        });
        const onChainLogs = txInfo?.meta?.logMessages || [];
        if (
          onChainLogs.some((l) => l.includes('Program success'))
        ) {
          logger.log(
            'Succeeded despite ProgramFailedToComplete; returning on‑chain logs'
          );
          return { signature, logs: onChainLogs };
        }
      } else if (confirmation.err) {
        throw new Error(
          `Transaction failed: ${JSON.stringify(confirmation.err)}`
        );
      }

      let logs: string[] = [];
      // get logs from the transaction info
      const txInfo = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (txInfo && txInfo.meta) {
        logs = txInfo.meta.logMessages || [];
      }

      // 6. Success
      logger.log('Transaction succeeded');
      return { signature, logs: [...preflightLogs, ...logs] };
    } catch (error: any) {
      lastError = error;
      logger.error(
        `Withdrawal execution attempt ${attempt + 1} failed:`,
        error
      );

      // Only retry on network/timeouts, not on program panics
      const msg = error.message || '';
      if (
        !msg.includes('SendTransactionError') &&
        (msg.includes('Transaction was not confirmed') ||
          msg.includes('Block height exceeded'))
      ) {
        const backoff = Math.min(1000 * 2 ** attempt, 15000);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      // otherwise bubble up
      throw error;
    }
  }

  throw lastError || new Error('Max retries exceeded');
}


// Submit the withdrawal transaction without waiting for full confirmation.
export async function submitWithdrawTx(
  tx: Transaction,
  connection: Connection,
  wallet: any,
  maxRetries = 1,
): Promise<{ signature: string }> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const signedTx = await wallet.signTransaction(tx);

      // Simulate the transaction first.
      const simulation = await connection.simulateTransaction(signedTx);
      if (simulation.value.err) {
        throw new Error(
          `Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`,
        );
      }
      logger.log("Simulation result:", simulation);

      const signature = await connection.sendRawTransaction(
        signedTx.serialize(),
        {
          skipPreflight: true,
          maxRetries: 2,
          preflightCommitment: "confirmed",
        },
      );

      if (!signature) {
        throw new Error("Transaction failed to send");
      }

      logger.log("Transaction submitted with signature:", signature);
      return { signature };
    } catch (error: any) {
      lastError = error;
      logger.error(`Submit withdrawal attempt ${i + 1} failed:`, error);
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(1000 * Math.pow(2, i), 15000)),
      );
    }
  }

  throw (
    lastError || new Error("Max retries exceeded while submitting withdrawal")
  );
}

// Wait for confirmation and return logs.
export async function confirmWithdrawTx(
  signature: string,
  connection: Connection,
): Promise<{ logs: string[] }> {
  const latestBlock = await connection.getLatestBlockhash();
  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlock.blockhash,
      lastValidBlockHeight: latestBlock.lastValidBlockHeight,
    },
    "confirmed",
  );

  if (confirmation.value.err) {
    throw new Error(
      `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
    );
  }

  const txInfo = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
  });

  if (!txInfo || !txInfo.meta) {
    throw new Error("Unable to fetch transaction info");
  }

  return { logs: txInfo.meta.logMessages || [] };
}
