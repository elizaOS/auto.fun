import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useState, useEffect, useCallback } from "react";
import { ProfileToken } from "../types/profileTypes";
import { AccountLayout, RawAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AccountInfo, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { SEED_BONDING_CURVE, useProgram } from "./program";
import { env } from "./env";
import { BN } from "@coral-xyz/anchor";
import { calculateAmountOutSell } from "./swapUtils";
import { getToken } from "./api";
import { IToken } from "@/types";

// --- Types for User Profile Data ---
export interface UserProfileData {
  id: string;
  address: string;
  displayName: string;
  profilePictureUrl: string | null;
  points: number;
  rewardPoints: number;
  createdAt: string;
  suspended: number;
}

export interface ProfileApiResponse {
  user: UserProfileData;
  transactions: any[];
  tokensCreated: ProfileToken[];
}
// --- End Types ---

// TODO: update after mainnet launch
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);

const useTokenAccounts = () => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  return useCallback(async () => {
    if (!publicKey || !connection) {
      throw new Error("missing public key or rpc connection");
    }

    const allTokenAccounts = await connection.getTokenAccountsByOwner(
      publicKey,
      {
        programId: TOKEN_PROGRAM_ID,
      },
    );

    const tokenAccounts = allTokenAccounts.value.map(({ account }) =>
      AccountLayout.decode(account.data),
    );

    return tokenAccounts;
  }, [connection, publicKey]);
};

type Account = {
  tokenAccount: RawAccount;
  bondingCurveAccount: {
    tokenMint: PublicKey;
    creator: PublicKey;
    initLamport: BN;
    reserveLamport: BN;
    reserveToken: BN;
    curveLimit: BN;
    isCompleted: boolean;
  };
};

const useRemoveNonAutofunTokens = () => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const program = useProgram();

  return useCallback(
    async (tokenAccounts: RawAccount[]) => {
      if (!publicKey || !connection || !program) {
        throw new Error("missing public key, rpc connection, or program");
      }

      const bondingCurvePDAs = tokenAccounts.map(
        ({ mint }) =>
          PublicKey.findProgramAddressSync(
            [Buffer.from(SEED_BONDING_CURVE), mint.toBytes()],
            program.programId,
          )[0],
      );

      const bondingCurveAccounts =
        await program.account.bondingCurve.fetchMultiple(bondingCurvePDAs);

      return tokenAccounts
        .map((tokenAccount, index) => ({
          tokenAccount,
          bondingCurveAccount: bondingCurveAccounts[index],
        }))
        .filter(
          (accounts): accounts is Account => !!accounts.bondingCurveAccount,
        );
    },
    [connection, program, publicKey],
  );
};

const useTokenMetadata = () => {
  const { connection } = useConnection();

  return useCallback(
    async (accounts: Account[]) => {
      const metadataPDAs = accounts.map(
        ({ tokenAccount: { mint } }) =>
          PublicKey.findProgramAddressSync(
            [
              Buffer.from("metadata"),
              TOKEN_METADATA_PROGRAM_ID.toBuffer(),
              mint.toBuffer(),
            ],
            TOKEN_METADATA_PROGRAM_ID,
          )[0],
      );

      const metadataAccounts =
        await connection.getMultipleAccountsInfo(metadataPDAs);

      return metadataAccounts;
    },
    [connection],
  );
};

const decodeMetadata = (
  buffer: Buffer,
): { name: string; symbol: string; uri: string } => {
  // Skip key, update authority, mint, and name length prefix
  let offset = 1 + 32 + 32 + 4;

  // Read name
  const nameLength = buffer.readUInt32LE(offset - 4);
  const name = buffer
    .subarray(offset, offset + nameLength)
    .toString()
    .replace(/\u0000/g, ""); // remove null characters
  offset += nameLength;

  // Read symbol length and symbol
  const symbolLength = buffer.readUInt32LE(offset);
  offset += 4;
  const symbol = buffer
    .subarray(offset, offset + symbolLength)
    .toString()
    .replace(/\u0000/g, "");
  offset += symbolLength;

  // Read uri length and uri
  const uriLength = buffer.readUInt32LE(offset);
  offset += 4;
  const uri = buffer
    .subarray(offset, offset + uriLength)
    .toString()
    .replace(/\u0000/g, "");

  return { name, symbol, uri };
};

