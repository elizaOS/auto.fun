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

  const createSwapIx = async ({
    style,
    amount,
    tokenAddress,
    token,
    reserveToken,
    reserveLamport,
  }: SwapParams) => {
    if (!program || !wallet.publicKey) {
      throw new Error("Wallet not connected or missing required methods");
    }

    // Convert percentage to basis points (1% = 100 bps)
    const slippageBps = slippagePercentage * 100;

    // Convert SOL to lamports (1 SOL = 1e9 lamports)
    const amountLamports = Math.floor(amount * 1e9);
    const amountTokens = Math.floor(
      amount * (token?.tokenDecimals ? 10 ** token.tokenDecimals : 1e6),
    );

    // Convert string style ("buy" or "sell") to numeric style (0 for buy; 1 for sell)
    const numericStyle = style === "buy" ? 0 : 1;

    const ixs = [];
    if (token?.status === "locked") {
      const mainnetConnection = new Connection(env.rpcUrlMainnet, "confirmed"); // this is always mainnet
      // Use Jupiter API when tokens are locked
      const ixsJupiterSwap = await getJupiterSwapIx(
        wallet.publicKey,
        new PublicKey(tokenAddress),
        style === "buy" ? amountLamports : amountTokens,
        numericStyle,
        slippageBps,
        mainnetConnection,
      );

      ixs.push(...ixsJupiterSwap);
    } else {
      // Use the internal swap function otherwise
      const ix = await swapIx(
        wallet.publicKey,
        new PublicKey(tokenAddress),
        style === "buy" ? amountLamports : amountTokens,
        numericStyle,
        slippageBps,
        program,
        reserveToken,
        reserveLamport,
        await getConfigAccount(program),
      );

      ixs.push(ix);
    }

    // Define SOL fee amounts based on speed
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
    // Convert SOL fee to lamports (1 SOL = 1e9 lamports)
    const feeLamports = Math.floor(solFee * 1e9);

    // Create a transaction instruction to apply the fee
    const feeInstruction = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: feeLamports,
    });

    ixs.push(feeInstruction);

    return ixs;
  };

  const executeSwap = async ({
    style,
    amount,
    tokenAddress,
    token,
  }: Omit<SwapParams, "reserveToken" | "reserveLamport">) => {
    if (!wallet.publicKey || !wallet.signTransaction || !program) {
      throw new Error("Wallet not connected or missing required methods");
    }
    let curve;
    if (token?.status !== "locked") {
      const [bondingCurvePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from(SEED_BONDING_CURVE),
          new PublicKey(tokenAddress).toBytes(),
        ],
        program.programId,
      );
      curve = await program.account.bondingCurve.fetch(bondingCurvePda);
    }

    const ixs = await createSwapIx({
      style,
      amount,
      tokenAddress,
      reserveLamport: curve ? curve.reserveLamport.toNumber() : 0,
      reserveToken: curve ? curve.reserveToken.toNumber() : 0,
      token,
    });

    const tx = new Transaction().add(...(Array.isArray(ixs) ? ixs : [ixs]));
    const { blockhash } = await connection.getLatestBlockhash();
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = blockhash;

    // TODO - @deprecated — Instead, call simulateTransaction with * VersionedTransaction and SimulateTransactionConfig parameters
    const simulation = await connection.simulateTransaction(tx);

    if (simulation.value.err) {
      throw new Error(
        `Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`,
      );
    }

    const versionedTx = new VersionedTransaction(tx.compileMessage());

    // If protection is enabled, use Jito to send the transaction
    if (isProtectionEnabled) {
      try {
        const jitoResponse = await sendTxUsingJito({
          serializedTx: versionedTx.serialize(),
          region: "mainnet",
        });
        return { signature: jitoResponse.result, confirmation: null };
      } catch (error) {
        console.error("Failed to send through Jito:", error);
        const signature = await wallet.sendTransaction(versionedTx, connection);
        return { signature, confirmation: null };
      }
    }

    const signature = await wallet.sendTransaction(versionedTx, connection);
    return { signature, confirmation: null };
  };

  return {
    executeSwap: async (...params: Parameters<typeof executeSwap>) => {
      let signature: string | undefined;
      try {
        setIsExecuting(true);
        const res = await executeSwap(...params);
        signature = res.signature;
        if (signature) {
          toast.info(`Transaction sent: ${signature.slice(0, 8)}...`);
        } else {
          toast.warning(
            "Transaction potentially sent, but signature was not received.",
          );
        }
      } finally {
        setIsExecuting(false);
      }
      return { signature };
    },
    isExecuting,
  };
};
