import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";
import { ProfileToken } from "./types";
import { AccountLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { SEED_BONDING_CURVE, useProgram } from "@/utils/program";
import { calculateAmountOutSell } from "../coin/[tokenId]/swap/useSwap";
import { env } from "@/utils/env";

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);

export const useTokensHeld = () => {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const program = useProgram();
  const [data, setData] = useState<ProfileToken[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!publicKey || !connection || !program) {
      return;
    }

    const fetchTokens = async () => {
      try {
        setIsLoading(true);
        setIsError(false);

        const allTokenAccounts = await connection.getTokenAccountsByOwner(
          publicKey,
          {
            programId: TOKEN_PROGRAM_ID,
          },
        );

        const tokenAccounts = allTokenAccounts.value.map(({ account }) =>
          AccountLayout.decode(account.data),
        );
        //   this can give false positives, but the alternative is to make another RPC call for every token in the list
        // TODO: update to 'auto' ending once backend is updated
        // .filter(({ mint }) => mint.toBase58().endsWith("ser"));

        // Fetch bonding curves for all tokens
        const bondingCurvePDAs = tokenAccounts.map(
          ({ mint }) =>
            PublicKey.findProgramAddressSync(
              [Buffer.from(SEED_BONDING_CURVE), mint.toBytes()],
              program.programId,
            )[0],
        );

        const bondingCurveAccounts =
          await program.account.bondingCurve.fetchMultiple(bondingCurvePDAs);

        const metadataPDAs = tokenAccounts.map(
          ({ mint }) =>
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

        const tokenData = await Promise.all(
          tokenAccounts.map(async (account, i) => {
            const metadata = metadataAccounts[i];
            // if bonding curve exists, then we know it's our token
            const isAutofunToken = bondingCurveAccounts[i];
            if (!metadata || !isAutofunToken || account.amount === BigInt(0))
              return null;

            const { name, symbol, uri } = decodeMetadata(metadata.data);
            let image: string | null = null;

            try {
              const response = await fetch(uri);
              const json = await response.json();
              image = json.image;
            } catch (error) {
              console.error(
                `Error fetching metadata for token ${name}:`,
                error,
              );
            }

            return {
              image,
              name,
              ticker: symbol,
              tokensHeld: account.amount,
              solValue:
                calculateAmountOutSell(Number(account.amount)) /
                Number(env.decimals) /
                LAMPORTS_PER_SOL,
            } satisfies ProfileToken;
          }),
        );

        setData(tokenData.filter((data): data is ProfileToken => !!data));
      } catch (error) {
        console.error("Error fetching tokens:", error);
        setIsError(true);
        setData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTokens();
    const id = connection.onAccountChange(publicKey, () => {
      fetchTokens();
    });
    return () => {
      connection.removeAccountChangeListener(id);
    };
  }, [publicKey, connection, program]);

  return { data, isLoading, isError };
};

// Helper function to decode metadata
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
    .replace(/\u0000/g, "");
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
