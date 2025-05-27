import { useProgramStaking } from "@/utils/programStaking";
import { stakingSeeds } from "@/utils/stakingUtils";
import { Staking } from "@autodotfun/types/types/staking.ts";
import { BN, Program } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";

const useCreateStakingPoolMutation = () => {
  return useMutation({
    mutationKey: ["createStakingPool"],
    mutationFn: async ({
      program,
      connection,
      signTransaction,
      mint,
      rewardMint,
      duration,
    }: {
      mint: string;
      rewardMint: string;
      duration: number;
      program: Program<Staking>;
      connection: Connection;
      signTransaction: <T extends Transaction | VersionedTransaction>(
        transaction: T,
      ) => Promise<T>;
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

      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 300000,
      });

      const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 50000,
      });

      // Token Program ID = TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
      // Token 2022 Program ID = TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
      const mintPublicKey = new PublicKey(mint);
      const rewardMintPublicKey = new PublicKey(rewardMint);

      const mintAccount = await connection.getAccountInfo(mintPublicKey);
      const rewardMintAccount =
        await connection.getAccountInfo(rewardMintPublicKey);

      if (!mintAccount) throw new Error(`Mint account is ${mintAccount}`);

      if (!rewardMintAccount)
        throw new Error(`Reward mint account is ${rewardMintAccount}`);

      const mintTokenProgram = mintAccount.owner;
      const rewardMintTokenProgram = rewardMintAccount.owner;

      console.log("Mint Token Program: ", mintTokenProgram);

      const [poolAddress] = PublicKey.findProgramAddressSync(
        [
          Buffer.from(stakingSeeds.pool),
          mintPublicKey.toBuffer(),
          rewardMintPublicKey.toBuffer(),
        ],
        program.programId,
      );

      const tx = await program.methods
        .initPool(new BN(duration))
        .accounts({
          mint,
          rewardMint,
          stakingTokenProgram: mintTokenProgram,
          rewardTokenProgram: rewardMintTokenProgram,
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

      //   // Sign the transaction with the mint keypair
      //   tx.sign(mintKeypair);

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

      return {
        userPublicKey,
        poolAddress,
      };
    },
  });
};

export function useCreateStakingPool() {
  const program = useProgramStaking();
  const { connection } = useConnection();
  const mutation = useCreateStakingPoolMutation();
  const { signTransaction } = useWallet();

  const createStakingPool = useCallback(
    async ({
      mint,
      rewardMint,
      duration,
    }: {
      mint: string;
      rewardMint: string;
      duration: number;
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
        mint,
        rewardMint,
        duration,
        signTransaction,
        connection,
        program,
      });
    },
    [connection, mutation, program, signTransaction],
  );

  const createStakingPoolAsync = useCallback(
    async ({
      mint,
      rewardMint,
      duration,
    }: {
      mint: string;
      rewardMint: string;
      duration: number;
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
        mint,
        rewardMint,
        duration,
        signTransaction,
        connection,
        program,
      });
    },
    [connection, mutation, program, signTransaction],
  );

  return {
    ...mutation,
    mutateAsync: createStakingPoolAsync,
    mutate: createStakingPool,
  };
}
