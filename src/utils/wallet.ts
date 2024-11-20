import { TokenMetadata, TwitterCredentials } from "@/app/page";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";

export const getSolanaBalance = async (publicKey: string) => {
  const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");
  const key = new PublicKey(publicKey);
  const balance = await connection.getBalance(key);

  const solBalance = balance / LAMPORTS_PER_SOL;
  return solBalance;
};

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
  const response = await fetch("https://mint-coin.auto.fun/api/create-token", {
    method: "POST",
    body: JSON.stringify({
      token_metadata: formData,
      public_key: userPublicKey.toBase58(),
      mint_keypair_public: mintKeypair.publicKey.toBase58(),
    }),
    headers: {
      "Content-Type": "application/json",
    },
  });

  // successfully generated transaction
  const { transaction } = await response.json();
  const tx = VersionedTransaction.deserialize(
    new Uint8Array(Buffer.from(transaction, "base64")),
  );

  // Sign the transaction with the mint keypair
  tx.sign([mintKeypair]);

  // Request the user's signature via Phantom
  const signedTx = await provider.signTransaction(tx);

  await fetch("https://mint-coin.auto.fun/api/submit-token-transaction", {
    method: "POST",
    body: JSON.stringify({
      signed_transaction: `[${signedTx.serialize().toString()}]`,
    }),
    headers: {
      "Content-Type": "application/json",
    },
  });
}
