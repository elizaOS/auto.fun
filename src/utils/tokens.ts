// import { createMutation } from "react-query-kit";
// import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
// import { useConnection, useWallet } from "@solana/wallet-adapter-react";
// import { BN, Program } from "@coral-xyz/anchor";
// import { TokenMetadata } from "../types/form.type";
// import { env } from "./env";
// import { SEED_CONFIG, Serlaunchalot, useProgram } from "./program";
// import { ComputeBudgetProgram } from "@solana/web3.js";
// import { useCallback } from "react";

// const uploadImage = async (metadata: TokenMetadata) => {
//   // Determine a safe filename based on token metadata
//   const safeName = metadata.name.toLowerCase().replace(/[^a-z0-9]/g, '_');

//   // Get the image type from the data URL
//   const contentType = metadata.image_base64?.match(/^data:([A-Za-z-+/]+);base64,/)?.[1] || '';

//   // Determine file extension from content type
//   let extension = '.jpg'; // Default
//   if (contentType.includes('png')) extension = '.png';
//   else if (contentType.includes('gif')) extension = '.gif';
//   else if (contentType.includes('svg')) extension = '.svg';
//   else if (contentType.includes('webp')) extension = '.webp';

//   const filename = `${safeName}${extension}`;

//   console.log(`Uploading image as ${filename} with content type ${contentType}`);

//   const response = await fetch(import.meta.env.VITE_API_URL + "/api/upload", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify({
//       image: metadata.image_base64,
//       metadata: {
//         name: metadata.name,
//         symbol: metadata.symbol,
//         description: metadata.description,
//         twitter: metadata.links.twitter,
//         telegram: metadata.links.telegram,
//         website: metadata.links.website,
//         discord: metadata.links.discord,
//         agentLink: metadata.links.agentLink,
//       },
//     }),
//   });

//   if (!response.ok) {
//     throw new Error("Failed to upload image");
//   }

//   const data = await response.json();
//   return { metadataUrl: data.metadataUrl, imageUrl: data.imageUrl };
// };

// const waitForTokenCreation = async ({
//   mint,
//   name,
//   symbol,
//   description,
//   twitter,
//   telegram,
//   website,
//   discord,
//   agentLink,
//   imageUrl,
//   metadataUrl,
//   timeout = 80_000
// }: {
//   mint: string,
//   name: string,
//   symbol: string,
//   description: string,
//   twitter: string,
//   telegram: string,
//   website: string,
//   discord: string,
//   agentLink: string,
//   imageUrl: string,
//   metadataUrl: string,
//   timeout?: number,
// }) => {
//   return new Promise<void>(async (resolve, reject) => {
//     // Set a timeout to reject if we don't get a response
//     const timerId = setTimeout(() => {
//       reject(new Error("Token creation timed out"));
//     }, timeout);

//     try {
//       // Wait a few seconds for the transaction to be confirmed
//       await new Promise(r => setTimeout(r, 4000));

//       // First try direct token creation
//       try {
//         console.log(`Creating token record for ${mint}`);
//         const createResponse = await fetch(import.meta.env.VITE_API_URL + "/api/create-token", {
//           method: "POST",
//           headers: {
//             "Content-Type": "application/json",
//           },
//           body: JSON.stringify({
//             tokenMint: mint,
//             mint,
//             name,
//             symbol,
//             description,
//             twitter,
//             telegram,
//             website,
//             discord,
//             agentLink,
//             imageUrl,
//             metadataUrl
//           }),
//         });

//         if (!createResponse.ok) {
//           throw new Error("Failed to create token record");
//         }

//         const data = await createResponse.json();
//         if (data.success) {
//           console.log(`Token ${mint} created via direct API call`);
//           clearTimeout(timerId);
//           resolve();
//           return;
//         }
//       } catch (createError) {
//         console.error("Error creating token:", createError);
//       }

//       // If direct creation fails, try the check endpoint
//       for (let i = 0; i < 3; i++) {
//         console.log(`Checking for token ${mint}, attempt ${i + 1}`);
//         try {
//           const response = await fetch(import.meta.env.VITE_API_URL + "/api/check-token", {
//             method: "POST",
//             headers: {
//               "Content-Type": "application/json",
//             },
//             body: JSON.stringify({
//               tokenMint: mint,
//               imageUrl,
//               metadataUrl
//             }),
//           });

//           if (!response.ok) {
//             throw new Error("Failed to check token");
//           }

//           const data = await response.json();
//           if (data.tokenFound) {
//             console.log(`Token ${mint} found via check API`);
//             clearTimeout(timerId);
//             resolve();
//             break;
//           }
//         } catch (checkError) {
//           console.error(`Error checking token (attempt ${i+1}):`, checkError);
//         }

//         // Wait before trying again
//         await new Promise(r => setTimeout(r, 3000));
//       }
//     } catch (error) {
//       console.error("Error in token creation process:", error);
//       reject(error);
//     }
//   });
// };

// const useCreateTokenMutation = createMutation({
//   mutationKey: ["createToken"],
//   mutationFn: async ({
//     program,
//     connection,
//     signTransaction,
//     token_metadata,
//     createSwapIx,
//     metadataUrl,
//     imageUrl,
//   }: {
//     token_metadata: TokenMetadata;
//     program: Program<Serlaunchalot>;
//     connection: Connection;
//     signTransaction: <T extends Transaction | VersionedTransaction>(
//       transaction: T,
//     ) => Promise<T>;
//     createSwapIx: any; // Replace with proper type when available
//     metadataUrl?: string;
//     imageUrl?: string;
//   }) => {
//     const provider = window.solana;

