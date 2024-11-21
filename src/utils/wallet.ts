import { TokenMetadata, TwitterCredentials } from "@/app/page";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { API_URL } from "./env";

export async function createCoin(formData: {
  token_metadata: TokenMetadata;
  twitter_credentials: TwitterCredentials;
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
  const createResponse = await fetch(`${API_URL}/api/create-token`, {
    method: "POST",
    body: JSON.stringify({
      token_metadata: formData.token_metadata,
      public_key: userPublicKey.toBase58(),
      mint_keypair_public: mintKeypair.publicKey.toBase58(),
      twitter_credentials: formData.twitter_credentials,
    }),
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!createResponse.ok) {
    throw new Error("Failed to create token");
  }

  // successfully generated transaction
  const { transaction } = await createResponse.json();
  const tx = VersionedTransaction.deserialize(
    new Uint8Array(Buffer.from(transaction, "base64")),
  );

  // Sign the transaction with the mint keypair
  tx.sign([mintKeypair]);

  // Request the user's signature via Phantom
  const signedTx = await provider.signTransaction(tx);

  const submitResponse = await fetch(
    `${API_URL}/api/submit-token-transaction`,
    {
      method: "POST",
      body: JSON.stringify({
        signed_transaction: `[${signedTx.serialize().toString()}]`,
        token_metadata: formData.token_metadata,
        public_key: userPublicKey.toBase58(),
        mint_keypair_public: mintKeypair.publicKey.toBase58(),
        twitter_credentials: formData.twitter_credentials,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  if (!submitResponse.ok) {
    throw new Error("Failed to submit token transaction");
  }

  return { mintPublicKey: mintKeypair.publicKey, userPublicKey };
}
