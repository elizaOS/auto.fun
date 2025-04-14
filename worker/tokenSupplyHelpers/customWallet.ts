import { Keypair, PublicKey } from "@solana/web3.js";

interface CustomWallet {
  publicKey: PublicKey;
  signTransaction: (tx: any) => Promise<any>;
  signAllTransactions: (txs: any[]) => Promise<any[]>;
  payer: Keypair;
}

export class Wallet implements CustomWallet {
  public payer: Keypair;
  constructor(private keypair: Keypair) {
    this.payer = keypair;
  }

  get publicKey() {
    return this.keypair.publicKey;
  }

  async signTransaction(tx: any) {
    tx.partialSign(this.keypair);
    return tx;
  }

  async signAllTransactions(txs: any[]) {
    for (const tx of txs) {
      tx.partialSign(this.keypair);
    }
    return txs;
  }
}
