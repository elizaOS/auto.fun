import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Trash2 } from "lucide-react"; // Import for delete button
import CopyButton from "@/components/copy-button";
import { fetcher, getToken } from "@/utils/api";
import { usePagination, UsePaginationOptions } from "@/hooks/use-pagination";
import Pagination from "@/components/pagination";
import Loader from "@/components/loader";
import { IToken } from "@/types";
import { formatNumber } from "@/utils";
import { env } from "@/utils/env"; // Import env

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
  const [sortBy, setSortBy] = useState<keyof IToken | "all" | "oldest">(
    "createdAt",
  );
  const [hideImported, setHideImported] = useState(false);
  const queryClient = useQueryClient(); // Get query client instance

  // Prepare options for usePagination
  const paginationOptions: UsePaginationOptions<IToken> = {
    endpoint: "/api/admin/tokens",
    limit: 50,
    // Map frontend sort key to backend sort key
    sortBy:
      sortBy === "all"
        ? "featured"
        : sortBy === "oldest"
          ? "createdAt"
          : sortBy,
    sortOrder: sortBy === "oldest" ? "asc" : "desc",
    itemsPropertyName: "tokens",
    useUrlState: true, // Keep URL state for admin page
    ...(hideImported && { hideImported: 1 }),
  };

  // Use the standard usePagination hook
  const tokensPagination = usePagination<IToken, IToken>(paginationOptions);

  // Mutation for toggling hidden status for a specific token
  const toggleHiddenMutation = useMutation({
    mutationFn: async (tokenAddress: string) => {
      // Find the token in the current list to determine the current hidden status
      const token = tokensPagination?.items?.find(
        (t) => t.mint === tokenAddress,
      );
      const currentHiddenStatus = token ? !!(token as any).hidden : false;
      return await fetcher(`/api/admin/tokens/${tokenAddress}/hidden`, "POST", {
        hidden: !currentHiddenStatus, // Toggle the boolean status
      });
    },
    onSuccess: (_, tokenAddress) => {
      const token = tokensPagination?.items?.find(
        (t) => t.mint === tokenAddress,
      );
      const currentHiddenStatus = token ? !!(token as any).hidden : false; // Ensure boolean
      toast.success(
        `Token ${currentHiddenStatus ? "unhidden" : "hidden"} successfully`,
      );
      // Invalidate the tokens query to refetch the list
      queryClient.invalidateQueries({ queryKey: ["tokens", sortBy] });
    },
    onError: (error, tokenAddress) => {
      toast.error(
        `Failed to update hidden status for token ${tokenAddress}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  if (tokensPagination?.isLoading) {
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
            <option value="createdAt">Newest</option>
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
            {tokensPagination?.items?.map((token: IToken) => (
              <tr
                key={token.mint}
                className="border-b border-autofun-background-primary"
              >
                <td className="p-2">{token.mint.substring(0, 8)}...</td>
                <td className="p-2">
                  <div className="flex items-center space-x-2">
                    {token.image ? (
                      <img
                        src={token?.image || "/placeholder.png"}
                        alt={token.name}
                        className="w-6 h-6 rounded-full object-cover"
                      />
                    ) : (
                      <div className="size-6 bg-autofun-background-disabled" />
                    )}
                    <span>{token.name}</span>
                  </div>
                </td>
                <td className="p-2">{token.ticker}</td>
                <td className="p-2">
                  {token.createdAt
                    ? new Date(token.createdAt).toLocaleDateString()
                    : "-"}
                </td>
                <td className="p-2">{token.currentPrice?.toFixed(8) ?? "-"}</td>
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
                <td className="p-2 flex items-center space-x-2">
                  <Link
                    to={`/admin/tokens/${token.mint}`}
                    className="text-autofun-text-highlight hover:underline"
                  >
                    View
                  </Link>
                  <button
                    className={`px-2 py-1 text-xs rounded ${
                      (token as any).hidden // Ensure boolean check
                        ? "bg-purple-900 text-purple-300 hover:bg-purple-800"
                        : "bg-gray-900 text-gray-300 hover:bg-gray-800"
                    }`}
                    onClick={() => toggleHiddenMutation.mutate(token.mint)}
                    disabled={
                      toggleHiddenMutation.isPending &&
                      toggleHiddenMutation.variables === token.mint
                    }
                  >
                    {toggleHiddenMutation.isPending &&
                    toggleHiddenMutation.variables === token.mint
                      ? "Processing..."
                      : (token as any).hidden // Ensure boolean check
                        ? "Unhide"
                        : "Hide"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center pt-4">
        <div className="text-sm text-autofun-text-secondary">
          Showing {tokensPagination?.items?.length || 0} of{" "}
          {tokensPagination?.totalItems || 0} tokens
        </div>
        {tokensPagination?.totalPages && tokensPagination.totalPages > 1 && (
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

interface AdminToken extends IToken {
  txId: string;
  featured: number;
  verified: number;
  hidden: boolean;
}

interface SocialLinks {
  website: string;
  twitter: string;
  telegram: string;
  discord: string;
  farcaster: string;
}

function AdminTokenDetails({ address }: { address: string }) {
  // State for editable core details
  const [editName, setEditName] = useState("");
  const [editTicker, setEditTicker] = useState("");
  const [editImage, setEditImage] = useState("");
  const [editUrl, setEditUrl] = useState(""); // For metadata URL
  const [editDescription, setEditDescription] = useState(""); // Add state for description
  const [originalDetails, setOriginalDetails] = useState({
    name: "",
    ticker: "",
    image: "",
    url: "",
    description: "",
  }); // Add description

  // --- State for metadata editor ---
  const [metadataContent, setMetadataContent] = useState<string>("");
  const [originalMetadataContent, setOriginalMetadataContent] =
    useState<string>("");
  const [isLoadingMetadata, setIsLoadingMetadata] = useState<boolean>(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [isMetadataJsonValid, setIsMetadataJsonValid] = useState<boolean>(true);

  // Fetch token data using the getToken function
  const tokenQuery = useQuery<AdminToken>({
    queryKey: ["token", address],
    queryFn: async () => {
      if (!address) throw new Error("No address provided");
      try {
        // Cast the result to AdminToken with featured and verified properties
        const tokenData = (await getToken({ address })) as IToken;
        setEditName(tokenData.name || "");
        setEditTicker(tokenData.ticker || "");
        setEditImage(tokenData.image || "");
        setEditUrl(tokenData.url || ""); // Initialize metadata URL
        setEditDescription(tokenData.description || ""); // Initialize description
        // Store original details for change detection
        setOriginalDetails({
          name: tokenData.name || "",
          ticker: tokenData.ticker || "",
          image: tokenData.image || "",
          url: tokenData.url || "",
          description: tokenData.description || "", // Store original description
        });
        return {
          ...tokenData,
          featured: (tokenData as any).featured || false,
          verified: (tokenData as any).verified || false,
          hidden: !!(tokenData as any).hidden, // Ensure boolean conversion
        } as AdminToken;
      } catch (error) {
        console.error(`Error fetching token data:`, error);
        throw error;
      }
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // --- Effect to fetch metadata content --- (Separate useEffect for clarity)
  useEffect(() => {
    const fetchMetadata = async () => {
      if (
        tokenQuery.data &&
        tokenQuery.data.url &&
        tokenQuery.data.imported !== 1
      ) {
        setIsLoadingMetadata(true);
        setMetadataError(null);
        setMetadataContent(""); // Reset content before fetching
        setOriginalMetadataContent("");
        setIsMetadataJsonValid(true);
        try {
          // Use fetch directly as fetcher might expect JSON response, but we need text
          const response = await fetch(tokenQuery.data.url);
          if (!response.ok) {
            throw new Error(
              `Failed to fetch metadata: ${response.status} ${response.statusText}`,
            );
          }
          const textContent = await response.text();
          // Basic check if it looks like JSON before pretty printing
          let formattedContent = textContent;
          try {
            formattedContent = JSON.stringify(JSON.parse(textContent), null, 2);
          } catch (e) {
            // If parsing fails, use the raw text but mark as invalid
            console.warn("Fetched metadata content is not valid JSON.");
            setIsMetadataJsonValid(false);
          }
          setMetadataContent(formattedContent);
          setOriginalMetadataContent(formattedContent);
          setIsMetadataJsonValid(true); // Assume valid if initial parse works
        } catch (error) {
          console.error("Error fetching metadata content:", error);
          setMetadataError(
            error instanceof Error ? error.message : "Failed to load metadata",
          );
          setIsMetadataJsonValid(false);
        } finally {
          setIsLoadingMetadata(false);
        }
      } else {
        // Reset metadata state if token is imported or has no URL
        setMetadataContent("");
        setOriginalMetadataContent("");
        setIsLoadingMetadata(false);
        setMetadataError(null);
        setIsMetadataJsonValid(true);
      }
    };

    fetchMetadata();
  }, [tokenQuery.data]); // Rerun when token data changes

  // --- Effect to validate JSON content on change ---
  useEffect(() => {
    if (!metadataContent) {
      setIsMetadataJsonValid(true); // Empty is considered valid (or handled by save logic)
      return;
    }
    try {
      JSON.parse(metadataContent);
      setIsMetadataJsonValid(true);
    } catch (e) {
      setIsMetadataJsonValid(false);
    }
  }, [metadataContent]);

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
        links,
      );
    },
    onSuccess: () => {
      toast.success(`Token social links updated successfully`);
      tokenQuery.refetch(); // Refetch token data after update
    },
    onError: (error) => {
      toast.error(
        `Failed to update social links: ${error instanceof Error ? error.message : "Unknown error"}`,
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
        `Token ${tokenQuery.data?.featured ? "removed from" : "added to"} featured tokens`,
      );
      tokenQuery.refetch(); // Refetch token data after update
    },
    onError: (error) => {
      toast.error(
        `Failed to update featured status: ${error instanceof Error ? error.message : "Unknown error"}`,
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
        `Token ${tokenQuery.data?.verified ? "unverified" : "verified"} successfully`,
      );
      tokenQuery.refetch(); // Refetch token data after update
    },
    onError: (error) => {
      toast.error(
        `Failed to update verified status: ${error instanceof Error ? error.message : "Unknown error"}`,
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
        `Token ${tokenQuery.data?.hidden ? "unhidden" : "hidden"} successfully`,
      );
      tokenQuery.refetch(); // Refetch token data after update
    },
    onError: (error) => {
      toast.error(
        `Failed to update hidden status: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  // Mutation for updating token details (name, ticker, image, url)
  const updateTokenDetailsMutation = useMutation({
    mutationFn: async (details: {
      name: string;
      ticker: string;
      image: string;
      url: string;
      description: string;
    }) => {
      // Add description to type
      return await fetcher(
        `/api/admin/tokens/${address}/details`,
        "PUT", // Use PUT method
        details,
      );
    },
    onSuccess: (data) => {
      // data contains { success, message, token }
      toast.success(`Token details updated successfully`);
      // Update original details state to prevent immediate re-save
      setOriginalDetails({
        name: data.token.name || "",
        ticker: data.token.ticker || "",
        image: data.token.image || "",
        url: data.token.url || "",
        description: data.token.description || "", // Update original description
      });
      // Invalidate query to refetch potentially changed data
      tokenQuery.refetch();
    },
    onError: (error) => {
      toast.error(
        `Failed to update token details: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  // --- NEW: Mutation for updating metadata JSON ---
  const updateMetadataMutation = useMutation({
    mutationFn: async (newMetadataString: string) => {
      // Use fetch directly to send raw string body
      const authToken = localStorage.getItem("authToken");
      const headers: Record<string, string> = {
        "Content-Type": "application/json", // Backend expects JSON string
        Accept: "application/json",
      };
      if (authToken) {
        headers["Authorization"] = `Bearer ${JSON.parse(authToken)}`;
      }

      const response = await fetch(
        `${env.apiUrl}/api/admin/tokens/${address}/metadata`,
        {
          method: "POST",
          headers,
          body: newMetadataString, // Send the raw string
          credentials: "include",
        },
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: `HTTP error ${response.status}` }));
        throw new Error(
          errorData.error || `Failed to update metadata (${response.status})`,
        );
      }
      return response.json(); // Contains { success, message, metadataUrl }
    },
    onSuccess: (data) => {
      toast.success(data.message || "Metadata updated successfully!");
      // Update original content to prevent immediate re-save
      // Re-format potentially un-prettified input string before saving as original
      let savedContent = metadataContent;
      try {
        savedContent = JSON.stringify(JSON.parse(metadataContent), null, 2);
        setMetadataContent(savedContent); // Update editor content to formatted version
      } catch (e) {
        /* Keep raw content if formatting fails */
      }
      setOriginalMetadataContent(savedContent);
      // No need to refetch tokenQuery data as the URL doesn't change
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to update metadata",
      );
    },
  });

  // Function to handle saving details
  const handleSaveDetails = () => {
    const payload = {
      name: editName,
      ticker: editTicker,
      image: editImage,
      url: editUrl,
      description: editDescription,
    };
    // Add console log here
    console.log("Saving details payload:", payload);
    updateTokenDetailsMutation.mutate(payload);
  };

  // Check if details form has changed
  const detailsChanged =
    editName !== originalDetails.name ||
    editTicker !== originalDetails.ticker ||
    editImage !== originalDetails.image ||
    editUrl !== originalDetails.url ||
    editDescription !== originalDetails.description; // Add description check

  // Check if metadata has changed
  const metadataChanged = metadataContent !== originalMetadataContent;

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
            {token.image && (
              <div className="flex items-center space-x-2">
                <span className="text-autofun-text-secondary">Image:</span>
                <img
                  src={token.image}
                  alt={token.name}
                  className="w-10 h-10 rounded-full object-cover ml-2"
                  onError={(e) => {
                    // Replace broken images with a placeholder
                    (e.target as HTMLImageElement).src = "/placeholder.png";
                  }}
                />
              </div>
            )}
            <div>
              <span className="text-autofun-text-secondary">ID:</span>
              <span className="ml-2">
                {token.txId || token.mint.substring(0, 8)}
              </span>
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
              <span className="text-autofun-text-secondary text-sm">
                Created:
              </span>
              <span className="ml-2 text-sm">
                {new Date(token.createdAt).toLocaleString()}
              </span>
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
            {/* Ticker (Editable) */}
            <div className="flex flex-col gap-1">
              <label className="text-autofun-text-secondary text-sm">
                Ticker:
              </label>
              <input
                type="text"
                value={editTicker}
                onChange={(e) => setEditTicker(e.target.value)}
                className="w-full bg-autofun-background-input py-2 px-3 border border-neutral-800 text-white"
                placeholder="Ticker"
              />
            </div>
            {/* Image URL (Editable) - ADD/Ensure this is here */}
            <div className="flex flex-col gap-1">
              <label className="text-autofun-text-secondary text-sm">
                Image URL:
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={editImage} // Bind to editImage state
                  onChange={(e) => setEditImage(e.target.value)} // Update editImage state
                  className="flex-grow bg-autofun-background-input py-2 px-3 border border-neutral-800 text-white"
                  placeholder="https://... or /placeholder.png"
                />
                {/* Image Preview */}
                <img
                  key={editImage} // Add key to force re-render on src change
                  src={editImage || "/placeholder.png"} // Use editImage state, fallback
                  alt="Preview"
                  className="w-10 h-10 rounded-full object-cover border border-neutral-700 flex-shrink-0"
                  onError={(e) => {
                    // Fallback if the URL in the input is invalid
                    (e.target as HTMLImageElement).src = "/placeholder.png";
                  }}
                />
              </div>
            </div>
            {/* Metadata URL (Editable) */}
            <div className="flex flex-col gap-1">
              <label className="text-autofun-text-secondary text-sm">
                URL:
              </label>
              <input
                type="text"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                className="w-full bg-autofun-background-input py-2 px-3 border border-neutral-800 text-white"
                placeholder="https://example.com"
              />
            </div>
            {/* Description (Editable) */}
            <div className="flex flex-col gap-1">
              <label className="text-autofun-text-secondary text-sm">
                Description:
              </label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="w-full bg-autofun-background-input py-2 px-3 border border-neutral-800 text-white min-h-[80px] resize-y"
                placeholder="Token description..."
                rows={3}
              />
            </div>

            {/* --- MOVE Save Details Button HERE --- */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSaveDetails}
                disabled={
                  updateTokenDetailsMutation.isPending || !detailsChanged
                }
                className="ml-auto cursor-pointer text-white bg-transparent gap-x-3 border-2 hover:bg-autofun-background-action-highlight border-autofun-background-action-highlight flex px-8 py-1 mt-2 flex-row w-fit items-center justify-items-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updateTokenDetailsMutation.isPending
                  ? "Saving..."
                  : "Save Details"}
              </button>
            </div>
            {/* --- END MOVE --- */}

            {/* Created Date (Not Editable) */}
            <div>{/* ... content ... */}</div>

            {/* Status Badges (Not Editable Here) */}
            <div className="flex flex-wrap gap-2 items-center pt-2">
              {/* ... badges ... */}
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

          {/* Metadata Editor Section (Moved Here) */}
          {token.imported !== 1 && token.url && (
            <div className="mt-6 pt-4 border-t border-autofun-border">
              <h3 className="text-lg font-medium mb-2">Metadata Editor</h3>
              <p className="text-sm text-autofun-text-secondary mb-2">
                Edit the content of the metadata file located at:{" "}
                <a
                  href={token.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-autofun-text-highlight hover:underline break-all"
                >
                  {token.url}
                </a>
              </p>
              {isLoadingMetadata && <Loader />}
              {metadataError && (
                <div className="p-3 bg-red-900/20 text-red-300 rounded mb-2">
                  Error loading metadata: {metadataError}
                </div>
              )}
              {!isLoadingMetadata && !metadataError && (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={metadataContent}
                    onChange={(e) => setMetadataContent(e.target.value)}
                    placeholder="Enter valid JSON metadata..."
                    className={`w-full bg-autofun-background-input p-3 border ${isMetadataJsonValid ? "border-neutral-800" : "border-red-700"} text-white font-mono text-sm min-h-[400px] max-h-[600px] resize-y`}
                  />
                  {!isMetadataJsonValid && metadataContent && (
                    <p className="text-xs text-red-400">
                      Content is not valid JSON.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      updateMetadataMutation.mutate(metadataContent)
                    }
                    disabled={
                      isLoadingMetadata ||
                      updateMetadataMutation.isPending ||
                      !metadataChanged ||
                      !isMetadataJsonValid
                    }
                    className="ml-auto cursor-pointer text-white bg-transparent gap-x-3 border-2 hover:bg-autofun-background-action-highlight border-autofun-background-action-highlight flex px-8 py-1 mt-1 flex-row w-fit items-center justify-items-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {updateMetadataMutation.isPending
                      ? "Saving Metadata..."
                      : "Save Metadata"}
                  </button>
                </div>
              )}
            </div>
          )}
          {/* --- End Metadata Editor Section --- */}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="p-4 bg-autofun-background-primary ">
          <h3 className="text-lg font-medium mb-2">Supply</h3>
          <p className="text-2xl font-bold text-autofun-text-highlight">
            {token.tokenSupplyUiAmount.toLocaleString()}
          </p>
          <p className="text-xs text-autofun-text-secondary">
            Decimals: {token.tokenDecimals ?? "N/A"}
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
            Reserve: {token.reserveLamport ?? "?"} SOL (Virtual:{" "}
            {token.virtualReserves ?? "?"} SOL)
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
