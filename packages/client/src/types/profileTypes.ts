export type ProfileToken = {
  image: string | null;
  name: string;
  ticker: string;
  tokensHeld: bigint;
  solValue: number;
  dollarValue?: number;
  mint: string;
};
