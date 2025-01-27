import { createMutation } from "react-query-kit";
import {
  AgentDetailsForm,
  AgentDetailsInput,
  AgentDetailsSchema,
} from "../../types/form.type";
import { womboApi } from "./fetch";
import {
  AgentData,
  AgentDataSchema,
  AgentSummary,
  AgentSummarySchema,
} from "../../types/components/agents/index.type";
import { createAuthenticatedQuery } from "./api/createAuthenticatedQuery";
import {
  AgentDetails,
  TokenMetadata,
  TwitterCredentials,
} from "../../types/form.type";
import { ComputeBudgetProgram, Keypair, PublicKey } from "@solana/web3.js";
import { SEED_CONFIG, useProgram } from "./program";
import { useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { z } from "zod";
import { env } from "./env";

const stripFieldWhitespace = <T extends Record<string, unknown>>(object: T) =>
  Object.entries(object).reduce((newObject, [key, value]) => {
    return {
      ...newObject,
      [key]: typeof value === "string" ? value.trim() : value,
    };
  }, {} as T);

export const useGenerateSingleAgentDetail = createMutation({
  mutationKey: ["generateSingleAgentDetail"],
  retry: 2,
  mutationFn: async ({
    inputs,
    output,
  }: {
    inputs: AgentDetailsForm;
    output: AgentDetailsInput;
  }) => {
    const result = await womboApi.post({
      endpoint: "/agent-details",
      body: {
        inputs: {
          ...inputs,
          personality: inputs.personalities,
          personalities: undefined,
        },
        requestedOutputs: [output],
      },
      schema: z.object({ [output]: z.string() }),
    });

    return stripFieldWhitespace(result)[output];
  },
});

export const useGenerateAllAdvancedAgentDetails = createMutation({
  mutationKey: ["generateAllAdvancedAgentDetails"],
  retry: 2,
  mutationFn: async ({
    inputs,
  }: {
    inputs: Pick<AgentDetailsForm, "name" | "description" | "personalities">;
  }) => {
    const requestedOutputs = [
      "systemPrompt",
      "bio",
      "lore",
      "postExamples",
      "adjectives",
      "style",
      "topics",
    ] satisfies AgentDetailsInput[];

    const result = await womboApi.post({
      endpoint: "/agent-details",
      body: {
        inputs: {
          name: inputs.name,
          personality: inputs.personalities,
          description: inputs.description,
        },
        requestedOutputs,
      },
      schema: AgentDetailsSchema.pick({
        systemPrompt: true,
        bio: true,
        lore: true,
        postExamples: true,
        adjectives: true,
        style: true,
        topics: true,
      } satisfies Record<
        (typeof requestedOutputs)[number],
        boolean
      >).required(),
    });

    return stripFieldWhitespace(result);
  },
});

export const useGenerateAgentDetails = createMutation({
  mutationKey: ["generateAgentDetails"],
  retry: 2,
  mutationFn: async ({ inputs }: { inputs: AgentDetailsForm }) => {
    const allFields = [
      "systemPrompt",
      "bio",
      "lore",
      "postExamples",
      "adjectives",
      "style",
      "topics",
    ] satisfies AgentDetailsInput[];

    const requestedOutputs = allFields.filter(
      (field) => !inputs[field] || inputs[field].trim() === "",
    ) as AgentDetailsInput[];

    if (requestedOutputs.length === 0) {
      return inputs;
    }

    const result = await womboApi.post({
      endpoint: "/agent-details",
      body: {
        inputs,
        requestedOutputs,
      },
      schema: AgentDetailsSchema.pick(
        Object.fromEntries(
          requestedOutputs.map((field) => [field, true]),
        ) as Record<(typeof requestedOutputs)[number], true>,
      ).required(),
    });

    return {
      ...inputs,
      ...stripFieldWhitespace(result),
    };
  },
});

export const useAgentData = createAuthenticatedQuery<
  AgentData,
  Pick<AgentData, "_id">
>({
  queryKey: ["agentData"],
  fetcher: async ({ _id }) => {
    const result = await womboApi.get({
      endpoint: `/agents/${_id}`,
      schema: AgentDataSchema,
    });

    return result;
  },
});

export const useAgents = createAuthenticatedQuery<AgentSummary[]>({
  queryKey: ["agents"],
  fetcher: async () => {
    const result = await womboApi.get({
      endpoint: `/agents`,
      schema: z.array(AgentSummarySchema),
    });

    return result;
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

export function useCreateAgent() {
  const program = useProgram();
  const { connection } = useConnection();

  const { signTransaction } = useWallet();

  return useCallback(
    async (formData: {
      token_metadata: TokenMetadata;
      twitter_credentials: TwitterCredentials;
      agentDetails: AgentDetails;
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

      const provider = window.solana;

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

      const metadataUrl = await uploadToPinata(formData.token_metadata);

      const tx = await program.methods
        .launch(
          Number(env.decimals),
          new BN(Number(env.tokenSupply)),
          new BN(Number(env.virtualReserves)),
          formData.token_metadata.name,
          formData.token_metadata.symbol,
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
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      // Sign the transaction with the mint keypair
      tx.sign(mintKeypair);

      // Request the user's signature via Phantom
      const signedTx = await signTransaction(tx);

      await womboApi.post({
        endpoint: "/agents",
        body: {
          signed_transaction: signedTx.serialize().toString("base64"),
          token_metadata: formData.token_metadata,
          public_key: userPublicKey.toBase58(),
          mint_keypair_public: mintKeypair.publicKey.toBase58(),
          twitter_credentials: formData.twitter_credentials,
          agent_metadata: formData.agentDetails,
        },
      });

      return { mintPublicKey: mintKeypair.publicKey, userPublicKey };
    },
    [connection, program, signTransaction],
  );
}
