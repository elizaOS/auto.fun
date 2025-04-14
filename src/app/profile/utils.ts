import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useState, useEffect, useCallback } from "react";
import { ProfileToken } from "./types";
import { AccountLayout, RawAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AccountInfo, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { SEED_BONDING_CURVE, useProgram } from "@/utils/program";
import { env } from "@/utils/env";
import { womboApi } from "@/utils/fetch";
import { z } from "zod";
import { TokenSchema } from "@/utils/tokenSchema";
import { BN } from "@coral-xyz/anchor";
import { calculateAmountOutSell } from "../coin/[tokenId]/swap/useSwap";

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
          let image: string | null = null;

          try {
            const response = await fetch(uri);
            const json = await response.json();
            image = json.image;
          } catch (error) {
            console.error(`Error fetching metadata for token ${name}:`, error);
          }

          const tokensHeld =
            tokenAccount.amount / BigInt(10) ** BigInt(env.decimals);
          const solValue =
            calculateAmountOutSell(
              bondingCurveAccount.reserveLamport.toNumber(),
              Number(tokenAccount.amount),
              6,
              1,
              bondingCurveAccount.reserveToken.toNumber(),
            ) / LAMPORTS_PER_SOL;
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
  const getTokenMetadata = useTokenMetadata();
  const getProfileTokens = useGetProfileTokens();

  const fetchTokens = useCallback(async () => {
    if (!publicKey) {
      throw new Error("user not connected to wallet");
    }

    const { tokens } = await womboApi.get({
      endpoint: `/tokens?creator=${publicKey}`,
      schema: z.object({
        tokens: z.array(TokenSchema),
      }),
    });

    const tokenAccounts = await getTokenAccounts();
    const createdTokenAccounts = tokenAccounts.filter((account) =>
      tokens.find((token) => token.mint === account.mint.toBase58()),
    );
    const autofunTokenAccounts =
      await removeNonAutofunTokens(createdTokenAccounts);

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
    publicKey,
    removeNonAutofunTokens,
  ]);

  return fetchTokens;
};

export const useProfile = () => {
  const [data, setData] = useState<{
    tokensHeld: ProfileToken[];
    tokensCreated: ProfileToken[];
  }>({ tokensHeld: [], tokensCreated: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const getOwnedTokens = useOwnedTokens();
  const getCreatedTokens = useCreatedTokens();

  const fetchProfile = useCallback(async () => {
    try {
      const tokensHeld = await getOwnedTokens();
      const tokensCreated = await getCreatedTokens();

      setData({ tokensHeld, tokensCreated });
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [getCreatedTokens, getOwnedTokens]);

  useEffect(() => {
    if (!publicKey) return;

    // update profile automatically when the user's wallet account changes
    const id = connection.onAccountChange(publicKey, fetchProfile);

    fetchProfile();

    return () => {
      connection.removeAccountChangeListener(id);
    };
  }, [connection, fetchProfile, getCreatedTokens, getOwnedTokens, publicKey]);

  return { data, isLoading, isError };
};
