import { BN, Program } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { Autofun } from "../target/types/autofun";
import { logger } from "../logger";

export const withdrawTx = async (
  user: PublicKey,
  token: PublicKey,
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
  maxRetries = 1,
): Promise<{ signature: string; logs: string[] }> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const signedTx = await wallet.signTransaction(tx);

      // Simulate before sending
      const simulation = await connection.simulateTransaction(signedTx);
      if (simulation.value.err) {
        throw new Error(
          `Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`,
        );
      }

      logger.log(simulation);
      const logs = simulation.value.logs || [];

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

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash: tx.recentBlockhash!,
          lastValidBlockHeight: (await connection.getLatestBlockhash())
            .lastValidBlockHeight,
        },
        "confirmed",
      );

      // Check if we got ProgramFailedToComplete but program actually succeeded
      if (
        confirmation.value.err === "ProgramFailedToComplete" ||
        (confirmation.value.err &&
          JSON.stringify(confirmation.value.err).includes(
            "ProgramFailedToComplete",
          ))
      ) {
        // Get transaction logs to verify actual execution
        const txInfo = await connection.getTransaction(signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (
          txInfo?.meta?.logMessages?.some((log) =>
            log.includes(`Program success`),
          )
        ) {
          logger.log(
            "Transaction succeeded despite ProgramFailedToComplete error",
          );
          return { signature, logs: txInfo.meta.logMessages };
        }
      } else if (confirmation.value.err) {
        throw new Error(
          `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
        );
      }

      logger.log("Transaction succeeded");

      return { signature, logs: logs };
    } catch (error: any) {
      lastError = error;
      logger.error(`Withdrawal execution attempt ${i + 1} failed:`, error);

      if (
        !error.message?.includes("ProgramFailedToComplete") &&
        (error.message?.includes("Transaction was not confirmed") ||
          error.message?.includes("Block height exceeded"))
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(1000 * Math.pow(2, i), 15000)),
        );
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error("Max retries exceeded");
}
