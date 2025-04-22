import { TokenMetadata } from "@/types/form.type";
import { env } from "@/utils/env";
import { Autofun, SEED_CONFIG, useProgram } from "@/utils/program";
import { launchAndSwapTx } from "@/utils/swapUtils";
import { BN, Program } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";

const useCreateTokenMutation = () => {
  return useMutation({
    mutationKey: ["createToken"],
    mutationFn: async ({
      program,
      connection,
      signTransaction,
      token_metadata,
      metadataUrl,
      mintKeypair,
    }: {
      token_metadata: TokenMetadata;
      program: Program<Autofun>;
      connection: Connection;
      signTransaction: <T extends Transaction | VersionedTransaction>(
        transaction: T,
      ) => Promise<T>;
      metadataUrl: string;
      mintKeypair: Keypair;
    }) => {
      const provider = window.solana;

      if (!provider) {
        throw new Error("No solana provider found on window");
      }

      await provider.connect();
      const userPublicKey = provider.publicKey;

      if (!userPublicKey) {
        throw new Error("User public key not found");
      }

      const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(SEED_CONFIG)],
        program.programId,
      );

      const configAccount = await program.account.config.fetch(configPda);

      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 300000,
      });

      const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 50000,
      });

      const tx =
        token_metadata.initialSol > 0
          ? await launchAndSwapTx(
              userPublicKey,
              Number(env.decimals),
              Number(env.tokenSupply),
              Number(env.virtualReserves),
              token_metadata.name,
              token_metadata.symbol,
              metadataUrl,
              token_metadata.initialSol * LAMPORTS_PER_SOL,
              100,
              connection,
              program,
              mintKeypair,
              configAccount,
            )
          : await program.methods
              .launch(
                Number(env.decimals),
                new BN(Number(env.tokenSupply)),
                new BN(Number(env.virtualReserves)),
                token_metadata.name,
                token_metadata.symbol,
                metadataUrl,
              )
              .accounts({
                creator: userPublicKey,
                token: mintKeypair.publicKey,
                teamWallet: configAccount.teamWallet,
              })
              .transaction();

      tx.instructions = [
        modifyComputeUnits,
        addPriorityFee,
        ...tx.instructions,
      ];

      tx.feePayer = userPublicKey;
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      // Sign the transaction with the mint keypair
      tx.sign(mintKeypair);

      // Request the user's signature via Phantom
      const signedTx = await signTransaction(tx);
      const txId = await connection.sendRawTransaction(signedTx.serialize(), {
        preflightCommitment: "confirmed",
        maxRetries: 5,
      });

      await connection.confirmTransaction(
        {
          signature: txId,
          blockhash,
          lastValidBlockHeight,
        },
        "confirmed",
      );

      return { mintPublicKey: mintKeypair.publicKey, userPublicKey };
    },
  });
};

export function useCreateToken() {
  const program = useProgram();
  const { connection } = useConnection();
  const mutation = useCreateTokenMutation();
  const { signTransaction } = useWallet();

  const createToken = useCallback(
    async ({
      tokenMetadata,
      metadataUrl,
      mintKeypair,
    }: {
      tokenMetadata: TokenMetadata;
      metadataUrl: string;
      mintKeypair: Keypair;
    }) => {
      if (!window.solana?.isPhantom) {
        throw new Error("Phantom wallet not found");
      }

      if (!program) {
        throw new Error("Program not found");
      }

      if (!signTransaction) {
        throw new Error("Sign transaction method not found");
      }

      return mutation.mutate({
        token_metadata: tokenMetadata,
        signTransaction,
        connection,
        program,
        metadataUrl,
        mintKeypair,
      });
    },
    [connection, mutation, program, signTransaction],
  );

  const createTokenAsync = useCallback(
    async ({
      tokenMetadata,
      metadataUrl,
      mintKeypair,
    }: {
      tokenMetadata: TokenMetadata;
      metadataUrl: string;
      mintKeypair: Keypair;
    }) => {
      if (!window.solana?.isPhantom) {
        throw new Error("Phantom wallet not found");
      }

      if (!program) {
        throw new Error("Program not found");
      }

      if (!signTransaction) {
        throw new Error("Sign transaction method not found");
      }

      return mutation.mutateAsync({
        token_metadata: tokenMetadata,
        signTransaction,
        connection,
        program,
        metadataUrl,
        mintKeypair,
      });
    },
    [connection, mutation, program, signTransaction],
  );

  return { ...mutation, mutateAsync: createTokenAsync, mutate: createToken };
}
