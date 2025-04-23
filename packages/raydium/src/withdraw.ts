import { Program } from "@coral-xyz/anchor";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Autofun } from "@autodotfun/program/types/autofun";

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


export async function execWithdrawTxSafe(
  tx: Transaction,
  connection: Connection,
  wallet: any,
  maxRetries = 5
): Promise<{ signature: string; logs: string[] }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[Withdraw] Attempt ${attempt + 1}/${maxRetries}`);

      // Step 1: Sign
      const signedTx = await wallet.signTransaction(tx);

      // Step 2: Simulate first for preflight log inspection
      const simulation = await connection.simulateTransaction(signedTx);
      const preflightLogs = simulation.value.logs || [];
      if (simulation.value.err) {
        console.error(
          `[Withdraw] Simulation failed:`,
          simulation.value.err
        );
        throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }

      // Step 3: Send
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });

      // Step 4: Confirm — retry until it lands
      const latestBlockhash = await connection.getLatestBlockhash();
      let confirmed = false;
      let finalLogs: string[] = [];

      for (let confirmAttempt = 0; confirmAttempt < 10; confirmAttempt++) {
        const txInfo = await connection.getTransaction(signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (txInfo?.meta?.err) {
          throw new Error(`Withdraw tx failed on chain: ${JSON.stringify(txInfo.meta.err)}`);
        }
        if (txInfo && txInfo.meta) {
          finalLogs = txInfo.meta.logMessages || [];
        }

        console.log(`[Withdraw] Waiting for confirmation attempt ${confirmAttempt + 1}`);
        await new Promise((r) => setTimeout(r, 2000)); // wait 2s between attempts
      }

      if (!confirmed) {
        throw new Error("Transaction not confirmed within expected window.");
      }

      console.log(`[Withdraw] Successfully confirmed ${signature}`);
      return {
        signature,
        logs: [...preflightLogs, ...finalLogs],
      };
    } catch (err: any) {
      lastError = err;
      console.error(`[Withdraw] Attempt ${attempt + 1} failed:`, err.message);

      const backoff = Math.min(1000 * 2 ** attempt, 10_000);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  throw lastError || new Error("Withdraw failed after retries");
}

export async function execWithdrawTx(
  tx: Transaction,
  connection: Connection,
  wallet: any,
  maxRetries = 1,
): Promise<{ signature: string; logs: string[] }> {
  let lastError: Error | null = null;

  try {
    const signedTx = await wallet.signTransaction(tx);

    const signature = await connection.sendRawTransaction(
      signedTx.serialize(),
      {
        skipPreflight: false,
        maxRetries: 2,
        preflightCommitment: "confirmed",
      },
    );

    if (!signature) {
      throw new Error("Transaction failed to send");
    }
    let logs;
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
        console.log(
          "Transaction succeeded despite ProgramFailedToComplete error",
        );
        logs = txInfo.meta.logMessages;
        return { signature, logs: txInfo.meta.logMessages };
      }
    } else if (confirmation.value.err) {
      throw new Error(
        `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
      );
    }

    console.log("Transaction succeeded");

    return { signature, logs: logs as unknown as string[] };
  } catch (error: any) {
    lastError = error;
    console.error(`Withdrawal execution failed:`, error);

    throw error;
  }
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
      console.log("Simulation result:", simulation);

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

      console.log("Transaction submitted with signature:", signature);
      return { signature };
    } catch (error: any) {
      lastError = error;
      console.error(`Submit withdrawal attempt ${i + 1} failed:`, error);
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
