import { Program } from "@coral-xyz/anchor";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Autofun } from "@autodotfun/types/types/autofun";

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
  mint: PublicKey,
  maxRetries = 5
): Promise<{ signature: string; logs: string[] }> {
  console.log(`[Withdraw] Attempt`);

  const signedTx = await wallet.signTransaction(tx);
  const simulation = await connection.simulateTransaction(signedTx);
  const preflightLogs = simulation.value.logs || [];
  if (simulation.value.err) {
    console.warn(`[Withdraw] simulation err:`, simulation.value.err);
  }

  const signature = await connection.sendRawTransaction(
    signedTx.serialize(),
    { skipPreflight: true, preflightCommitment: "confirmed", maxRetries: 3 }
  );


  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // each time, fetch latest blockhash fresh
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();

      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      if (
        confirmation.value.err &&
        JSON.stringify(confirmation.value.err).includes("ProgramFailedToComplete")
      ) {
        console.log(
          `[Withdraw] program error on confirm, attempt ${attempt + 1}`
        );

      } else if (confirmation.value.err) {

        throw new Error(
          `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
        );
      } else {
        const info = await connection.getTransaction(signature, {
          maxSupportedTransactionVersion: 0,
        });
        const onChainLogs = info?.meta?.logMessages || [];
        return {
          signature,
          logs: [...preflightLogs, ...onChainLogs],
        };
      }

      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      if (attempt === maxRetries - 1) break;
      console.warn(`[Withdraw] confirm attempt #${attempt + 1} threw:`, err);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.warn(
    `[Withdraw] all confirm attempts failed; fetching last tx for ${mint.toBase58()}`
  );
  const sigInfos = await connection.getSignaturesForAddress(mint, {
    limit: 1,
  });
  if (sigInfos.length === 0) {
    throw new Error(
      `Could not confirm tx ${signature}, and no fallback tx found for ${mint.toBase58()}`
    );
  }

  const lastSig = sigInfos[0].signature;
  const lastInfo = await connection.getTransaction(lastSig, {
    maxSupportedTransactionVersion: 0,
  });
  const backupLogs = lastInfo?.meta?.logMessages || [];
  const foundWithdraw = backupLogs.some((log) =>
    log.includes("Program log: Instruction: Withdraw")
  );
  if (!foundWithdraw) {
    throw new Error(
      `Fallback tx ${lastSig} did not include "Instruction: Withdraw" in its logs`
    );
  }
  console.log(
    `[Withdraw] using fallback signature ${lastSig}, collected ${backupLogs.length} logs`
  );

  return {
    signature: lastSig,
    logs: [...preflightLogs, ...backupLogs],
  };
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
        console.log(
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
