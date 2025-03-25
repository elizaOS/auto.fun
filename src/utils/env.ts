// Environment configuration for the application

// Default to 6 decimals for token calculations
const decimals = 6;

// Network for Solana (can be 'mainnet-beta', 'testnet', or 'devnet')
const network = import.meta.env.VITE_SOLANA_NETWORK || 'devnet';

// Solana Explorer URL based on network
const getExplorerUrl = () => {
  switch (network) {
    case 'mainnet-beta':
      return 'https://explorer.solana.com';
    case 'testnet':
      return 'https://explorer.solana.com/?cluster=testnet';
    case 'devnet':
    default:
      return 'https://explorer.solana.com/?cluster=devnet';
  }
};

// Get wallet URL for Solana Explorer
const getWalletUrl = (address: string) => {
  return `${getExplorerUrl()}/address/${address}`;
};

// Export environment utilities
export const env = {
  decimals,
  network,
  getExplorerUrl,
  getWalletUrl,
};