type MetadataAccount = AccountInfo<Buffer>;

const useGetProfileTokens = () => {
  const getProfileTokens = useCallback(
    async (
      accounts: Account[],
      metadataAccounts: (MetadataAccount | null)[],
    ) => {
      const profileTokens = await Promise.all(
        accounts.map(async ({ tokenAccount, bondingCurveAccount }, i) => {
          const metadata = metadataAccounts[i];
          if (!metadata) return null;

          const { name, symbol, uri } = decodeMetadata(metadata.data);

          // Skip if URI is not HTTPS
          if (!uri.startsWith("https://")) {
            console.warn(
              `Skipping non-HTTPS metadata URI for token ${name}: ${uri}`,
            );
            return null;
          }

          let image: string | null = null;
          try {
            // Add timeout to fetch request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

            const response = await fetch(uri, {
              signal: controller.signal,
            }).finally(() => clearTimeout(timeoutId));

            if (!response.ok) {
              if (response.status === 404) {
                console.warn(`Metadata not found for token ${name} at ${uri}`);
                return null;
              }
              console.warn(
                `Failed to fetch metadata for token ${name}: ${response.status}`,
              );
              return null;
            }

            const json = (await response.json()) as Record<string, unknown>;
            if (
              typeof json === "object" &&
              json !== null &&
              "image" in json &&
              typeof json.image === "string"
            ) {
              image = json.image;
            }
          } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
              console.warn(
                `Metadata fetch timed out for token ${name} at ${uri}`,
              );
            } else {
              console.warn(`Error fetching metadata for token ${name}:`, error);
            }
            return null;
          }

          const tokensHeld =
            tokenAccount.amount / BigInt(10) ** BigInt(env.decimals);

          let solValue: number;

          if (bondingCurveAccount.isCompleted) {
            const mint = bondingCurveAccount.tokenMint.toString();
            const tokenData = (await getToken({ address: mint })) as IToken;
            const tokenPriceUSD =
              tokenData.marketCapUSD / tokenData.tokenSupplyUiAmount;
            const priceSOL = tokenPriceUSD / tokenData.solPriceUSD;
            solValue = Number(tokensHeld.toString()) * priceSOL;
          } else {
            solValue =
              calculateAmountOutSell(
                bondingCurveAccount.reserveLamport.toNumber(),
                Number(tokenAccount.amount),
                6,
                1,
                bondingCurveAccount.reserveToken.toNumber(),
              ) / LAMPORTS_PER_SOL;
          }

          return {
            image,
            name,
            ticker: symbol,
            tokensHeld,
            solValue,
            mint: tokenAccount.mint.toBase58(),
          } satisfies ProfileToken;
        }),
      );

      return profileTokens.filter((data): data is ProfileToken => !!data);
    },
    [],
  );

  return getProfileTokens;
};

const useOwnedTokens = () => {
  const getTokenAccounts = useTokenAccounts();
  const removeNonAutofunTokens = useRemoveNonAutofunTokens();
  const getTokenMetadata = useTokenMetadata();
  const getProfileTokens = useGetProfileTokens();

  const fetchTokens = useCallback(async () => {
    const tokenAccounts = await getTokenAccounts();
    const ownedTokenAccounts = tokenAccounts.filter(
      (account) => account.amount > 0,
    );
    const autofunTokenAccounts =
      await removeNonAutofunTokens(ownedTokenAccounts);

    const metadataAccounts = await getTokenMetadata(autofunTokenAccounts);

    const profileTokens = await getProfileTokens(
      autofunTokenAccounts,
      metadataAccounts,
    );

    return profileTokens;
  }, [
    getProfileTokens,
    getTokenAccounts,
    getTokenMetadata,
    removeNonAutofunTokens,
  ]);

  return fetchTokens;
};

