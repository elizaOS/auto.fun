export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  initialSol: number;
  links: {
    twitter: string;
    telegram: string;
    website: string;
    discord: string;
    agentLink: string;
  };
  imageBase64: string | null;
  tokenMint: string;
  decimals: number;
  supply: number;
  freezeAuthority: string;
  mintAuthority: string;
} 