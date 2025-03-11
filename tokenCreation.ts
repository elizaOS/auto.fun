import {
    Request as ExpressRequest,
    Response as ExpressResponse,
  } from "express";
  import { Buffer } from "buffer";
  import { logger } from "./logger";
  import { VersionedTransaction, Connection } from "@solana/web3.js";
  import { fetchWithExponentialBackoff } from "./lib/fetch";
  import { Keypair } from "@solana/web3.js";
  import bs58 from "bs58";
  // Define the data models
  interface TwitterCredentials {
    username: string;
    password: string;
    email: string;
  }
  
  export interface TokenMetadata {
    name: string;
    symbol: string;
    image_base64: string;
    description: string;
    agent_behavior: string;
    links: {
      twitter: string | null;
      telegram: string | null;
      website: string | null;
    };
  }
  
  interface TokenRequest {
    token_metadata: TokenMetadata;
    public_key: string;
    mint_keypair_public: string;
    twitter_credentials: TwitterCredentials;
  }
  
  interface SubmitTokenRequest {
    signed_transaction: string;
    token_metadata: TokenMetadata;
    public_key: string;
    mint_keypair_public: string;
    twitter_credentials: TwitterCredentials;
  }
  
  interface MetadataResponse {
    metadataUri: string;
  }
  
  // Helper function to handle fetch responses
  async function handleFetchResponse(response: Response) {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }
  
//   export const createToken = async (
//     req: ExpressRequest & { requestId?: string },
//     res: ExpressResponse
//   ) => {
//     const AGENT_API_URL = process.env.AGENT_API_URL;
//     const PUMP_IPFS_URL = process.env.PUMP_IPFS_URL;
//     const PUMP_PORTAL_URL = process.env.PUMP_PORTAL_URL;
  
//     if (!PUMP_IPFS_URL || !PUMP_PORTAL_URL) {
//       logger.error("Environment variables not set");
//       throw new Error("Environment variables not set");
//     }
  
//     try {
//       const request: TokenRequest = req.body;
//       logger.log(`Creating token`, { requestId: req.requestId });
  
//       const formData = new FormData();
//       formData.append("name", request.token_metadata.name);
//       formData.append("symbol", request.token_metadata.symbol);
//       formData.append("description", request.token_metadata.description);
//       formData.append("showName", "true");
//       formData.append("twitter", request.token_metadata.links.twitter);
//       formData.append("telegram", request.token_metadata.links.telegram);
//       formData.append("website", request.token_metadata.links.website);
  
//       const imageData = Buffer.from(
//         request.token_metadata.image_base64.split(",")[1],
//         "base64"
//       );
//       const imageFormat = request.token_metadata.image_base64
//         .split(";")[0]
//         .split("/")[1];
//       formData.append("file", new Blob([imageData]), `image.${imageFormat}`);
  
//       const metadataResponse = await fetchWithExponentialBackoff(PUMP_IPFS_URL, {
//         method: "POST",
//         body: formData,
//       });
  
//       const metadataResponseJson = (await handleFetchResponse(
//         metadataResponse
//       )) as MetadataResponse;
//       const tokenMetadata = {
//         name: request.token_metadata.name,
//         symbol: request.token_metadata.symbol,
//         uri: metadataResponseJson.metadataUri,
//       };
  
//       const portalData = {
//         publicKey: request.public_key,
//         action: "create",
//         tokenMetadata: tokenMetadata,
//         mint: request.mint_keypair_public,
//         denominatedInSol: "true",
//         amount: 0,
//         slippage: 10,
//         priorityFee: 0.0005,
//         pool: "pump",
//       };
  
//       logger.log(
//         `Sending portal request with data: ${JSON.stringify(portalData)}`
//       );
//       const portalResponse = await fetchWithExponentialBackoff(PUMP_PORTAL_URL, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           Accept: "application/json",
//           "Accept-Encoding": "identity",
//         },
//         body: JSON.stringify(portalData),
//       });
  
//       if (
//         portalResponse.headers.get("content-type") === "application/octet-stream"
//       ) {
//         const binaryData = await portalResponse.arrayBuffer();
//         const base64Data = Buffer.from(binaryData).toString("base64");
//         return res.json({ transaction: base64Data, type: "binary" });
//       }
  
//       const portalResponseData = await handleFetchResponse(portalResponse);
//       return res.json(portalResponseData);
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ error: "Failed to create token" });
//     }
//   };
  
export const submitTokenTransaction = async (tokenData: {
    signed_transaction: string;
    token_metadata: {
      name: string;
      symbol: string;
      agent_behavior: string;
      description: string;
    };
    public_key: string;
    mint_keypair_public: string;
  }): Promise<{ signature: string; solscan_url: string }> => {
    const HELIUS_RPC = process.env.NETWORK === 'devnet' ? process.env.DEVNET_SOLANA_RPC_URL! : process.env.MAINNET_SOLANA_RPC_URL!;
  
    if (!HELIUS_RPC) {
      logger.error("Environment variables not set");
      throw new Error("Environment variables not set");
    }

    logger.log("Received signed transaction:", {
        type: typeof tokenData.signed_transaction,
        length: tokenData.signed_transaction.length,
        preview: tokenData.signed_transaction
      });
  
    let txBytes: Buffer;
    if (tokenData.signed_transaction.startsWith("[")) {
      txBytes = Buffer.from(JSON.parse(tokenData.signed_transaction));
    } else {
      txBytes = Buffer.from(tokenData.signed_transaction, "base64");
    }
  
    const tx = VersionedTransaction.deserialize(txBytes);
    const web3Connection = new Connection(HELIUS_RPC, {});
    const txSignature = await web3Connection.sendTransaction(tx, {
      preflightCommitment: "confirmed",
      maxRetries: 5,
    });
  
    if (!txSignature) {
      throw new Error("No transaction signature in response");
    }
  
    return {
      signature: txSignature,
      solscan_url: `https://solscan.io/tx/${txSignature}`,
    };
  };
  
