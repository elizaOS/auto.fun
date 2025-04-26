import { IToken } from "@/types";
import { sendTxUsingJito } from "@/utils/jito";
import { SEED_BONDING_CURVE, useProgram } from "@/utils/program";
import { getJupiterSwapIx, swapIx } from "@/utils/swapUtils";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { useState } from "react";
import { toast } from "react-toastify";
import { getConfigAccount } from "./use-config-account";
import { useMevProtection } from "./use-mev-protection";
import { useSlippage } from "./use-slippage";
import { useTransactionSpeed } from "./use-transaction-speed";
import { env } from "@/utils/env";

interface SwapParams {
  style: "buy" | "sell";
  amount: number;
  tokenAddress: string;
  token?: IToken;
  reserveToken: number;
  reserveLamport: number;
}

export const useSwap = () => {
  const [isExecuting, setIsExecuting] = useState(false);

  const { connection } = useConnection();
  const wallet = useWallet();
  const program = useProgram();
  const [slippagePercentage] = useSlippage();
  const [speed] = useTransactionSpeed();
  const [isProtectionEnabled] = useMevProtection();

  const executeSwap = async ({
    style,
    amount,
    tokenAddress,
    token,
  }: Omit<SwapParams, "reserveToken" | "reserveLamport">) => {
    if (!wallet.publicKey || !wallet.signTransaction || !program) {
      throw new Error("Wallet not connected or missing required methods");
    }
    if (!token) {
      throw new Error("Token data is required for swapping.");
    }

    setIsExecuting(true);
    let signature: string | undefined;
    let ixs: any[] = [];
    let useJupiter = false;

    const slippageBps = slippagePercentage * 100;
    const amountLamports = Math.floor(amount * 1e9);
    const amountTokens = Math.floor(amount * 10 ** (token.tokenDecimals ?? 6));
    const numericStyle = style === "buy" ? 0 : 1;
    const swapAmount = style === "buy" ? amountLamports : amountTokens;

    /** If token is currently migration, or has failed or if status does not exist, we should never even get here */
    if (
      token?.status === "migrating" ||
      token?.status === "migration_failed" ||
      !token?.status
    ) {
      return;
    }

    try {
      if (
        token.imported === 1 ||
        token.status === "locked" ||
        token.status === "migrated"
      ) {
        console.log(`Swap initiated for imported/locked token: ${token.mint}`);

        useJupiter = true;
        try {
          const mainnetConnection = new Connection(
            env.rpcUrlMainnet,
            "confirmed"
          );
          const jupiterIxs = await getJupiterSwapIx(
            wallet.publicKey,
            new PublicKey(tokenAddress),
            swapAmount,
            numericStyle,
            slippageBps,
            mainnetConnection,
            token.isToken2022 === 1
          );
          ixs = jupiterIxs;
          console.log(
            `Successfully got Jupiter instructions for ${token.mint}`
          );
        } catch (jupiterError) {
          console.error(
            `Jupiter swap instruction fetch failed for ${token.mint}:`,
            jupiterError
          );
          const errorMsg =
            jupiterError instanceof Error
              ? jupiterError.message
              : String(jupiterError);
          toast.error(
            `Jupiter routing failed: ${errorMsg}. Unable to complete swap.`
          );
          throw new Error(`Jupiter swap failed: ${errorMsg}`);
        }
      } else {
        console.log(`Using internal bonding curve swap for ${token.mint}`);
        useJupiter = false;
        const [bondingCurvePda] = PublicKey.findProgramAddressSync(
          [
            Buffer.from(SEED_BONDING_CURVE),
            new PublicKey(tokenAddress).toBytes(),
          ],
          program.programId
        );
        const curve = await program.account.bondingCurve.fetch(bondingCurvePda);
        const config = await getConfigAccount(program);

        const internalIx = await swapIx(
          wallet.publicKey,
          new PublicKey(tokenAddress),
          swapAmount,
          numericStyle,
          slippageBps,
          program,
          curve.reserveToken.toNumber(),
          curve.reserveLamport.toNumber(),
          config
        );
        ixs = [internalIx];

        let solFee;
        switch (speed) {
          case "fast":
            solFee = 0.00005;
            break;
          case "turbo":
            solFee = 0.0005;
            break;
          case "ultra":
            solFee = 0.005;
            break;
          default:
            solFee = 0.00005;
        }
        const feeLamports = Math.floor(solFee * 1e9);
        ixs.push(
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: feeLamports,
          })
        );
        console.log(`Using internal swap with priority fee: ${solFee} SOL`);
      }

      if (ixs.length === 0) {
        throw new Error("No swap instructions were generated.");
      }

      const tx = new Transaction().add(...ixs);
      const { blockhash } = await connection.getLatestBlockhash();
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = blockhash;

      console.log("Simulating transaction...");
      const simulation = await connection.simulateTransaction(tx);
      if (simulation.value.err) {
        console.error("Transaction simulation failed:", simulation.value.err);
        console.error("Simulation Logs:", simulation.value.logs);
        throw new Error(
          `Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`
        );
      }
      console.log("Transaction simulation successful.");

      const versionedTx = new VersionedTransaction(tx.compileMessage());

      if (useJupiter && isProtectionEnabled) {
        console.log("Sending transaction via Jito...");
        try {
          const jitoResponse = await sendTxUsingJito({
            serializedTx: versionedTx.serialize(),
            region: "mainnet",
          });
          signature = jitoResponse.result;
          console.log(`Jito transaction sent, signature: ${signature}`);
        } catch (jitoError) {
          console.error(
            "Failed to send through Jito, falling back to standard send:",
            jitoError
          );
          signature = await wallet.sendTransaction(versionedTx, connection);
          console.log(
            `Standard transaction sent after Jito fail, signature: ${signature}`
          );
        }
      } else {
        console.log(
          `Sending standard transaction (Jupiter=${useJupiter}, Internal=${!useJupiter}, JitoEnabled=${isProtectionEnabled})...`
        );
        signature = await wallet.sendTransaction(versionedTx, connection);
        console.log(`Standard transaction sent, signature: ${signature}`);
      }

      if (signature) {
        toast.info(`Transaction sent: ${signature.slice(0, 8)}...`);
      } else {
        toast.warning(
          "Transaction potentially sent, but signature was not received."
        );
      }
    } catch (error) {
      console.error("Swap execution failed:", error);
      const errorMsg =
        error instanceof Error ? error.message : "Unknown swap error";
      if (
        !errorMsg.includes("Jupiter swap failed") &&
        !errorMsg.includes("Token-2022")
      ) {
        toast.error(`Swap failed: ${errorMsg}`);
      }
    } finally {
      setIsExecuting(false);
    }

    return { signature };
  };

  return {
    executeSwap,
    isExecuting,
  };
};
