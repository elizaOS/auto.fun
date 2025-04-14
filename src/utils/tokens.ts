import { createMutation, createQuery } from "react-query-kit";
import { womboApi } from "./fetch";
import { z } from "zod";
import { TokenSchema } from "./tokenSchema";
import { TokenMetadata } from "../../types/form.type";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { SEED_CONFIG, Autofun, useProgram } from "./program";
import { useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { BN, Program } from "@coral-xyz/anchor";
import { env } from "./env";
import { getSocket } from "./socket";

export type Token = z.infer<typeof TokenSchema>;
export const HomepageTokenSchema = TokenSchema.and(
  z.object({
    numComments: z.number().default(0),
  }),
);
export const HomepageFeaturedSchema = HomepageTokenSchema.and(
  z.object({
    featuredScore: z.number(),
  }),
);

export const useSearchTokens = createMutation({
  mutationKey: ["search-tokens"],
  mutationFn: async (search: string) => {
    const tokens = await womboApi.get({
      endpoint: `/tokens?search=${search}`,
      schema: z.object({ tokens: TokenSchema.array() }),
    });

    return tokens;
  },
});

export const useToken = createQuery({
  queryKey: ["tokens"],
  fetcher: async (mint: string) => {
    const token = await womboApi.get({
      endpoint: `/tokens/${mint}`,
      schema: TokenSchema.and(z.object({ hasAgent: z.boolean() })),
    });

    return token;
  },
});

const uploadToPinata = async (metadata: TokenMetadata) => {
  const response = await womboApi.post({
    endpoint: "/upload-pinata",
    body: {
      image: metadata.image_base64,
      metadata: {
        name: metadata.name,
        symbol: metadata.symbol,
        description: metadata.description,
        twitter: metadata.links.twitter,
        telegram: metadata.links.telegram,
        website: metadata.links.website,
        discord: metadata.links.discord,
        agentLink: metadata.links.agentLink,
      },
    },
    schema: z.object({
      metadataUrl: z.string(),
    }),
  });
  return response.metadataUrl;
};

const waitForTokenCreation = async (mint: string, timeout = 80_000) => {
  return new Promise<void>((resolve, reject) => {
    const socket = getSocket();

    const newTokenListener = (token: unknown) => {
      const { mint: newMint } = HomepageTokenSchema.parse(token);
      if (newMint === mint) {
        clearTimeout(timerId);
        socket.off("newToken", newTokenListener);
        resolve();
      }
    };

    socket.emit("subscribeGlobal");
    socket.on("newToken", newTokenListener);

    const timerId = setTimeout(() => {
      socket.off("newToken", newTokenListener);
      reject(new Error("Token creation timed out"));
    }, timeout);
  });
};

const useCreateTokenMutation = createMutation({
  mutationKey: ["createToken"],
  mutationFn: async ({
    program,
    connection,
    signTransaction,
    token_metadata,
  }: {
    token_metadata: TokenMetadata;
    program: Program<Autofun>;
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

    // Generate a random keypair for the token mint
    // TODO: now that this is on frontend, it no longer has the correct suffix of 'ser' or later 'auto'. we can add an endpoint that returns a valid mint keypair, or use the user's machine.
    const mintKeypair = Keypair.generate();

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

    const metadataUrl = await uploadToPinata(token_metadata);
    const tx =
      token_metadata.initial_sol > 0
        ? await launchAndSwapTx(
            userPublicKey,
            Number(env.decimals),
            Number(env.tokenSupply),
            Number(env.virtualReserves),
            token_metadata.name,
            token_metadata.symbol,
            metadataUrl,
            token_metadata.initial_sol * LAMPORTS_PER_SOL,
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

    tx.instructions = [modifyComputeUnits, addPriorityFee, ...tx.instructions];

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

    await waitForTokenCreation(mintKeypair.publicKey.toBase58());

    return { mintPublicKey: mintKeypair.publicKey, userPublicKey };
  },
});

export function useCreateToken() {
  const program = useProgram();
  const { connection } = useConnection();
  const mutation = useCreateTokenMutation();
  const { signTransaction } = useWallet();

  const createToken = useCallback(
    async (token_metadata: TokenMetadata) => {
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
        token_metadata,
        signTransaction,
        connection,
        program,
      });
    },
    [connection, mutation, program, signTransaction],
  );

  const createTokenAsync = useCallback(
    async (token_metadata: TokenMetadata) => {
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
        token_metadata,
        signTransaction,
        connection,
        program,
      });
    },
    [connection, mutation, program, signTransaction],
  );

  return { ...mutation, mutateAsync: createTokenAsync, mutate: createToken };
}

const launchAndSwapTx = async (
  creator: PublicKey,
  decimals: number,
  tokenSupply: number,
  virtualLamportReserves: number,
  name: string,
  symbol: string,
  uri: string,
  swapAmount: number,
  slippageBps: number = 100,
  connection: Connection,
  program: Program<Autofun>,
  mintKeypair: Keypair,
  configAccount: {
    teamWallet: PublicKey;
    initBondingCurve: number;
  },
) => {
  // Calculate deadline
  const deadline = Math.floor(Date.now() / 1000) + 120; // 2 minutes from now

  // Calculate minimum receive amount based on bonding curve formula
  // This is an estimate and should be calculated more precisely based on the bonding curve
  const initBondingCurvePercentage = configAccount.initBondingCurve;
  const initBondingCurveAmount =
    (tokenSupply * initBondingCurvePercentage) / 100;

  // Calculate expected output using constant product formula: dy = (y * dx) / (x + dx)
  // where x = reserveToken, y = reserveLamport, dx = swapAmount
  const numerator = virtualLamportReserves * swapAmount;
  const denominator = initBondingCurveAmount + swapAmount;
  const expectedOutput = Math.floor(numerator / denominator);

  // Apply slippage to expected output
  const minOutput = Math.floor(
    (expectedOutput * (10000 - slippageBps)) / 10000,
  );

  const tx = await program.methods
    .launchAndSwap(
      decimals,
      new BN(tokenSupply),
      new BN(virtualLamportReserves),
      name,
      symbol,
      uri,
      new BN(swapAmount),
      new BN(minOutput),
      new BN(deadline),
    )
    .accounts({
      teamWallet: configAccount.teamWallet,
      creator: creator,
      token: mintKeypair.publicKey,
    })
    .transaction();

  tx.feePayer = creator;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return tx;
};