//     if (!provider) {
//       throw new Error("No solana provider found on window");
//     }

//     await provider.connect();
//     const userPublicKey = provider.publicKey;

//     if (!userPublicKey) {
//       throw new Error("User public key not found");
//     }

//     // Generate a random keypair for the token mint
//     const mintKeypair = Keypair.generate();

//     const [configPda] = PublicKey.findProgramAddressSync(
//       [Buffer.from(SEED_CONFIG)],
//       program.programId,
//     );

//     const configAccount = await program.account.config.fetch(configPda);

//     const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
//       units: 300000,
//     });

//     const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
//       microLamports: 50000,
//     });

//     console.log("metadataUrl", metadataUrl);

//     const tx = await program.methods
//       .launch(
//         Number(env.decimals),
//         new BN(Number(env.tokenSupply)),
//         new BN(Number(env.virtualReserves)),
//         token_metadata.name,
//         token_metadata.symbol,
//         metadataUrl || "https://example.com/metadata.json",
//       )
//       .accounts({
//         creator: userPublicKey,
//         token: mintKeypair.publicKey,
//         teamWallet: configAccount.teamWallet,
//       })
//       .transaction();

//     tx.instructions = [modifyComputeUnits, addPriorityFee, ...tx.instructions];

//     console.log("tx", tx);

//     if (token_metadata.initial_sol > 0) {
//       const swapIx = await createSwapIx({
//         style: "buy",
//         amount: token_metadata.initial_sol,
//         tokenAddress: mintKeypair.publicKey.toBase58(),
//       });
//       tx.instructions.push(...(Array.isArray(swapIx) ? swapIx : [swapIx]));
//     }

//     console.log("tx", tx);

//     tx.feePayer = userPublicKey;
//     const { blockhash, lastValidBlockHeight } =
//       await connection.getLatestBlockhash();
//     tx.recentBlockhash = blockhash;

//     // Sign the transaction with the mint keypair
//     tx.sign(mintKeypair);

//     console.log("tx", tx);

//     // Request the user's signature via Phantom
//     const signedTx = await signTransaction(tx);
//     const txId = await connection.sendRawTransaction(signedTx.serialize(), {
//       preflightCommitment: "confirmed",
//       maxRetries: 5,
//     });

//     await connection.confirmTransaction(
//       {
//         signature: txId,
//         blockhash,
//         lastValidBlockHeight,
//       },
//       "confirmed",
//     );

//     console.log("mintKeypair.publicKey.toBase58()", mintKeypair.publicKey.toBase58());

//     await waitForTokenCreation({
//       mint: mintKeypair.publicKey.toBase58(),
//       name: token_metadata.name,
//       symbol: token_metadata.symbol,
//       description: token_metadata.description,
//       twitter: token_metadata.links.twitter,
//       telegram: token_metadata.links.telegram,
//       website: token_metadata.links.website,
//       discord: token_metadata.links.discord,
//       agentLink: token_metadata.links.agentLink,
//       imageUrl: imageUrl || '',
//       metadataUrl: metadataUrl || '',
//     });

//     console.log("mintKeypair.publicKey.toBase58()", mintKeypair.publicKey.toBase58());

//     return { mintPublicKey: mintKeypair.publicKey, userPublicKey };
//   },
// });

// export function useCreateToken() {
//   const program = useProgram();
//   const { connection } = useConnection();
//   const mutation = useCreateTokenMutation();
//   const { signTransaction } = useWallet();
//   const { createSwapIx } = useSwap();

//   const createToken = useCallback(
//     async (token_metadata: TokenMetadata) => {
//       if (!window.solana?.isPhantom) {
//         throw new Error("Phantom wallet not found");
//       }

//       if (!program) {
//         throw new Error("Program not found");
//       }

//       if (!signTransaction) {
//         throw new Error("Sign transaction method not found");
//       }

//       // Upload the image and metadata first
//       const { metadataUrl, imageUrl } = await uploadImage(token_metadata);
//       console.log("Uploaded metadata URL:", metadataUrl);
//       console.log("Uploaded image URL:", imageUrl);

//       return mutation.mutate({
//         token_metadata,
//         signTransaction,
//         connection,
//         program,
//         createSwapIx,
//         metadataUrl,
//         imageUrl
//       });
//     },
//     [connection, mutation, program, signTransaction, createSwapIx],
//   );

//   const createTokenAsync = useCallback(
//     async (token_metadata: TokenMetadata) => {
//       // @ts-ignore
//       if (!window.solana?.isPhantom) {
//         throw new Error("Phantom wallet not found");
//       }

//       if (!program) {
//         throw new Error("Program not found");
//       }

//       if (!signTransaction) {
//         throw new Error("Sign transaction method not found");
//       }

//       // Upload the image and metadata first
//       const { metadataUrl, imageUrl } = await uploadImage(token_metadata);
//       console.log("Uploaded metadata URL:", metadataUrl);
//       console.log("Uploaded image URL:", imageUrl);

//       return mutation.mutateAsync({
//         token_metadata,
//         signTransaction,
//         connection,
//         program,
//         createSwapIx,
//         metadataUrl,
//         imageUrl
//       });
//     },
//     [connection, mutation, program, signTransaction, createSwapIx],
//   );

//   return { ...mutation, mutateAsync: createTokenAsync, mutate: createToken };
// }