const useCreatedTokens = () => {
  const { publicKey } = useWallet();

  const getTokenAccounts = useTokenAccounts();
  const removeNonAutofunTokens = useRemoveNonAutofunTokens();
  const fetchTokens = useCallback(async (): Promise<ProfileToken[]> => {
    if (!publicKey) {
      throw new Error("user not connected to wallet");
    }

    // === 1) Build headers ===
    const authToken = localStorage.getItem("authToken");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(authToken
        ? { Authorization: `Bearer ${JSON.parse(authToken)}` }
        : {}),
    };

    // === 2) Fetch the raw tokens list ===
    const response = await fetch(`${env.apiUrl}/api/creator-tokens`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ creator: publicKey.toBase58() }),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    const { tokens } = (await response.json()) as {
      tokens: Array<{
        id: string;
        name: string;
        ticker: string;
        image: string | null;
        mint: string;
        tokenDecimals: number;
      }>;
    };

    // === 3) Pull your on‐chain token accounts **once** ===
    const tokenAccounts = await getTokenAccounts();
    const autofunTokenAccounts = await removeNonAutofunTokens(tokenAccounts);
    // === 4) Map into ProfileToken[] ===
    const profileTokens: ProfileToken[] = tokens.map((t) => {
      // const mint = t.mint; // Extract mint property
      // parse the mint
      const mintPubkey = new PublicKey(t.mint);

      // find the account with this mint (if any)
      const account = tokenAccounts.find((acct) =>
        acct.mint.equals(mintPubkey),
      );

      const reserveLamport =
        autofunTokenAccounts
          .find((acct) => acct.tokenAccount.mint.equals(mintPubkey))
          ?.bondingCurveAccount.reserveLamport.toNumber() ?? 0;
      const solValue = account?.amount
        ? calculateAmountOutSell(
            reserveLamport,
            Number(account?.amount ?? 0),
            6,
            1,
            autofunTokenAccounts
              .find((acct) => acct.tokenAccount.mint.equals(mintPubkey))
              ?.bondingCurveAccount.reserveToken.toNumber() ?? 0,
          ) / LAMPORTS_PER_SOL
        : 0;

      return {
        image: t.image,
        name: t.name,
        ticker: t.ticker,
        mint: t.mint,
        // safe‐cast the amount or fall back to zero
        tokensHeld: account?.amount
          ? BigInt(account?.amount) / BigInt(10 ** t.tokenDecimals)
          : BigInt(0),
        solValue: solValue,
      };
    });

    return profileTokens;
  }, [publicKey, env.apiUrl, getTokenAccounts, removeNonAutofunTokens]);

  return fetchTokens;
};

