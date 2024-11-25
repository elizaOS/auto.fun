import {
  AgentDetailsForm,
  TokenMetadata,
  TwitterCredentials,
} from "../../types/form.type";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { womboApi } from "./fetch";
import { z } from "zod";

export async function createCoin(formData: {
  token_metadata: TokenMetadata;
  twitter_credentials: TwitterCredentials;
  agentDetails: AgentDetailsForm;
}) {
  if (!window.solana?.isPhantom) {
    throw new Error("Phantom wallet not found");
  }
  const provider = window.solana;

  await provider.connect();
  const userPublicKey = provider.publicKey;

  if (!userPublicKey) {
    throw new Error("User public key not found");
  }

  // Generate a random keypair for the token mint
  const mintKeypair = Keypair.generate();

  // call API
  const createResponse = await womboApi.post({
    endpoint: "/create-token",
    body: {
      token_metadata: formData.token_metadata,
      public_key: userPublicKey.toBase58(),
      mint_keypair_public: mintKeypair.publicKey.toBase58(),
      twitter_credentials: formData.twitter_credentials,
    },
    schema: z.object({
      transaction: z.string(),
    }),
  });

  // successfully generated transaction
  const { transaction } = createResponse;
  const tx = VersionedTransaction.deserialize(
    new Uint8Array(Buffer.from(transaction, "base64")),
  );

  // Sign the transaction with the mint keypair
  tx.sign([mintKeypair]);

  // Request the user's signature via Phantom
  const signedTx = await provider.signTransaction(tx);

  await womboApi.post({
    endpoint: "/submit-token-transaction",
    body: {
      signed_transaction: `[${signedTx.serialize().toString()}]`,
      token_metadata: formData.token_metadata,
      public_key: userPublicKey.toBase58(),
      mint_keypair_public: mintKeypair.publicKey.toBase58(),
      twitter_credentials: formData.twitter_credentials,
      agent_metadata: formData.agentDetails,
    },
  });

  return { mintPublicKey: mintKeypair.publicKey, userPublicKey };
}
