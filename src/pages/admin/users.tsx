import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";
import CopyButton from "@/components/copy-button";
import { env } from "@/utils/env";
import { fetcher } from "@/utils/api";

export default function AdminUsers() {
  const { address } = useParams();

  // If no address is provided, show the users list
  if (!address) {
    return <AdminUsersList />;
  }

  // Otherwise, show the user details
  return <AdminUserDetails address={address} />;
}

function AdminUsersList() {
  // Mock data for demonstration
  const users = [
    { 
      id: "user1", 
      name: "User 1", 
      address: "wallet123", 
      createdAt: "2025-04-01", 
      tokensCreated: 3,
      tokensHeld: 5,
      totalVolume: 1234.56,
      status: "active"
    },
    { 
      id: "user2", 
      name: "User 2", 
      address: "wallet456", 
      createdAt: "2025-04-02", 
      tokensCreated: 1,
      tokensHeld: 10,
      totalVolume: 789.01,
      status: "active"
    },
    { 
      id: "user3", 
      name: "User 3", 
      address: "wallet789", 
      createdAt: "2025-04-03", 
      tokensCreated: 0,
      tokensHeld: 2,
      totalVolume: 234.56,
      status: "suspended"
    },
  ];

  return (
    <div className="p-4 bg-autofun-background-input rounded-md">
      <h2 className="text-xl font-bold mb-4">Users</h2>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-autofun-background-primary">
              <th className="text-left p-2">ID</th>
              <th className="text-left p-2">Address</th>
              <th className="text-left p-2">Created</th>
              <th className="text-left p-2">Tokens Created</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-autofun-background-primary">
                <td className="p-2">{user.id}</td>
                <td className="p-2 font-mono text-xs">{user.address.substring(0, 6)}...{user.address.substring(user.address.length - 4)}</td>
                <td className="p-2">{user.createdAt}</td>
                <td className="p-2">{user.tokensCreated}</td>
                <td className="p-2">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    user.status === 'active' 
                      ? 'bg-green-900 text-green-300' 
                      : 'bg-red-900 text-red-300'
                  }`}>
                    {user.status}
                  </span>
                </td>
                <td className="p-2">
                  <Link 
                    to={`/admin/users/${user.address}`}
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
interface User {
  id: string;
  address: string;
  createdAt: string;
  lastActive: string;
  status: string;
  tokensCreated: TokenCreated[];
  tokensHeld: TokenHeld[];
  transactions: Transaction[];
  totalVolume: number;
}

interface TokenCreated {
  id: string;
  name: string;
  ticker: string;
  mint: string;
  createdAt: string;
}

interface TokenHeld {
  mint: string;
  name: string;
  ticker: string;
  balance: number;
}

interface Transaction {
  id: string;
  type: string;
  token: string;
  amount: string;
  date: string;
}

function AdminUserDetails({ address }: { address: string }) {
  // In a real application, you would fetch user data based on the address
  const [user, setUser] = useState<User>({
    id: "user1",
    address,
    createdAt: "2025-04-01",
    lastActive: "2025-04-18",
    status: "active",
    tokensCreated: [
      { id: "token1", name: "Token 1", ticker: "TKN1", mint: "token123", createdAt: "2025-04-02" },
      { id: "token2", name: "Token 2", ticker: "TKN2", mint: "token456", createdAt: "2025-04-05" }
    ],
    tokensHeld: [
      { mint: "token123", name: "Token 1", ticker: "TKN1", balance: 500000000 },
      { mint: "token456", name: "Token 2", ticker: "TKN2", balance: 250000000 },
      { mint: "token789", name: "Token 3", ticker: "TKN3", balance: 100000000 }
    ],
    transactions: [
      { id: "tx1", type: "buy", token: "Token 1", amount: "100 SOL", date: "2025-04-10" },
      { id: "tx2", type: "sell", token: "Token 2", amount: "50 SOL", date: "2025-04-12" },
      { id: "tx3", type: "buy", token: "Token 3", amount: "25 SOL", date: "2025-04-15" }
    ],
    totalVolume: 1234.56
  });

  // Mutation for updating user status
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      return await fetcher(`/api/users/${address}/status`, "POST", { status: newStatus });
    },
    onSuccess: () => {
      toast.success(`User status updated successfully`);
      setUser(prev => ({ ...prev, status: prev.status === 'active' ? 'suspended' : 'active' }));
    },
    onError: (error) => {
      toast.error(`Failed to update user status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  const handleToggleStatus = () => {
    const newStatus = user.status === 'active' ? 'suspended' : 'active';
    updateStatusMutation.mutate(newStatus);
  };

  return (
    <div className="p-4 bg-autofun-background-input rounded-md">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">User Details</h2>
        <div className="flex space-x-2">
          <Link 
            to="/admin/users"
            className="px-4 py-2 bg-autofun-background-primary rounded-md hover:bg-autofun-background-action-primary"
          >
            Back to Users
          </Link>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="p-4 bg-autofun-background-primary rounded-md">
          <h3 className="text-lg font-medium mb-2">User Information</h3>
          <div className="space-y-2">
            <div>
              <span className="text-autofun-text-secondary">ID:</span>
              <span className="ml-2">{user.id}</span>
            </div>
            <div>
              <span className="text-autofun-text-secondary">Created:</span>
              <span className="ml-2">{user.createdAt}</span>
            </div>
            <div>
              <span className="text-autofun-text-secondary">Last Active:</span>
              <span className="ml-2">{user.lastActive}</span>
            </div>
            <div>
              <span className="text-autofun-text-secondary">Status:</span>
              <span className={`ml-2 px-2 py-1 rounded-full text-xs ${
                user.status === 'active' 
                  ? 'bg-green-900 text-green-300' 
                  : 'bg-red-900 text-red-300'
              }`}>
                {user.status}
              </span>
            </div>
          </div>
        </div>
        
        <div className="p-4 bg-autofun-background-primary rounded-md">
          <h3 className="text-lg font-medium mb-2">Wallet Address</h3>
          <div className="flex items-center justify-between p-2 bg-autofun-background-input rounded-md">
            <span className="font-mono text-sm truncate">{address}</span>
            <CopyButton text={address} />
          </div>
          
          <div className="mt-4">
            <h3 className="text-lg font-medium mb-2">Activity Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-autofun-text-secondary">Tokens Created:</span>
                <span className="ml-2">{user.tokensCreated.length}</span>
              </div>
              <div>
                <span className="text-autofun-text-secondary">Tokens Held:</span>
                <span className="ml-2">{user.tokensHeld.length}</span>
              </div>
              <div>
                <span className="text-autofun-text-secondary">Total Volume:</span>
                <span className="ml-2">{user.totalVolume.toLocaleString()} SOL</span>
              </div>
              <div>
                <span className="text-autofun-text-secondary">Transactions:</span>
                <span className="ml-2">{user.transactions.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="p-4 bg-autofun-background-primary rounded-md mb-4">
        <h3 className="text-lg font-medium mb-2">Tokens Created</h3>
        {user.tokensCreated.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-autofun-background-input">
                  <th className="text-left p-2">ID</th>
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">Ticker</th>
                  <th className="text-left p-2">Created</th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {user.tokensCreated.map((token) => (
                  <tr key={token.id} className="border-b border-autofun-background-input">
                    <td className="p-2">{token.id}</td>
                    <td className="p-2">{token.name}</td>
                    <td className="p-2">{token.ticker}</td>
                    <td className="p-2">{token.createdAt}</td>
                    <td className="p-2">
                      <div className="flex items-center space-x-2">
                        <Link 
                          to={`/admin/tokens/${token.mint}`}
                          className="text-autofun-text-highlight hover:underline"
                        >
                          View
                        </Link>
                        <CopyButton text={token.mint} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-autofun-text-secondary">No tokens created</p>
        )}
      </div>
      
      <div className="p-4 bg-autofun-background-primary rounded-md mb-4">
        <h3 className="text-lg font-medium mb-2">Tokens Held</h3>
        {user.tokensHeld.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-autofun-background-input">
                  <th className="text-left p-2">Token</th>
                  <th className="text-left p-2">Ticker</th>
                  <th className="text-left p-2">Balance</th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {user.tokensHeld.map((token) => (
                  <tr key={token.mint} className="border-b border-autofun-background-input">
                    <td className="p-2">{token.name}</td>
                    <td className="p-2">{token.ticker}</td>
                    <td className="p-2">{token.balance.toLocaleString()}</td>
                    <td className="p-2">
                      <div className="flex items-center space-x-2">
                        <Link 
                          to={`/admin/tokens/${token.mint}`}
                          className="text-autofun-text-highlight hover:underline"
                        >
                          View
                        </Link>
                        <CopyButton text={token.mint} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-autofun-text-secondary">No tokens held</p>
        )}
      </div>
      
      <div className="p-4 bg-autofun-background-primary rounded-md mb-4">
        <h3 className="text-lg font-medium mb-2">Recent Transactions</h3>
        {user.transactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-autofun-background-input">
                  <th className="text-left p-2">ID</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-left p-2">Token</th>
                  <th className="text-left p-2">Amount</th>
                  <th className="text-left p-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {user.transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-autofun-background-input">
                    <td className="p-2">{tx.id}</td>
                    <td className="p-2">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        tx.type === 'buy' 
                          ? 'bg-green-900 text-green-300' 
                          : 'bg-red-900 text-red-300'
                      }`}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="p-2">{tx.token}</td>
                    <td className="p-2">{tx.amount}</td>
                    <td className="p-2">{tx.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-autofun-text-secondary">No transactions found</p>
        )}
      </div>
      
      <div className="mt-4 flex justify-end space-x-2">
        <button 
          className={`px-4 py-2 ${
            user.status === 'active' 
              ? 'bg-yellow-900 text-yellow-300 hover:bg-yellow-800' 
              : 'bg-green-900 text-green-300 hover:bg-green-800'
          } rounded-md`}
          onClick={handleToggleStatus}
          disabled={updateStatusMutation.isPending}
        >
          {updateStatusMutation.isPending 
            ? 'Processing...' 
            : user.status === 'active' 
              ? 'Suspend User' 
              : 'Activate User'
          }
        </button>
      </div>
      
      {/* Admin Notes section removed */}
    </div>
  );
}
