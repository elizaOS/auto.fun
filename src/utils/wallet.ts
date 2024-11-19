import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export const getSolanaBalance = async (publicKey: string) => {
  const balance = await window.solana.request({
    method: "getBalance",
    params: [publicKey],
  });

  const solBalance = balance / LAMPORTS_PER_SOL;
  return solBalance;
};