//   export async function createTokenDirect(tokenMetadata: TokenMetadata) {
//     logger.log("Starting direct token creation", {
//       tokenName: tokenMetadata.name,
//       tokenSymbol: tokenMetadata.symbol,
//     });
  
//     const PUMP_IPFS_URL = process.env.PUMP_IPFS_URL;
//     const PUMP_PORTAL_URL = process.env.PUMP_PORTAL_URL;
//     const TOKEN_LAUNCH_PKEY = process.env.TOKEN_LAUNCH_PKEY;
//     const HELIUS_RPC = process.env.HELIUS_RPC;
  
//     if (!PUMP_IPFS_URL || !PUMP_PORTAL_URL || !TOKEN_LAUNCH_PKEY || !HELIUS_RPC) {
//       logger.error("Missing required environment variables");
//       throw new Error("Environment variables not set");
//     }
  
//     // Create keypairs
//     const wallet = Keypair.fromSecretKey(bs58.decode(TOKEN_LAUNCH_PKEY));
//     const mintKeypair = Keypair.generate();
//     logger.log("Created keypairs", {
//       walletPublicKey: wallet.publicKey.toString(),
//       mintPublicKey: mintKeypair.publicKey.toString(),
//     });
  
//     const formData = new FormData();
//     formData.append("name", tokenMetadata.name);
//     formData.append("symbol", tokenMetadata.symbol);
//     formData.append("description", tokenMetadata.description);
//     formData.append("showName", "true");
  
//     for (const [linkName, linkValue] of Object.entries(tokenMetadata.links)) {
//       if (linkValue) {
//         formData.append(linkName, linkValue);
//       }
//     }
  
//     const imageData = Buffer.from(
//       tokenMetadata.image_base64.split(",")[1],
//       "base64"
//     );
//     const imageFormat = tokenMetadata.image_base64.split(";")[0].split("/")[1];
//     formData.append("file", new Blob([imageData]), `image.${imageFormat}`);
  
//     logger.log("Uploading metadata to IPFS");
//     const metadataResponse = await fetchWithExponentialBackoff(PUMP_IPFS_URL, {
//       method: "POST",
//       body: formData,
//     });
  
//     const metadataResponseJson = (await handleFetchResponse(
//       metadataResponse
//     )) as MetadataResponse;
//     logger.log("Metadata uploaded successfully", {
//       metadataUri: metadataResponseJson.metadataUri,
//     });
  
//     const metadata = {
//       name: tokenMetadata.name,
//       symbol: tokenMetadata.symbol,
//       uri: metadataResponseJson.metadataUri,
//     };
  
//     const portalData = {
//       publicKey: wallet.publicKey.toString(),
//       action: "create",
//       tokenMetadata: metadata,
//       mint: mintKeypair.publicKey.toString(),
//       denominatedInSol: "true",
//       amount: 0,
//       slippage: 10,
//       priorityFee: 0.0005,
//       pool: "pump",
//     };
  
//     logger.log("Sending portal request", {
//       portalData: {
//         ...portalData,
//         // Exclude sensitive data
//         publicKey: wallet.publicKey.toString(),
//       },
//     });
  
//     const portalResponse = await fetchWithExponentialBackoff(PUMP_PORTAL_URL, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         Accept: "application/json",
//         "Accept-Encoding": "identity",
//       },
//       body: JSON.stringify(portalData),
//     });
  
//     if (
//       portalResponse.headers.get("content-type") === "application/octet-stream"
//     ) {
//       const binaryData = await portalResponse.arrayBuffer();
//       const transaction = VersionedTransaction.deserialize(
//         Buffer.from(binaryData)
//       );
  
//       logger.log("Transaction details before signing", {
//         numSignatures: transaction.signatures.length,
//         numRequiredSignatures: transaction.message.header.numRequiredSignatures,
//       });
  
//       // Sign the transaction
//       try {
//         transaction.sign([wallet, mintKeypair]); // Add mintKeypair as signer
//         logger.log("Transaction signed successfully", {
//           numSignatures: transaction.signatures.length,
//           signers: [
//             wallet.publicKey.toString(),
//             mintKeypair.publicKey.toString(),
//           ],
//         });
//       } catch (error) {
//         logger.error("Error signing transaction", { error });
//         throw error;
//       }
  
//       // Submit to blockchain
//       logger.log("Submitting transaction to blockchain");
//       const web3Connection = new Connection(HELIUS_RPC, {});
//       try {
//         const signature = await web3Connection.sendTransaction(transaction, {
//           preflightCommitment: "confirmed",
//           maxRetries: 5,
//         });
  
//         if (!signature) {
//           logger.error("No transaction signature received");
//           throw new Error("No transaction signature in response");
//         }
  
//         const result = {
//           mintPublicKey: mintKeypair.publicKey.toString(),
//           signature,
//           solscanUrl: `https://solscan.io/tx/${signature}`,
//         };
  
//         logger.log("Token created successfully", result);
//         return result;
//       } catch (error) {
//         logger.error("Error submitting transaction to blockchain", { error });
//         throw error;
//       }
//     }
  
//     const portalResponseData = await handleFetchResponse(portalResponse);
//     logger.error("Unexpected portal response", { response: portalResponseData });
//     throw new Error(
//       `Unexpected portal response: ${JSON.stringify(portalResponseData)}`
//     );
//   }
  