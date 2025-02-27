import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";
import { ProfileToken } from "./types";
import { AccountLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { useProgram } from "@/utils/program";

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
        const tokenAccounts = allTokenAccounts.value
          .map(({ account }) => AccountLayout.decode(account.data))
          //   this can give false positives, but the alternative is to make another RPC call for every token in the list
          // TODO: update to 'auto' ending once backend is updated
          .filter(({ mint }) => mint.toBase58().endsWith("ser"));

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

        const tokenData = tokenAccounts
          .map((account, i) => {
            const metadata = metadataAccounts[i];
            if (!metadata) return null;

            const { name, symbol, uri } = decodeMetadata(metadata.data);

            return {
              image: uri,
              name,
              ticker: symbol,
              tokensHeld: account.amount,
              solValue: 0,
              // mint: account.mint.toString(),
            } satisfies ProfileToken;
          })
          .filter((data): data is ProfileToken => !!data);

        setData(tokenData);
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
