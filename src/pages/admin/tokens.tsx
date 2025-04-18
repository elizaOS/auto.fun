import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";
import CopyButton from "@/components/copy-button";
import { fetcher } from "@/utils/api";
import { env } from "@/utils/env";

export default function AdminTokens() {
  const { address } = useParams();

  // If no address is provided, show the tokens list
  if (!address) {
    return <AdminTokensList />;
  }

  // Otherwise, show the token details
  return <AdminTokenDetails address={address} />;
}

function AdminTokensList() {
  // Mock data for demonstration
  const tokens = [
    { 
      id: "token1", 
      name: "Token 1", 
      ticker: "TKN1", 
      mint: "token123", 
      status: "active", 
      creator: "wallet123",
      createdAt: "2025-04-01",
      currentPrice: 0.00000123,
      tokenSupplyUiAmount: 1000000000,
      volume24h: 1234.56
    },
    { 
      id: "token2", 
      name: "Token 2", 
      ticker: "TKN2", 
      mint: "token456", 
      status: "pending", 
      creator: "wallet456",
      createdAt: "2025-04-02",
      currentPrice: 0.00000456,
      tokenSupplyUiAmount: 1000000000,
      volume24h: 789.01
    },
    { 
      id: "token3", 
      name: "Token 3", 
      ticker: "TKN3", 
      mint: "token789", 
      status: "inactive", 
      creator: "wallet789",
      createdAt: "2025-04-03",
      currentPrice: 0.00000789,
      tokenSupplyUiAmount: 1000000000,
      volume24h: 234.56
    },
  ];

  return (
    <div className="p-4 bg-autofun-background-input rounded-md">
      <h2 className="text-xl font-bold mb-4">Tokens</h2>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-autofun-background-primary">
              <th className="text-left p-2">ID</th>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Ticker</th>
              <th className="text-left p-2">Created</th>
              <th className="text-left p-2">Price (SOL)</th>
              <th className="text-left p-2">Supply</th>
              <th className="text-left p-2">Volume (24h)</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => (
              <tr key={token.id} className="border-b border-autofun-background-primary">
                <td className="p-2">{token.id}</td>
                <td className="p-2">{token.name}</td>
                <td className="p-2">{token.ticker}</td>
                <td className="p-2">{token.createdAt}</td>
                <td className="p-2">{token.currentPrice.toFixed(8)}</td>
                <td className="p-2">{token.tokenSupplyUiAmount.toLocaleString()}</td>
                <td className="p-2">{token.volume24h.toLocaleString()}</td>
                <td className="p-2">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    token.status === 'active' 
                      ? 'bg-green-900 text-green-300' 
                      : token.status === 'pending' 
                        ? 'bg-yellow-900 text-yellow-300' 
                        : 'bg-red-900 text-red-300'
                  }`}>
                    {token.status}
                  </span>
                </td>
                <td className="p-2">
                  <Link 
                    to={`/admin/tokens/${token.mint}`}
                    className="text-autofun-text-highlight hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Type definitions
type TTokenStatus =
  | "pending"
  | "active"
  | "withdrawn"
  | "migrating"
  | "migrated"
  | "locked"
  | "harvested"
  | "migration_failed";

interface Token {
  id: string;
  name: string;
  ticker: string;
  mint: string;
  creator: string;
  createdAt: string;
  status: TTokenStatus;
  tokenSupplyUiAmount: number;
  tokenDecimals: number;
  currentPrice: number;
  tokenPriceUSD: number;
  solPriceUSD: number;
  volume24h: number;
  holderCount: number;
  description: string;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  discord: string | null;
  farcaster: string | null;
  image: string;
  curveProgress: number;
  imported: number;
  marketCapUSD: number;
  reserveLamport: number;
  virtualReserves: number;
  priceChange24h: number;
}

interface SocialLinks {
  website: string;
  twitter: string;
  telegram: string;
  discord: string;
  farcaster: string;
}

function AdminTokenDetails({ address }: { address: string }) {
  // In a real application, you would fetch token data based on the address
  const [token, setToken] = useState<Token>({
    id: "token1",
    name: "Token Name",
    ticker: "TKN",
    mint: address,
    creator: "wallet123",
    createdAt: "2025-04-01",
    status: "active",
    tokenSupplyUiAmount: 1000000000,
    tokenDecimals: 6,
    currentPrice: 0.00000123,
    tokenPriceUSD: 0.000123,
    solPriceUSD: 100,
    volume24h: 1234.56,
    holderCount: 42,
    description: "This is a sample token description.",
    website: "https://example.com",
    twitter: "https://x.com/example",
    telegram: "https://t.me/example",
    discord: "https://discord.gg/example",
    farcaster: "https://warpcast.com/example",
    image: "https://example.com/image.png",
    curveProgress: 45,
    imported: 0,
    marketCapUSD: 123456,
    reserveLamport: 10,
    virtualReserves: 2,
    priceChange24h: 5.2,
  });

  // Mutation for updating token status
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      return await fetcher(`/api/token/${address}/update`, "POST", { status: newStatus });
    },
    onSuccess: () => {
      toast.success(`Token status updated successfully`);
      setToken(prev => ({ 
        ...prev, 
        status: prev.status === 'active' ? 'locked' : 'active' 
      }));
    },
    onError: (error) => {
      toast.error(`Failed to update token status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Mutation for updating token social links
  const updateSocialLinksMutation = useMutation({
    mutationFn: async (links: SocialLinks) => {
      return await fetcher(`/api/token/${address}/update`, "POST", links);
    },
    onSuccess: (data, variables) => {
      toast.success(`Token social links updated successfully`);
      setToken(prev => ({ 
        ...prev, 
        website: variables.website || null,
        twitter: variables.twitter || null,
        telegram: variables.telegram || null,
        discord: variables.discord || null,
        farcaster: variables.farcaster || null
      }));
    },
    onError: (error) => {
      toast.error(`Failed to update social links: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  const handleToggleStatus = () => {
    // Toggle between active and locked (since suspended is not in TTokenStatus)
    const newStatus = token.status === 'active' ? 'locked' : 'active';
    updateStatusMutation.mutate(newStatus);
  };

  return (
    <div className="p-4 bg-autofun-background-input rounded-md">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Token Details</h2>
        <div className="flex space-x-2">
          <Link 
            to="/admin/tokens"
            className="px-4 py-2 bg-autofun-background-primary rounded-md hover:bg-autofun-background-action-primary"
          >
            Back to Tokens
          </Link>
          <Link 
            to={`/token/${address}`}
            target="_blank"
            className="px-4 py-2 bg-autofun-background-action-primary text-autofun-text-primary rounded-md hover:bg-autofun-background-action-highlight"
          >
            View Public Page
          </Link>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="p-4 bg-autofun-background-primary rounded-md">
          <h3 className="text-lg font-medium mb-2">Token Information</h3>
          <div className="space-y-2">
            <div>
              <span className="text-autofun-text-secondary">ID:</span>
              <span className="ml-2">{token.id}</span>
            </div>
            <div>
              <span className="text-autofun-text-secondary">Name:</span>
              <span className="ml-2">{token.name}</span>
            </div>
            <div>
              <span className="text-autofun-text-secondary">Ticker:</span>
              <span className="ml-2">{token.ticker}</span>
            </div>
            <div>
              <span className="text-autofun-text-secondary">Created:</span>
              <span className="ml-2">{token.createdAt}</span>
            </div>
            <div>
              <span className="text-autofun-text-secondary">Description:</span>
              <span className="ml-2">{token.description}</span>
            </div>
            <div>
              <span className="text-autofun-text-secondary">Status:</span>
              <span className={`ml-2 px-2 py-1 rounded-full text-xs ${
                token.status === 'active' 
                  ? 'bg-green-900 text-green-300' 
                  : token.status === 'pending' 
                    ? 'bg-yellow-900 text-yellow-300' 
                    : 'bg-red-900 text-red-300'
              }`}>
                {token.status}
              </span>
            </div>
            <div>
              <span className="text-autofun-text-secondary">Imported:</span>
              <span className="ml-2">{token.imported === 1 ? "Yes" : "No"}</span>
            </div>
          </div>
        </div>
        
        <div className="p-4 bg-autofun-background-primary rounded-md">
          <h3 className="text-lg font-medium mb-2">Token Address (Mint)</h3>
          <div className="flex items-center justify-between p-2 bg-autofun-background-input rounded-md">
            <span className="font-mono text-sm truncate">{address}</span>
            <CopyButton text={address} />
          </div>
          
          <h3 className="text-lg font-medium mt-4 mb-2">Creator Address</h3>
          <div className="flex items-center justify-between p-2 bg-autofun-background-input rounded-md">
            <span className="font-mono text-sm truncate">{token.creator}</span>
            <div className="flex items-center space-x-2">
              <Link 
                to={`/admin/users/${token.creator}`}
                className="text-autofun-text-highlight hover:underline"
              >
                View
              </Link>
              <CopyButton text={token.creator} />
            </div>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="p-4 bg-autofun-background-primary rounded-md">
          <h3 className="text-lg font-medium mb-2">Supply</h3>
          <p className="text-2xl font-bold text-autofun-text-highlight">{token.tokenSupplyUiAmount.toLocaleString()}</p>
          <p className="text-xs text-autofun-text-secondary">Decimals: {token.tokenDecimals}</p>
        </div>
        
        <div className="p-4 bg-autofun-background-primary rounded-md">
          <h3 className="text-lg font-medium mb-2">Price</h3>
          <p className="text-2xl font-bold text-autofun-text-highlight">{token.currentPrice.toFixed(8)} SOL</p>
          <p className="text-xs text-autofun-text-secondary">${token.tokenPriceUSD.toFixed(6)} USD</p>
          <p className="text-xs text-autofun-text-secondary">24h Change: {token.priceChange24h > 0 ? "+" : ""}{token.priceChange24h}%</p>
        </div>
        
        <div className="p-4 bg-autofun-background-primary rounded-md">
          <h3 className="text-lg font-medium mb-2">Holders</h3>
          <p className="text-2xl font-bold text-autofun-text-highlight">{token.holderCount}</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="p-4 bg-autofun-background-primary rounded-md">
          <h3 className="text-lg font-medium mb-2">Market Cap</h3>
          <p className="text-2xl font-bold text-autofun-text-highlight">${token.marketCapUSD.toLocaleString()}</p>
        </div>
        
        <div className="p-4 bg-autofun-background-primary rounded-md">
          <h3 className="text-lg font-medium mb-2">Volume (24h)</h3>
          <p className="text-2xl font-bold text-autofun-text-highlight">{token.volume24h.toLocaleString()} SOL</p>
        </div>
        
        <div className="p-4 bg-autofun-background-primary rounded-md">
          <h3 className="text-lg font-medium mb-2">Curve Progress</h3>
          <div className="w-full bg-autofun-background-input rounded-full h-2.5 mb-2">
            <div 
              className="bg-autofun-text-highlight h-2.5 rounded-full" 
              style={{ width: `${token.curveProgress}%` }}
            ></div>
          </div>
          <p className="text-lg font-bold text-autofun-text-highlight">{token.curveProgress}%</p>
          <p className="text-xs text-autofun-text-secondary">
            Reserve: {token.reserveLamport} SOL (Virtual: {token.virtualReserves} SOL)
          </p>
        </div>
      </div>
      
      <div className="p-4 bg-autofun-background-primary rounded-md mb-4">
        <h3 className="text-lg font-medium mb-2">Social Links</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {token.website && (
            <div>
              <span className="text-autofun-text-secondary">Website:</span>
              <a 
                href={token.website} 
                target="_blank" 
                rel="noopener noreferrer"
                className="ml-2 text-autofun-text-highlight hover:underline"
              >
                {token.website}
              </a>
            </div>
          )}
          {token.twitter && (
            <div>
              <span className="text-autofun-text-secondary">Twitter:</span>
              <a 
                href={token.twitter} 
                target="_blank" 
                rel="noopener noreferrer"
                className="ml-2 text-autofun-text-highlight hover:underline"
              >
                {token.twitter.split('/').pop()}
              </a>
            </div>
          )}
          {token.telegram && (
            <div>
              <span className="text-autofun-text-secondary">Telegram:</span>
              <a 
                href={token.telegram} 
                target="_blank" 
                rel="noopener noreferrer"
                className="ml-2 text-autofun-text-highlight hover:underline"
              >
                {token.telegram.split('/').pop()}
              </a>
            </div>
          )}
          {token.discord && (
            <div>
              <span className="text-autofun-text-secondary">Discord:</span>
              <a 
                href={token.discord} 
                target="_blank" 
                rel="noopener noreferrer"
                className="ml-2 text-autofun-text-highlight hover:underline"
              >
                {token.discord.split('/').pop()}
              </a>
            </div>
          )}
          {token.farcaster && (
            <div>
              <span className="text-autofun-text-secondary">Farcaster:</span>
              <a 
                href={token.farcaster} 
                target="_blank" 
                rel="noopener noreferrer"
                className="ml-2 text-autofun-text-highlight hover:underline"
              >
                {token.farcaster.split('/').pop()}
              </a>
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-4 flex justify-end space-x-2">
        <button 
          className={`px-4 py-2 ${
            token.status === 'active' 
              ? 'bg-yellow-900 text-yellow-300 hover:bg-yellow-800' 
              : 'bg-green-900 text-green-300 hover:bg-green-800'
          } rounded-md`}
          onClick={handleToggleStatus}
          disabled={updateStatusMutation.isPending}
        >
          {updateStatusMutation.isPending 
            ? 'Processing...' 
            : token.status === 'active' 
              ? 'Lock Token' 
              : 'Activate Token'
          }
        </button>
      </div>
      
      <div className="mt-4 p-4 bg-autofun-background-primary rounded-md">
        <h3 className="text-lg font-medium mb-2">Admin Notes</h3>
        <p className="text-sm text-autofun-text-secondary italic">
          Most values on this page are read-only and are displayed for informational purposes.
          Only certain fields like social links and status can be modified by admins.
        </p>
      </div>
    </div>
  );
}
