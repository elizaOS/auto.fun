export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  initialSol: number;
  links: {
    twitter: string;
    telegram: string;
    farcaster: string;
    website: string;
    discord: string;
  };
  imageBase64: string | null;
  tokenMint: string;
  decimals: number;
  supply: number;
  freezeAuthority: string;
  mintAuthority: string;
}
