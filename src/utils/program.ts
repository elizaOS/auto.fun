import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

// @ts-ignore
interface Serlaunchalot extends Idl {
  version: "0.1.0";
  name: "serlaunchalot";
  instructions: [
    {
      name: "launch";
      accounts: [
        {
          name: "creator";
          isMut: true;
          isSigner: true;
        },
        {
          name: "token";
          isMut: true;
          isSigner: true;
        },
        {
          name: "teamWallet";
          isMut: true;
          isSigner: false;
        },
      ];
      args: [
        {
          name: "decimals";
          type: "u8";
        },
        {
          name: "tokenSupply";
          type: "u64";
        },
        {
          name: "virtualReserves";
          type: "u64";
        },
        {
          name: "name";
          type: "string";
        },
        {
          name: "symbol";
          type: "string";
        },
        {
          name: "metadataUrl";
          type: "string";
        },
      ];
    },
    {
      name: "swap";
      accounts: [
        {
          name: "user";
          isMut: true;
          isSigner: true;
        },
        {
          name: "token";
          isMut: true;
          isSigner: false;
        },
        {
          name: "swap";
          isMut: true;
          isSigner: false;
        },
        {
          name: "teamWallet";
          isMut: true;
          isSigner: false;
        },
      ];
      args: [
        {
          name: "isBuy";
          type: "bool";
        },
        {
          name: "amount";
          type: "u64";
        },
      ];
    },
  ];
  accounts: [
    {
      name: "config";
      type: {
        kind: "struct";
        fields: [
          {
            name: "teamWallet";
            type: "publicKey";
          },
        ];
      };
    },
    {
      name: "swap";
      type: {
        kind: "struct";
        fields: [
          {
            name: "teamWallet";
            type: "publicKey";
          },
        ];
      };
    },
  ];
  metadata: {
    name: string;
    version: string;
    spec: string;
  };
}

export function useProgram() {
  const { connection } = useConnection();

  if (!connection) {
    return null;
  }

  // Create a provider
  const provider = new AnchorProvider(
    connection,
    {
      publicKey: PublicKey.default,
      signTransaction: async (tx) => tx,
      signAllTransactions: async (txs) => txs,
    },
    { commitment: "confirmed" },
  );

  // Create and return the program'
  // @ts-ignore
  return new Program<Serlaunchalot>(
    {} as Serlaunchalot, // We'll need the actual IDL here
    new PublicKey(import.meta.env.VITE_PROGRAM_ID),
    provider,
  );
}
