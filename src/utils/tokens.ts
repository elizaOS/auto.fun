import { createMutation, createQuery } from "react-query-kit";
import { womboApi } from "./fetch";
import { z } from "zod";
import { usePaginatedLiveData } from "./paginatedLiveData";
import { TokenSchema } from "./tokenSchema";
import { TokenMetadata } from "../../types/form.type";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { SEED_CONFIG, Serlaunchalot, useProgram } from "./program";
import { useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { BN, Program } from "@coral-xyz/anchor";
import { env } from "./env";

export type Token = z.infer<typeof TokenSchema>;
const HomepageTokenSchema = TokenSchema.and(
  z.object({ numComments: z.number().default(0) }),
);

export const useTokens = () => {
  return usePaginatedLiveData({
    itemsPerPage: 10,
    endpoint: "/tokens",
    validationSchema: HomepageTokenSchema,
    getUniqueId: (token) => token.mint,
    socketConfig: {
      subscribeEvent: "subscribeGlobal",
      newDataEvent: "newToken",
    },
  });
};

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
      },
    },
    schema: z.object({
      metadataUrl: z.string(),
    }),
  });
  return response.metadataUrl;
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
    program: Program<Serlaunchalot>;
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

    const tx = await program.methods
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
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    // Sign the transaction with the mint keypair
    tx.sign(mintKeypair);

    // Request the user's signature via Phantom
    const signedTx = await signTransaction(tx);

    await womboApi.post({
      endpoint: "/token",
      body: {
        signed_transaction: signedTx.serialize().toString("base64"),
        token_metadata: token_metadata,
        public_key: userPublicKey.toBase58(),
        mint_keypair_public: mintKeypair.publicKey.toBase58(),
      },
    });

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
