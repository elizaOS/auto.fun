import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "react-toastify";
import CopyButton from "@/components/copy-button";
import { fetcher, getToken } from "@/utils/api";
import { useTokens } from "@/hooks/use-tokens";
import Pagination from "@/components/pagination";
import Loader from "@/components/loader";

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
  const [sortBy, setSortBy] = useState<
    "all" | "marketCap" | "newest" | "oldest"
  >("newest");
  const [hideImported, setHideImported] = useState(false);

  const tokensPagination = useTokens(sortBy, hideImported, 50);

  if (tokensPagination.isLoading) {
    return <Loader />;
  }

  return (
    <div className="p-4 bg-autofun-background-input ">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Tokens</h2>
        <div className="flex space-x-4">
          <select
            className="bg-autofun-background-primary text-autofun-text-primary px-3 py-2 "
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
          >
            <option value="all">Featured</option>
            <option value="marketCap">Market Cap</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>

          <label className="flex items-center space-x-2 text-autofun-text-primary">
            <input
              type="checkbox"
              checked={hideImported}
              onChange={() => setHideImported(!hideImported)}
              className="form-checkbox"
            />
            <span>Hide Imported</span>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-autofun-background-primary">
              <th className="text-left p-2">ID</th>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Ticker</th>
              <th className="text-left p-2">Created</th>
              <th className="text-left p-2">Price (SOL)</th>
              <th className="text-left p-2">Volume (24h)</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tokensPagination.items.map((token: any) => (
              <tr
                key={token.mint}
                className="border-b border-autofun-background-primary"
              >
                <td className="p-2">{token.mint.substring(0, 8)}...</td>
                <td className="p-2">
                  <div className="flex items-center space-x-2">
                    {token.image && (
                      <img
                        src={token.image}
                        alt={token.name}
                        className="w-6 h-6 rounded-full object-cover"
                        onError={(e) => {
                          // Replace broken images with a placeholder
                          (e.target as HTMLImageElement).src =
                            "/placeholder.png";
                        }}
                      />
                    )}
                    <span>{token.name}</span>
                  </div>
                </td>
                <td className="p-2">{token.ticker}</td>
                <td className="p-2">
                  {new Date(token.createdAt).toLocaleDateString()}
                </td>
                <td className="p-2">{token.currentPrice.toFixed(8)}</td>
                <td className="p-2">{formatNumber(token.volume24h)}</td>
                <td className="p-2">
                  <span
                    className={`px-2 py-1 rounded-full text-xs ${
                      token.status === "active"
                        ? "bg-green-900 text-green-300"
                        : token.status === "pending"
                          ? "bg-yellow-900 text-yellow-300"
                          : token.status === "locked"
                            ? "bg-purple-900 text-purple-300"
                            : token.status === "migrating" ||
                                token.status === "migrated"
                              ? "bg-blue-900 text-blue-300"
                              : token.status === "harvested"
                                ? "bg-teal-900 text-teal-300"
                                : token.status === "withdrawn" ||
                                    token.status === "migration_failed"
                                  ? "bg-red-900 text-red-300"
                                  : "bg-gray-900 text-gray-300"
                    }`}
                  >
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

      {/* Pagination */}
      <div className="flex justify-between items-center pt-4">
        <div className="text-sm text-autofun-text-secondary">
          Showing {tokensPagination.items.length} of{" "}
          {tokensPagination.totalItems || 0} tokens
        </div>
        {tokensPagination.totalPages > 1 && (
          <Pagination
            pagination={{
              page: tokensPagination.currentPage,
              totalPages: tokensPagination.totalPages,
              total: tokensPagination.totalItems || 0,
              hasMore: tokensPagination.hasNextPage,
            }}
            onPageChange={tokensPagination.goToPage}
          />
        )}
      </div>
    </div>
  );
}

import { IToken } from "@/types";
import { formatNumber } from "@/utils";

// Extended token interface with admin-specific fields
interface AdminToken extends IToken {
  id: string;
  featured?: boolean;
  verified?: boolean;
  hidden?: boolean;
}

interface SocialLinks {
  website: string;
  twitter: string;
  telegram: string;
  discord: string;
  farcaster: string;
}

function AdminTokenDetails({ address }: { address: string }) {
  // Fetch token data using the getToken function
  const tokenQuery = useQuery<AdminToken>({
    queryKey: ["token", address],
    queryFn: async () => {
      if (!address) throw new Error("No address provided");
      try {
        // Cast the result to AdminToken with featured and verified properties
        const tokenData = (await getToken({ address })) as IToken;
        return {
          ...tokenData,
          id: tokenData.txId || tokenData.mint.substring(0, 8), // Use txId or first 8 chars of mint as ID
          featured: (tokenData as any).featured || false,
          verified: (tokenData as any).verified || false,
          hidden: (tokenData as any).hidden || false,
        } as AdminToken;
      } catch (error) {
        console.error(`Error fetching token data:`, error);
        throw error;
      }
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // State for social links form
  const [socialLinks, setSocialLinks] = useState<SocialLinks>({
    website: "",
    twitter: "",
    telegram: "",
    discord: "",
    farcaster: "",
  });

  // Update socialLinks when token changes
  useEffect(() => {
    if (tokenQuery.data) {
      setSocialLinks({
        website: tokenQuery.data.website || "",
        twitter: tokenQuery.data.twitter || "",
        telegram: tokenQuery.data.telegram || "",
        discord: tokenQuery.data.discord || "",
        farcaster: tokenQuery.data.farcaster || "",
      });
    }
  }, [tokenQuery.data]);

  // Mutation for updating token social links
  const updateSocialLinksMutation = useMutation({
    mutationFn: async (links: SocialLinks) => {
      return await fetcher(
        `/api/admin/tokens/${address}/social`,
        "POST",
        links
      );
    },
    onSuccess: () => {
      toast.success(`Token social links updated successfully`);
      tokenQuery.refetch(); // Refetch token data after update
    },
    onError: (error) => {
      toast.error(
        `Failed to update social links: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    },
  });

  // Mutation for toggling featured status
  const toggleFeaturedMutation = useMutation({
    mutationFn: async () => {
      return await fetcher(`/api/admin/tokens/${address}/featured`, "POST", {
        featured: tokenQuery.data ? !tokenQuery.data.featured : false,
      });
    },
    onSuccess: () => {
      toast.success(
        `Token ${tokenQuery.data?.featured ? "removed from" : "added to"} featured tokens`
      );
      tokenQuery.refetch(); // Refetch token data after update
    },
    onError: (error) => {
      toast.error(
        `Failed to update featured status: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    },
  });

  // Mutation for toggling verified status
  const toggleVerifiedMutation = useMutation({
    mutationFn: async () => {
      return await fetcher(`/api/admin/tokens/${address}/verified`, "POST", {
        verified: tokenQuery.data ? !tokenQuery.data.verified : false,
      });
    },
    onSuccess: () => {
      toast.success(
        `Token ${tokenQuery.data?.verified ? "unverified" : "verified"} successfully`
      );
      tokenQuery.refetch(); // Refetch token data after update
    },
    onError: (error) => {
      toast.error(
        `Failed to update verified status: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    },
  });

  // Mutation for toggling hidden status
  const toggleHiddenMutation = useMutation({
    mutationFn: async () => {
      return await fetcher(`/api/admin/tokens/${address}/hidden`, "POST", {
        hidden: tokenQuery.data ? !tokenQuery.data.hidden : false,
      });
    },
    onSuccess: () => {
      toast.success(
        `Token ${tokenQuery.data?.hidden ? "unhidden" : "hidden"} successfully`
      );
      tokenQuery.refetch(); // Refetch token data after update
    },
    onError: (error) => {
      toast.error(
        `Failed to update hidden status: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    },
  });

  // Show loading state while fetching token data
  if (tokenQuery.isLoading) {
    return <Loader />;
  }

  // Show error state if token data fetch fails
  if (tokenQuery.isError || !tokenQuery.data) {
    return (
      <div className="p-4 bg-autofun-background-input ">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Token Details</h2>
          <Link
            to="/admin/tokens"
            className="px-4 py-2 bg-autofun-background-primary  hover:bg-autofun-background-action-primary"
          >
            Back to Tokens
          </Link>
        </div>
        <div className="p-4 bg-red-900/20 text-red-300 ">
          <p>
            Error loading token data. The token may not exist or there was an
            error fetching the data.
          </p>
        </div>
      </div>
    );
  }

  const token = tokenQuery.data;

  return (
    <div className="p-4 bg-autofun-background-input ">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Token Details</h2>
        <div className="flex space-x-2">
          <Link
            to="/admin/tokens"
            className="px-4 py-2 bg-autofun-background-primary  hover:bg-autofun-background-action-primary"
          >
            Back to Tokens
          </Link>
          <Link
            to={`/token/${address}`}
            target="_blank"
            className="px-4 py-2 bg-autofun-background-action-primary text-autofun-text-primary  hover:bg-autofun-background-action-highlight"
          >
            View Public Page
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="p-4 bg-autofun-background-primary ">
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
              <span className="ml-2">
                {new Date(token.createdAt).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-autofun-text-secondary">Description:</span>
              <span className="ml-2">{token.description}</span>
            </div>
            <div>
              <span className="text-autofun-text-secondary">Status:</span>
              <span
                className={`ml-2 px-2 py-1 rounded-full text-xs ${
                  token.status === "active"
                    ? "bg-green-900 text-green-300"
                    : token.status === "pending"
                      ? "bg-yellow-900 text-yellow-300"
                      : token.status === "locked"
                        ? "bg-purple-900 text-purple-300"
                        : token.status === "migrating" ||
                            token.status === "migrated"
                          ? "bg-blue-900 text-blue-300"
                          : token.status === "harvested"
                            ? "bg-teal-900 text-teal-300"
                            : token.status === "withdrawn" ||
                                token.status === "migration_failed"
                              ? "bg-red-900 text-red-300"
                              : "bg-gray-900 text-gray-300"
                }`}
              >
                {token.status}
              </span>
            </div>
            <div>
              <span className="text-autofun-text-secondary">Imported:</span>
              <span className="ml-2">
                {token.imported === 1 ? "Yes" : "No"}
              </span>
            </div>
            <div>
              <span className="text-autofun-text-secondary">Featured:</span>
              <span
                className={`ml-2 px-2 py-1 rounded-full text-xs ${
                  token.featured
                    ? "bg-blue-900 text-blue-300"
                    : "bg-gray-900 text-gray-300"
                }`}
              >
                {token.featured ? "Yes" : "No"}
              </span>
            </div>
            <div>
              <span className="text-autofun-text-secondary">Verified:</span>
              <span
                className={`ml-2 px-2 py-1 rounded-full text-xs ${
                  token.verified
                    ? "bg-green-900 text-green-300"
                    : "bg-gray-900 text-gray-300"
                }`}
              >
                {token.verified ? "Yes" : "No"}
              </span>
            </div>
            <div>
              <span className="text-autofun-text-secondary">Hidden:</span>
              <span
                className={`ml-2 px-2 py-1 rounded-full text-xs ${
                  token.hidden
                    ? "bg-purple-900 text-purple-300"
                    : "bg-gray-900 text-gray-300"
                }`}
              >
                {token.hidden ? "Yes" : "No"}
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-autofun-background-primary ">
          <h3 className="text-lg font-medium mb-2">Token Address (Mint)</h3>
          <div className="flex items-center justify-between p-2 bg-autofun-background-input ">
            <span className="font-mono text-sm truncate">{address}</span>
            <CopyButton text={address} />
          </div>

          <h3 className="text-lg font-medium mt-4 mb-2">Creator Address</h3>
          <div className="flex items-center justify-between p-2 bg-autofun-background-input ">
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
        <div className="p-4 bg-autofun-background-primary ">
          <h3 className="text-lg font-medium mb-2">Supply</h3>
          <p className="text-2xl font-bold text-autofun-text-highlight">
            {token.tokenSupplyUiAmount.toLocaleString()}
          </p>
          <p className="text-xs text-autofun-text-secondary">
            Decimals: {token.tokenDecimals}
          </p>
        </div>

        <div className="p-4 bg-autofun-background-primary ">
          <h3 className="text-lg font-medium mb-2">Price</h3>
          <p className="text-2xl font-bold text-autofun-text-highlight">
            {formatNumber(token.currentPrice)}
          </p>
        </div>

        <div className="p-4 bg-autofun-background-primary ">
          <h3 className="text-lg font-medium mb-2">Holders</h3>
          <p className="text-2xl font-bold text-autofun-text-highlight">
            {token?.holderCount ? token?.holderCount : "N/A"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="p-4 bg-autofun-background-primary ">
          <h3 className="text-lg font-medium mb-2">Market Cap</h3>
          <p className="text-2xl font-bold text-autofun-text-highlight">
            {formatNumber(token.marketCapUSD)}
          </p>
        </div>

        <div className="p-4 bg-autofun-background-primary ">
          <h3 className="text-lg font-medium mb-2">Volume (24h)</h3>
          <p className="text-2xl font-bold text-autofun-text-highlight">
            {formatNumber(token.volume24h)}
          </p>
        </div>

        <div className="p-4 bg-autofun-background-primary ">
          <h3 className="text-lg font-medium mb-2">Curve Progress</h3>
          <div className="w-full bg-autofun-background-input rounded-full h-2.5 mb-2">
            <div
              className="bg-autofun-text-highlight h-2.5 rounded-full"
              style={{ width: `${token.curveProgress}%` }}
            ></div>
          </div>
          <p className="text-lg font-bold text-autofun-text-highlight">
            {token.curveProgress ? token.curveProgress.toFixed(1) : "-"}%
          </p>
          <p className="text-xs text-autofun-text-secondary">
            Reserve: {token.reserveLamport} SOL (Virtual:{" "}
            {token.virtualReserves} SOL)
          </p>
        </div>
      </div>

      <div className="p-4 bg-autofun-background-primary  mb-4">
        <h3 className="text-lg font-medium mb-2">Social Links</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateSocialLinksMutation.mutate({
              website: socialLinks.website,
              twitter: socialLinks.twitter,
              telegram: socialLinks.telegram,
              discord: socialLinks.discord,
              farcaster: socialLinks.farcaster,
            });
          }}
        >
          <div className="grid grid-cols-1 gap-4 mb-4">
            <div className="flex flex-col gap-1">
              <label className="text-autofun-text-secondary text-sm">
                Website:
              </label>
              <input
                type="text"
                value={socialLinks.website}
                onChange={(e) =>
                  setSocialLinks((prev) => ({
                    ...prev,
                    website: e.target.value,
                  }))
                }
                className="w-full bg-autofun-background-input py-2 px-3 border border-neutral-800 text-white"
                placeholder="https://example.com"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-autofun-text-secondary text-sm">
                Twitter:
              </label>
              <input
                type="text"
                value={socialLinks.twitter}
                onChange={(e) =>
                  setSocialLinks((prev) => ({
                    ...prev,
                    twitter: e.target.value,
                  }))
                }
                className="w-full bg-autofun-background-input py-2 px-3 border border-neutral-800 text-white"
                placeholder="https://x.com/example"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-autofun-text-secondary text-sm">
                Telegram:
              </label>
              <input
                type="text"
                value={socialLinks.telegram}
                onChange={(e) =>
                  setSocialLinks((prev) => ({
                    ...prev,
                    telegram: e.target.value,
                  }))
                }
                className="w-full bg-autofun-background-input py-2 px-3 border border-neutral-800 text-white"
                placeholder="https://t.me/example"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-autofun-text-secondary text-sm">
                Discord:
              </label>
              <input
                type="text"
                value={socialLinks.discord}
                onChange={(e) =>
                  setSocialLinks((prev) => ({
                    ...prev,
                    discord: e.target.value,
                  }))
                }
                className="w-full bg-autofun-background-input py-2 px-3 border border-neutral-800 text-white"
                placeholder="https://discord.gg/example"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-autofun-text-secondary text-sm">
                Farcaster:
              </label>
              <input
                type="text"
                value={socialLinks.farcaster}
                onChange={(e) =>
                  setSocialLinks((prev) => ({
                    ...prev,
                    farcaster: e.target.value,
                  }))
                }
                className="w-full bg-autofun-background-input py-2 px-3 border border-neutral-800 text-white"
                placeholder="https://warpcast.com/example"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={updateSocialLinksMutation.isPending}
            className="ml-auto cursor-pointer text-white bg-transparent gap-x-3 border-2 hover:bg-autofun-background-action-highlight border-autofun-background-action-highlight flex px-8 py-1 mt-2 flex-row w-fit items-center justify-items-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateSocialLinksMutation.isPending
              ? "Updating..."
              : "Update Social Links"}
          </button>
        </form>
      </div>

      <div className="mt-4 flex justify-end space-x-2">
        <button
          className={`px-4 py-2 ${
            token.featured
              ? "bg-red-900 text-red-300 hover:bg-red-800"
              : "bg-blue-900 text-blue-300 hover:bg-blue-800"
          } `}
          onClick={() => toggleFeaturedMutation.mutate()}
          disabled={toggleFeaturedMutation.isPending}
        >
          {toggleFeaturedMutation.isPending
            ? "Processing..."
            : token.featured
              ? "Remove Featured"
              : "Make Featured"}
        </button>

        <button
          className={`px-4 py-2 ${
            token.verified
              ? "bg-red-900 text-red-300 hover:bg-red-800"
              : "bg-green-900 text-green-300 hover:bg-green-800"
          } `}
          onClick={() => toggleVerifiedMutation.mutate()}
          disabled={toggleVerifiedMutation.isPending}
        >
          {toggleVerifiedMutation.isPending
            ? "Processing..."
            : token.verified
              ? "Remove Verified"
              : "Make Verified"}
        </button>

        <button
          className={`px-4 py-2 ${
            token.hidden
              ? "bg-purple-900 text-purple-300 hover:bg-purple-800"
              : "bg-gray-900 text-gray-300 hover:bg-gray-800"
          } `}
          onClick={() => toggleHiddenMutation.mutate()}
          disabled={toggleHiddenMutation.isPending}
        >
          {toggleHiddenMutation.isPending
            ? "Processing..."
            : token.hidden
              ? "Unhide Token"
              : "Hide Token"}
        </button>
      </div>
    </div>
  );
}
