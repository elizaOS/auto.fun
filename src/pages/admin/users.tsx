import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "react-toastify";
import CopyButton from "@/components/copy-button";
import { fetcher } from "@/utils/api";
import { useAdminUsers } from "@/hooks/use-admin-users";
import Loader from "@/components/loader";
import Pagination from "@/components/pagination";

// Type definitions
interface User {
  id: string;
  address: string;
  name: string | null;
  createdAt: string;
  lastActive?: string;
  points: number;
  rewardPoints: number;
  suspended?: boolean;
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
  const [showSuspended, setShowSuspended] = useState(false);
  const [goToAddress, setGoToAddress] = useState("");
  const usersPagination = useAdminUsers(showSuspended);
  const navigate = useNavigate();

  if (usersPagination.isLoading) {
    return <Loader />;
  }

  // Cast items to User[] type
  const users = usersPagination.items as unknown as User[];

  const handleGoToUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (goToAddress.trim()) {
      navigate(`/admin/users/${goToAddress.trim()}`);
    }
  };

  return (
    <div className="p-4 bg-autofun-background-input ">
      <div className="flex flex-col space-y-4 mb-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Users</h2>
          <div className="flex space-x-4">
            <label className="flex items-center space-x-2 text-autofun-text-primary">
              <input
                type="checkbox"
                checked={showSuspended}
                onChange={() => setShowSuspended(!showSuspended)}
                className="form-checkbox"
              />
              <span>Show Suspended</span>
            </label>
          </div>
        </div>

        <div className="w-full bg-autofun-background-primary p-3 rounded">
          <form
            onSubmit={handleGoToUser}
            className="flex items-center space-x-2"
          >
            <div className="flex-grow">
              <input
                type="text"
                value={goToAddress}
                onChange={(e) => setGoToAddress(e.target.value)}
                placeholder="Enter user address"
                className="w-full p-2 bg-autofun-background-input text-autofun-text-primary rounded"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-autofun-background-action-primary text-autofun-text-primary hover:bg-autofun-background-action-secondary rounded"
            >
              Go To User
            </button>
          </form>
        </div>
      </div>
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
            {users.map((user: User) => (
              <tr
                key={user.id}
                className="border-b border-autofun-background-primary"
              >
                <td className="p-2">{user.id}</td>
                <td className="p-2 font-mono text-xs">
                  {user.address.substring(0, 6)}...
                  {user.address.substring(user.address.length - 4)}
                </td>
                <td className="p-2">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="p-2">{user.tokensCreated?.length || 0}</td>
                <td className="p-2">
                  <span
                    className={`px-2 py-1 rounded-full text-xs ${
                      user.name?.startsWith("[SUSPENDED]")
                        ? "bg-red-900 text-red-300"
                        : "bg-green-900 text-green-300"
                    }`}
                  >
                    {user.name?.startsWith("[SUSPENDED]")
                      ? "suspended"
                      : "active"}
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

      {/* Pagination */}
      <div className="flex justify-between items-center pt-4">
        <div className="text-sm text-autofun-text-secondary">
          Showing {users.length} of {usersPagination.totalItems || 0} users
        </div>
        {usersPagination.totalPages > 1 && (
          <Pagination
            pagination={{
              page: usersPagination.currentPage,
              totalPages: usersPagination.totalPages,
              total: usersPagination.totalItems || 0,
              hasMore: usersPagination.hasNextPage,
            }}
            onPageChange={usersPagination.goToPage}
          />
        )}
      </div>
    </div>
  );
}

function AdminUserDetails({ address }: { address: string }) {
  // Fetch user data from the API
  const userQuery = useQuery<User>({
    queryKey: ["admin-user", address],
    queryFn: async () => {
      const response = (await fetcher(
        `/api/admin/users/${address}`,
        "GET",
      )) as { user: User };
      return response.user;
    },
  });

  // Mutation for updating user suspended status
  const updateStatusMutation = useMutation({
    mutationFn: async (suspended: boolean) => {
      return await fetcher(`/api/admin/users/${address}/suspended`, "POST", {
        suspended,
      });
    },
    onSuccess: () => {
      toast.success(`User status updated successfully`);
      userQuery.refetch(); // Refetch user data after update
    },
    onError: (error) => {
      toast.error(
        `Failed to update user status: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  // If loading, show a loader
  if (userQuery.isLoading) {
    return <Loader />;
  }

  // If error, show an error message
  if (userQuery.isError || !userQuery.data) {
    return (
      <div className="p-4 bg-autofun-background-input ">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">User Details</h2>
          <Link
            to="/admin/users"
            className="px-4 py-2 bg-autofun-background-primary  hover:bg-autofun-background-action-primary"
          >
            Back to Users
          </Link>
        </div>
        <div className="p-4 bg-red-900/20 text-red-300 ">
          <p>
            Error loading user data. The user may not exist or there was an
            error fetching the data.
          </p>
        </div>
      </div>
    );
  }

  const user = userQuery.data;

  // Check if user is suspended based on name prefix
  const isSuspended = user.name?.startsWith("[SUSPENDED]") || false;

  const handleToggleStatus = () => {
    updateStatusMutation.mutate(!isSuspended);
  };

  return (
    <div className="p-4 bg-autofun-background-input ">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">User Details</h2>
        <div className="flex space-x-2">
          <Link
            to="/admin/users"
            className="px-4 py-2 bg-autofun-background-primary  hover:bg-autofun-background-action-primary"
          >
            Back to Users
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="p-4 bg-autofun-background-primary ">
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
              <span
                className={`ml-2 px-2 py-1 rounded-full text-xs ${
                  isSuspended
                    ? "bg-red-900 text-red-300"
                    : "bg-green-900 text-green-300"
                }`}
              >
                {isSuspended ? "suspended" : "active"}
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-autofun-background-primary ">
          <h3 className="text-lg font-medium mb-2">Wallet Address</h3>
          <div className="flex items-center justify-between p-2 bg-autofun-background-input ">
            <span className="font-mono text-sm truncate">{address}</span>
            <CopyButton text={address} />
          </div>

          <div className="mt-4">
            <h3 className="text-lg font-medium mb-2">Activity Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-autofun-text-secondary">
                  Tokens Created:
                </span>
                <span className="ml-2">{user?.tokensCreated?.length || 0}</span>
              </div>
              <div>
                <span className="text-autofun-text-secondary">
                  Tokens Held:
                </span>
                <span className="ml-2">{user?.tokensHeld?.length || 0}</span>
              </div>
              <div>
                <span className="text-autofun-text-secondary">
                  Total Volume:
                </span>
                <span className="ml-2">
                  {user?.totalVolume?.toLocaleString()} SOL
                </span>
              </div>
              <div>
                <span className="text-autofun-text-secondary">
                  Transactions:
                </span>
                <span className="ml-2">{user?.transactions?.length || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 bg-autofun-background-primary mb-4">
        <h3 className="text-lg font-medium mb-2">Tokens Created</h3>
        {user.tokensCreated && user.tokensCreated.length > 0 ? (
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
                {user.tokensCreated.map((token: TokenCreated) => (
                  <tr
                    key={token.id}
                    className="border-b border-autofun-background-input"
                  >
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

      <div className="p-4 bg-autofun-background-primary mb-4">
        <h3 className="text-lg font-medium mb-2">Tokens Held</h3>
        {user.tokensHeld && user.tokensHeld.length > 0 ? (
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
                {user.tokensHeld.map((token: TokenHeld) => (
                  <tr
                    key={token.mint}
                    className="border-b border-autofun-background-input"
                  >
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

      <div className="p-4 bg-autofun-background-primary  mb-4">
        <h3 className="text-lg font-medium mb-2">Recent Transactions</h3>
        {user.transactions && user.transactions.length > 0 ? (
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
                {user.transactions.map((tx: Transaction) => (
                  <tr
                    key={tx.id}
                    className="border-b border-autofun-background-input"
                  >
                    <td className="p-2">{tx.id}</td>
                    <td className="p-2">
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          tx.type === "buy"
                            ? "bg-green-900 text-green-300"
                            : "bg-red-900 text-red-300"
                        }`}
                      >
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
            isSuspended
              ? "bg-green-900 text-green-300 hover:bg-green-800"
              : "bg-yellow-900 text-yellow-300 hover:bg-yellow-800"
          } `}
          onClick={handleToggleStatus}
          disabled={updateStatusMutation.isPending}
        >
          {updateStatusMutation.isPending
            ? "Processing..."
            : isSuspended
              ? "Activate User"
              : "Suspend User"}
        </button>
      </div>

      {/* Admin Notes section removed */}
    </div>
  );
}