// --- New Hook: useUserProfile ---
// Fetches public user data (info, created tokens) for a given address
export const useUserProfile = (address: string | undefined | null) => {
  const [profileData, setProfileData] = useState<ProfileApiResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchUserProfile = useCallback(async () => {
    if (!address) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${env.apiUrl}/api/users/${address}`);

      if (!response.ok) {
        // Log the status text before throwing
        const statusText = response.statusText;
        console.error(
          `API Error (${response.status}): ${statusText} for ${address}`,
        );
        throw new Error(`Failed to fetch user profile: ${statusText}`);
      }

      const data = (await response.json()) as ProfileApiResponse;
      console.log(
        `[useUserProfile] Raw data received for ${address}:`,
        JSON.stringify(data),
      );
      if (!data.user) {
        console.warn(
          `[useUserProfile] User object is null or missing in API response for ${address}`,
        );
      }
      setProfileData(data);
    } catch (err) {
      console.error("[useUserProfile] Error fetching user profile:", err);
      setError(
        err instanceof Error
          ? err
          : new Error("Unknown error fetching user profile"),
      );
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchUserProfile();
  }, [fetchUserProfile]);

  return {
    profileData,
    isLoading,
    error,
    refetch: fetchUserProfile,
  };
};
// --- End useUserProfile Hook ---

export const useProfile = () => {
  const [data, setData] = useState<{
    user: UserProfileData | null;
    tokensHeld: ProfileToken[];
    tokensCreated: ProfileToken[];
  }>({ user: null, tokensHeld: [], tokensCreated: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const walletAddress = publicKey?.toBase58();

  // Use our new hook to fetch user profile data
  const {
    profileData,
    isLoading: isLoadingProfile,
    error: profileError,
    refetch: refetchProfile,
  } = useUserProfile(walletAddress);

  const getOwnedTokens = useOwnedTokens();

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    setIsError(false);

    let tokensHeld: ProfileToken[] = [];

    try {
      tokensHeld = await getOwnedTokens();
    } catch (err) {
      console.error("getOwnedTokens failed:", err);
    }

    // Get tokensCreated from the profileData
    const tokensCreated = profileData?.tokensCreated || [];
    const user = profileData?.user || null;

    // always update the state even if one fails
    setData({ user, tokensHeld, tokensCreated });
    setIsLoading(false);
  }, [getOwnedTokens, profileData]);

  useEffect(() => {
    if (!publicKey) {
      setData({ user: null, tokensHeld: [], tokensCreated: [] });
      setIsLoading(false);
      return;
    }

    // update profile automatically when the user's wallet account changes
    const id = connection.onAccountChange(publicKey, () => {
      refetchProfile();
      fetchProfile();
    });

    fetchProfile();

    return () => {
      connection.removeAccountChangeListener(id);
    };
  }, [connection, fetchProfile, publicKey, refetchProfile]);

  // Combine loading states
  const combinedIsLoading = isLoading || isLoadingProfile;
  // Set error if either operation fails
  const combinedIsError = isError || !!profileError;

  return {
    data,
    isLoading: combinedIsLoading,
    isError: combinedIsError,
    refetch: refetchProfile,
  };
};

// Function to update user profile
export const updateUserProfile = async (
  displayName?: string,
  profilePictureUrl?: string | null,
) => {
  const authToken = localStorage.getItem("authToken");
  if (!authToken) {
    throw new Error("Authentication required to update profile");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${JSON.parse(authToken)}`,
  };

  const response = await fetch(`${env.apiUrl}/api/users/profile`, {
    method: "PUT",
    headers,
    credentials: "include",
    body: JSON.stringify({
      displayName,
      profilePictureUrl,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to update profile");
  }

  return await response.json();
};

// Function to upload a new profile picture
export const uploadProfilePicture = async (
  file: File,
): Promise<UserProfileData> => {
  const authToken = localStorage.getItem("authToken");
  if (!authToken) {
    throw new Error("Authentication required to upload profile picture");
  }

  // Basic client-side validation (optional, as backend also validates)
  if (!file.type.startsWith("image/")) {
    throw new Error("Invalid file type. Please select an image.");
  }
  if (file.size > 5 * 1024 * 1024) {
    // 5MB limit
    throw new Error("Image file size exceeds 5MB limit.");
  }

  const formData = new FormData();
  formData.append("profilePicture", file); // Key must match backend expectation

  const headers: Record<string, string> = {
    // Content-Type is set automatically by browser for FormData
    Authorization: `Bearer ${JSON.parse(authToken)}`,
  };

  const response = await fetch(`${env.apiUrl}/api/users/profile/picture`, {
    method: "POST",
    headers,
    credentials: "include",
    body: formData,
  });

  const responseData = await response.json();

  if (!response.ok) {
    throw new Error(responseData.error || "Failed to upload profile picture");
  }

  if (!responseData.user) {
    throw new Error("API response did not include updated user profile.");
  }

  // Return the updated user data from the response
  return responseData.user as UserProfileData;
};

// Function to trigger profile picture generation (placeholder)
export const generateProfilePicture = async (): Promise<UserProfileData> => {
  const authToken = localStorage.getItem("authToken");
  if (!authToken) {
    throw new Error("Authentication required to generate profile picture");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${JSON.parse(authToken)}`,
  };

  const response = await fetch(
    `${env.apiUrl}/api/users/profile/picture/generate`,
    {
      method: "POST",
      headers,
      credentials: "include",
      // body: JSON.stringify({ prompt: "Optional prompt here" }) // Optional: Add if backend supports it
    },
  );

  const responseData = await response.json();

  if (!response.ok) {
    throw new Error(responseData.error || "Failed to generate profile picture");
  }

  if (!responseData.user) {
    throw new Error(
      "API response did not include updated user profile after generation.",
    );
  }

  return responseData.user as UserProfileData;
};
