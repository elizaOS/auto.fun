import CopyButton from "@/components/copy-button";
import Loader from "@/components/loader";
import Pagination from "@/components/pagination";
import { usePagination, UsePaginationOptions } from "@/hooks/use-pagination";
import { IToken } from "@/types";
import { formatNumber, resizeImage } from "@/utils"; // Add fromNow and resizeImage
import { fetcher, getToken } from "@/utils/api";
import { env } from "@/utils/env"; // Import env
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react"; // Import icons
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import BondingCurveBar from "../bonding-curve-bar"; // Import BondingCurveBar
import Button from "../button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table"; // Import table components

type SortOrderType = "asc" | "desc";

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
  // State for sorting
  const [sortBy, setSortBy] = useState<keyof IToken | null>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrderType>("desc");
  const [hideImported, setHideImported] = useState(false);
  const queryClient = useQueryClient(); // Get query client instance

  // State for delete confirmation modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [tokenToDelete, setTokenToDelete] = useState<IToken | null>(null);

  // Prepare options for usePagination
  const paginationOptions: UsePaginationOptions<IToken> = {
    endpoint: "/api/admin/tokens", // Keep the admin endpoint
    limit: 50,
    sortBy: sortBy || "createdAt", // Default to createdAt if null
    sortOrder: sortOrder,
    itemsPropertyName: "tokens",
    useUrlState: true, // Keep URL state for admin page
    ...(hideImported && { hideImported: 1 }),
  };

  // Use the standard usePagination hook
  const tokensPagination = usePagination<IToken, IToken>(paginationOptions);

  // Sorting handler
  const handleSort = (columnKey: keyof IToken) => {
    if (sortBy === columnKey) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(columnKey);
      setSortOrder("desc"); // Default to desc when changing column
    }
  };

  // Sort icon component
  const SortIcon = ({ columnKey }: { columnKey: keyof IToken }) => {
    if (sortBy !== columnKey) return null;
    return sortOrder === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    );
  };

  // Mutation for toggling hidden status for a specific token
  const toggleHiddenMutation = useMutation({
    mutationFn: async (tokenAddress: string) => {
      const token = tokensPagination?.items?.find(
        (t) => t.mint === tokenAddress,
      );
      const currentHiddenStatus = token ? !!(token as any).hidden : false;
      return await fetcher(`/api/admin/tokens/${tokenAddress}/hidden`, "POST", {
        hidden: !currentHiddenStatus,
      });
    },
    onSuccess: (_, tokenAddress) => {
      const token = tokensPagination?.items?.find(
        (t) => t.mint === tokenAddress,
      );
      const currentHiddenStatus = token ? !!(token as any).hidden : false;
      toast.success(
        `Token ${currentHiddenStatus ? "unhidden" : "hidden"} successfully`,
      );
      queryClient.invalidateQueries({
        queryKey: [paginationOptions.endpoint],
        refetchType: "active",
      });
    },
    onError: (error, tokenAddress) => {
      toast.error(
        `Failed to update hidden status for token ${tokenAddress}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  // --- NEW: Mutation for deleting a token ---
  const deleteTokenMutation = useMutation({
    mutationFn: async (tokenAddress: string) => {
      return await fetcher(`/api/admin/tokens/${tokenAddress}`, "DELETE");
    },
    onSuccess: (_, tokenAddress) => {
      toast.success(
        `Token ${tokenAddress.substring(0, 6)}... deleted successfully`,
      );
      queryClient.invalidateQueries({
        queryKey: [paginationOptions.endpoint],
        refetchType: "active",
      });
      setIsDeleteModalOpen(false);
      setTokenToDelete(null);
    },
    onError: (error, tokenAddress) => {
      toast.error(
        `Failed to delete token ${tokenAddress.substring(0, 6)}...: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      setIsDeleteModalOpen(false);
      setTokenToDelete(null);
    },
  });

  // Function to open delete modal
  const openDeleteModal = (token: IToken) => {
    setTokenToDelete(token);
    setIsDeleteModalOpen(true);
  };

  // Function to handle confirmed delete
  const handleConfirmDelete = () => {
    if (tokenToDelete) {
      deleteTokenMutation.mutate(tokenToDelete.mint);
    }
  };

  if (tokensPagination?.isLoading) {
    return <Loader />;
  }

  return (
    <div className="p-4 bg-autofun-background-input ">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Tokens</h2>
        <div className="flex space-x-4">
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
        <Table>
          <TableHeader>
            <tr className="border-b border-autofun-background-primary">
              <TableHead className="text-left p-2">ID</TableHead>
              <TableHead className="text-left p-2">Name</TableHead>
              <TableHead className="text-left p-2">
                <button
                  className="flex items-center gap-1 hover:text-autofun-text-primary transition-colors uppercase"
                  onClick={() => handleSort("marketCapUSD")}
                >
                  MCap
                  <SortIcon columnKey="marketCapUSD" />
                </button>
              </TableHead>
              <TableHead className="text-left p-2">
                <button
                  className="flex items-center gap-1 hover:text-autofun-text-primary transition-colors uppercase"
                  onClick={() => handleSort("volume24h")}
                >
                  24H Vol
                  <SortIcon columnKey="volume24h" />
                </button>
              </TableHead>
              <TableHead className="text-left p-2">
                <button
                  className="flex items-center gap-1 hover:text-autofun-text-primary transition-colors uppercase"
                  onClick={() => handleSort("curveProgress")}
                >
                  Bonding
                  <SortIcon columnKey="curveProgress" />
                </button>
              </TableHead>
              <TableHead className="text-left p-2">
                <button
                  className="flex items-center gap-1 hover:text-autofun-text-primary transition-colors uppercase"
                  onClick={() => handleSort("createdAt")}
                >
                  Created
                  <SortIcon columnKey="createdAt" />
                </button>
              </TableHead>
              <TableHead className="text-left p-2">Status</TableHead>
              <TableHead className="text-left p-2">Actions</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {tokensPagination?.items?.map((token: IToken) => (
              <TableRow
                key={token.mint}
                className="border-b border-autofun-background-primary"
              >
                <TableCell className="p-2 font-mono text-xs">
                  {token.mint.substring(0, 8)}...
                </TableCell>
                <TableCell className="p-2">
                  <div className="flex items-center space-x-2">
                    {token.image ? (
                      <img
                        src={token?.image || "/placeholder.png"}
                        alt={token.name || "Token Image"}
                        className="w-6 h-6 rounded-full object-cover"
                      />
                    ) : (
                      <div className="size-6 bg-autofun-background-disabled" />
                    )}
                    <span>{token.name}</span>
                    <span className="text-xs text-autofun-text-secondary">
                      (${token.ticker})
                    </span>
                  </div>
                </TableCell>
                <TableCell className="p-2 text-left">
                  {formatNumber(token.marketCapUSD)}
                </TableCell>
                <TableCell className="p-2 text-left">
                  {formatNumber(token.volume24h)}
                </TableCell>
                <TableCell className="p-2 text-left">
                  {token.imported === 0 && (
                    <BondingCurveBar progress={token.curveProgress} />
                  )}
                </TableCell>
                <TableCell className="p-2">
                  {token.createdAt
                    ? new Date(token.createdAt).toLocaleDateString()
                    : "-"}
                </TableCell>
                <TableCell className="p-2">
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
                </TableCell>
                <TableCell className="p-2 flex items-center space-x-2 justify-end">
                  <Link
                    to={`/admin/tokens/${token.mint}`}
                    className="text-autofun-text-highlight hover:underline p-2"
                  >
                    View
                  </Link>
                  <button
                    className={`px-2 py-1 text-xs ${
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
                  {/* --- NEW: Delete Button --- */}
                  <button
                    className="p-1 text-red-500 hover:text-red-400 disabled:opacity-50"
                    onClick={() => openDeleteModal(token)}
                    disabled={
                      deleteTokenMutation.isPending &&
                      deleteTokenMutation.variables === token.mint
                    }
                    title="Delete Token"
                  >
                    <Trash2 size={16} />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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

      {/* --- NEW: Delete Confirmation Modal --- */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center">
          <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
            <DialogContent className="sm:max-w-[425px] bg-autofun-background-primary border-autofun-border p-4">
              <DialogTitle>Confirm Deletion</DialogTitle>
              <DialogDescription>
                Are you sure you want to permanently delete this token? This
                action cannot be undone.
              </DialogDescription>
              {tokenToDelete && (
                <div className="flex items-center space-x-3 my-4 p-3 bg-autofun-background-input rounded">
                  <img
                    src={
                      tokenToDelete.image
                        ? resizeImage(tokenToDelete.image, 40, 40)
                        : "/placeholder.png"
                    }
                    alt={tokenToDelete.name || "Token Image"}
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/placeholder.png";
                    }}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">
                      {tokenToDelete.name}
                    </span>
                    <span className="text-xs text-autofun-text-secondary truncate">
                      (${tokenToDelete.ticker})
                    </span>
                    <span className="text-xs text-autofun-text-secondary font-mono truncate">
                      {tokenToDelete.mint}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <DialogClose asChild>
                  <Button
                    variant="outline"
                    onClick={() => setTokenToDelete(null)}
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  onClick={handleConfirmDelete}
                  disabled={deleteTokenMutation.isPending}
                >
                  {deleteTokenMutation.isPending
                    ? "Deleting..."
                    : "Delete Token"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
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
  const navigate = useNavigate();

  // State for the new image upload
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedImageBase64, setSelectedImageBase64] = useState<string | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null); // Ref for file input

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

        // Only update state if the corresponding input isn't focused
        // to prevent overwriting user edits during refetch
        if (document.activeElement?.id !== "edit-name") {
          setEditName(tokenData.name || "");
        }
        if (document.activeElement?.id !== "edit-ticker") {
          setEditTicker(tokenData.ticker || "");
        }
        // Image is updated via upload or direct URL edit, don't overwrite during refetch if focused
        if (document.activeElement?.id !== "edit-image-url") {
          setEditImage(tokenData.image || "");
        }
        if (document.activeElement?.id !== "edit-url") {
          setEditUrl(tokenData.url || "");
        }
        if (document.activeElement?.id !== "edit-description") {
          setEditDescription(tokenData.description || "");
        }

        // Update original details ONLY IF they haven't been set yet OR the fetched data differs significantly
        // This helps prevent stale `originalDetails` if a save happened between refetches
        if (
          !originalDetails.name || // First load
          originalDetails.name !== (tokenData.name || "") ||
          originalDetails.ticker !== (tokenData.ticker || "") ||
          originalDetails.image !== (tokenData.image || "") ||
          originalDetails.url !== (tokenData.url || "") ||
          originalDetails.description !== (tokenData.description || "")
        ) {
          setOriginalDetails({
            name: tokenData.name || "",
            ticker: tokenData.ticker || "",
            image: tokenData.image || "",
            url: tokenData.url || "",
            description: tokenData.description || "",
          });
        }

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
        tokenQuery.data.imported !== 1 &&
        !tokenQuery.data.url.startsWith("data:") // Avoid fetching data URLs
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
      toast.success(data.message || `Token details updated successfully`);
      // Update edit fields AND original details state to prevent immediate re-save
      const updatedToken = data.token as AdminToken; // Cast to ensure type
      setEditName(updatedToken.name || "");
      setEditTicker(updatedToken.ticker || "");
      setEditImage(updatedToken.image || "");
      setEditUrl(updatedToken.url || "");
      setEditDescription(updatedToken.description || "");
      setOriginalDetails({
        name: updatedToken.name || "",
        ticker: updatedToken.ticker || "",
        image: updatedToken.image || "",
        url: updatedToken.url || "",
        description: updatedToken.description || "",
      });

      // Optionally refetch all token data if needed, though optimistic update might suffice
      // tokenQuery.refetch();
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
      setOriginalMetadataContent(savedContent); // Update original on success
      setIsMetadataJsonValid(true); // Should be valid if save succeeded
      // No need to refetch tokenQuery data as the URL doesn't change
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to update metadata",
      );
    },
  });

  // --- NEW: Mutation for uploading token image ---
  const uploadImageMutation = useMutation({
    mutationFn: async (imageBase64: string) => {
      if (!imageBase64) throw new Error("No image data provided");
      return await fetcher(
        `/api/admin/tokens/${address}/image`,
        "POST",
        { imageBase64 }, // Send base64 data in the body
      );
    },
    onSuccess: (data) => {
      // data contains { success, message, imageUrl, token }
      toast.success(data.message || "Image uploaded successfully!");
      const newImageUrl = data.imageUrl;
      // Update state with the new URL
      setEditImage(newImageUrl);
      setOriginalDetails((prev) => ({ ...prev, image: newImageUrl })); // Update original as well
      // Clear the file input and preview
      setSelectedImageFile(null);
      setSelectedImageBase64(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = ""; // Reset file input
      }
      // Refetch might not be strictly necessary if backend returns full token,
      // but good for consistency if other fields could change implicitly
      // tokenQuery.refetch();
    },
    onError: (error) => {
      toast.error(
        `Failed to upload image: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      // Clear selection on error?
      // setSelectedImageFile(null);
      // setSelectedImageBase64(null);
    },
  });

  // --- Helper function to handle image selection ---
  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Basic validation (type, size)
      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file.");
        return;
      }
      // Example size limit: 5MB
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image file size should not exceed 5MB.");
        return;
      }

      setSelectedImageFile(file);

      // Read file as base64 for preview and upload
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImageBase64(reader.result as string);
      };
      reader.onerror = () => {
        toast.error("Failed to read image file.");
        setSelectedImageFile(null);
        setSelectedImageBase64(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Function to trigger image upload
  const handleImageUpload = () => {
    if (selectedImageBase64) {
      uploadImageMutation.mutate(selectedImageBase64);
    }
  };

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

  const token = tokenQuery.data;

  // Add delete token mutation
  const deleteTokenMutation = useMutation({
    mutationFn: async () => {
      return await fetcher(`/api/admin/tokens/${address}`, "DELETE");
    },
    onSuccess: () => {
      toast.success("Token deleted successfully");
      // Redirect to admin tokens page after deletion
      navigate("/admin/tokens");
    },
    onError: (error) => {
      toast.error(
        `Failed to delete token: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  // Add this after other button mutations
  const handleDeleteToken = () => {
    if (
      window.confirm(
        "Are you sure you want to delete this token? This action cannot be undone.",
      )
    ) {
      deleteTokenMutation.mutate();
    }
  };

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
                  alt={token.name || "Token Image"}
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
              <label
                htmlFor="edit-ticker"
                className="text-autofun-text-secondary text-sm"
              >
                Ticker:
              </label>
              <input
                id="edit-ticker" // Add ID for focus check
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
                Image URL (or Upload New):
              </label>
              <div className="flex items-center space-x-2">
                <input
                  id="edit-image-url" // Add ID for focus check
                  type="text"
                  value={editImage} // Bind to editImage state
                  onChange={(e) => setEditImage(e.target.value)} // Update editImage state
                  className="flex-grow bg-autofun-background-input py-2 px-3 border border-neutral-800 text-white"
                  placeholder="https://... or /placeholder.png"
                />
                {/* Image Preview */}
                <img
                  key={`preview-${editImage}`} // Add key to force re-render on src change
                  src={editImage || "/placeholder.png"} // Use editImage state, fallback
                  alt="Preview"
                  className="w-10 h-10 rounded-full object-cover border border-neutral-700 flex-shrink-0"
                  onError={(e) => {
                    // Fallback if the URL in the input is invalid
                    (e.target as HTMLImageElement).src = "/placeholder.png";
                  }}
                />
              </div>
              {/* --- NEW: Image Uploader --- */}
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="file"
                  accept="image/*" // Accept only image files
                  ref={fileInputRef}
                  onChange={handleImageSelect}
                  className="hidden" // Hide default input
                  id="image-upload-input"
                />
                {/* Custom Button to Trigger File Input */}
                <Button
                  variant="outline"
                  size="small"
                  onClick={() => fileInputRef.current?.click()} // Trigger hidden input
                  type="button"
                  disabled={uploadImageMutation.isPending}
                >
                  Choose Image
                </Button>
                {/* Preview of selected image */}
                {selectedImageBase64 && (
                  <img
                    src={selectedImageBase64}
                    alt="Selected preview"
                    className="w-10 h-10 rounded-full object-cover border border-neutral-600"
                  />
                )}
                {/* Upload Button (only shows if image selected) */}
                {selectedImageFile && (
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={handleImageUpload}
                    disabled={
                      !selectedImageBase64 || uploadImageMutation.isPending
                    }
                    type="button"
                  >
                    {uploadImageMutation.isPending
                      ? "Uploading..."
                      : "Upload Selected"}
                  </Button>
                )}
              </div>
              {/* --- END: Image Uploader --- */}
            </div>
            {/* Metadata URL (Editable) */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="edit-url"
                className="text-autofun-text-secondary text-sm"
              >
                URL:
              </label>
              <input
                id="edit-url" // Add ID for focus check
                type="text"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                className="w-full bg-autofun-background-input py-2 px-3 border border-neutral-800 text-white"
                placeholder="https://example.com"
              />
            </div>
            {/* Description (Editable) */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="edit-description"
                className="text-autofun-text-secondary text-sm"
              >
                Description:
              </label>
              <textarea
                id="edit-description" // Add ID for focus check
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="w-full bg-autofun-background-input py-2 px-3 border border-neutral-800 text-white min-h-[80px] resize-y"
                placeholder="Token description..."
                rows={3}
              />
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
          {token.creator && (
            <div className="flex items-center justify-between p-2 bg-autofun-background-input ">
              <span className="font-mono text-sm truncate">
                {token.creator}
              </span>
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
          )}

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
                <div className="p-3 bg-red-900/20 text-red-300 mb-2">
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

        <button
          className="px-4 py-2 bg-red-900 text-red-300 hover:bg-red-800 flex items-center gap-2"
          onClick={handleDeleteToken}
          disabled={deleteTokenMutation.isPending}
        >
          <Trash2 className="h-4 w-4" />
          {deleteTokenMutation.isPending ? "Deleting..." : "Delete Token"}
        </button>
      </div>

      {/* Save Details Button */}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleSaveDetails}
          disabled={updateTokenDetailsMutation.isPending || !detailsChanged}
          className="cursor-pointer text-white bg-transparent gap-x-3 border-2 hover:bg-autofun-background-action-highlight border-autofun-background-action-highlight flex px-8 py-1 mt-1 flex-row w-fit items-center justify-items-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {updateTokenDetailsMutation.isPending
            ? "Saving Details..."
            : "Save Details"}
        </button>
      </div>
    </div>
  );
}
