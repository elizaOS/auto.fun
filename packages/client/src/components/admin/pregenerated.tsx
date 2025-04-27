import Loader from "@/components/loader";
import Pagination from "@/components/pagination";
import { fetcher } from "@/utils/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Search, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";

// Interface matching the PreGeneratedToken from the database
interface PreGeneratedToken {
  id: string;
  name: string;
  ticker: string;
  description: string;
  prompt: string;
  image: string | null;
  createdAt: string;
  used: number; // 0 or 1
}

// Interface for pagination response
interface PaginatedTokensResponse {
  tokens: PreGeneratedToken[];
  page: number;
  totalPages: number;
  total: number;
  hasMore: boolean;
}

export default function AdminPregenerated() {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<keyof PreGeneratedToken | string>(
    "createdAt",
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [filterUsed, setFilterUsed] = useState<"all" | "true" | "false">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingToken, setEditingToken] = useState<PreGeneratedToken | null>(
    null,
  );
  const [editFormState, setEditFormState] = useState({
    name: "",
    ticker: "",
    description: "",
    prompt: "",
    image: "",
  });
  const queryClient = useQueryClient();

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      // Reset to first page when search changes
      setCurrentPage(1);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);

  // Fetch pre-generated tokens
  const {
    data: tokensData,
    isLoading,
    error,
  } = useQuery<PaginatedTokensResponse>({
    queryKey: [
      "admin-pregenerated",
      currentPage,
      sortBy,
      sortOrder,
      filterUsed,
      debouncedSearchQuery,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: "50",
        sortBy,
        sortOrder,
      });

      if (filterUsed !== "all") {
        params.append("used", filterUsed);
      }

      if (debouncedSearchQuery) {
        params.append("search", debouncedSearchQuery);
      }

      const response = await fetcher(
        `/api/admin/pregenerated?${params.toString()}`,
        "GET",
      );
      return response as PaginatedTokensResponse;
    },
    // Replace keepPreviousData with placeholderData (this is the React Query v4 approach)
    placeholderData: (prev) => prev,
    staleTime: 30 * 1000, // 30 seconds
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetcher(`/api/admin/pregenerated/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("Token deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-pregenerated"] });
    },
    onError: (error) => {
      toast.error(
        `Failed to delete token: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  // Generate more tokens mutation
  const generateMutation = useMutation({
    mutationFn: () =>
      fetcher("/api/admin/pregenerated/generate", "POST", { force: true }),
    onSuccess: () => {
      toast.success("Token generation process initiated");
      // Poll for updates a few times to refresh the token list
      const checkForNewTokens = () => {
        queryClient.invalidateQueries({ queryKey: ["admin-pregenerated"] });
      };

      // Poll a few times with delays to catch the new tokens
      setTimeout(checkForNewTokens, 5000); // After 5 seconds
      setTimeout(checkForNewTokens, 10000); // After 10 seconds
      setTimeout(checkForNewTokens, 20000); // After 20 seconds
    },
    onError: (error) => {
      console.error("Generation error:", error);
      toast.error(
        `Failed to generate tokens: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  // Edit token mutation
  const editMutation = useMutation({
    mutationFn: (data: { id: string; updates: Partial<PreGeneratedToken> }) =>
      fetcher(`/api/admin/pregenerated/${data.id}`, "PUT", data.updates),
    onSuccess: () => {
      toast.success("Token updated successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-pregenerated"] });
      closeEditModal();
    },
    onError: (error) => {
      toast.error(
        `Failed to update token: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  const openEditModal = (token: PreGeneratedToken) => {
    setEditingToken(token);
    setEditFormState({
      name: token.name,
      ticker: token.ticker,
      description: token.description || "",
      prompt: token.prompt || "",
      image: token.image || "",
    });
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditingToken(null);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingToken) return;

    // Only include fields that have changed
    const updates: Partial<PreGeneratedToken> = {};
    if (editFormState.name !== editingToken.name)
      updates.name = editFormState.name;
    if (editFormState.ticker !== editingToken.ticker)
      updates.ticker = editFormState.ticker;
    if (editFormState.description !== editingToken.description)
      updates.description = editFormState.description;
    if (editFormState.prompt !== editingToken.prompt)
      updates.prompt = editFormState.prompt;
    if (editFormState.image !== editingToken.image)
      updates.image = editFormState.image;

    if (Object.keys(updates).length === 0) {
      closeEditModal();
      return;
    }

    editMutation.mutate({ id: editingToken.id, updates });
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Are you sure you want to delete this token?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleSort = (column: keyof PreGeneratedToken | string) => {
    if (sortBy === column) {
      // Toggle sort order if clicking the same column
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      // Set new sort column with default desc order
      setSortBy(column);
      setSortOrder("desc");
    }
    // Reset to first page when sort changes
    setCurrentPage(1);
  };

  const getSortIndicator = (column: keyof PreGeneratedToken | string) => {
    if (sortBy !== column) return null;
    return sortOrder === "asc" ? " ▲" : " ▼";
  };

  // Show loader or error when appropriate
  if (isLoading && !tokensData) return <Loader />;
  if (error)
    return (
      <div className="p-4 text-red-500">
        Error loading tokens:{" "}
        {error instanceof Error ? error.message : "Unknown error"}
      </div>
    );

  // Safely access the response data with type assertion
  const tokens = tokensData?.tokens || [];
  const totalPages = tokensData?.totalPages || 1;
  const totalItems = tokensData?.total || 0;
  const hasMore = tokensData?.hasMore || false;

  return (
    <div className="p-4 bg-autofun-background-input">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
        <h2 className="text-xl font-bold">Pre-generated Tokens</h2>
        <div className="flex items-center space-x-4">
          {/* Search input */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="bg-autofun-background-primary text-autofun-text-primary px-3 py-2 pl-8"
            />
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-autofun-text-secondary h-4 w-4" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-autofun-text-secondary hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter dropdown */}
          <select
            value={filterUsed}
            onChange={(e) => {
              setFilterUsed(e.target.value as "all" | "true" | "false");
              setCurrentPage(1); // Reset to first page when filter changes
            }}
            className="bg-autofun-background-primary text-autofun-text-primary px-3 py-2"
          >
            <option value="all">All Tokens</option>
            <option value="true">Used Only</option>
            <option value="false">Unused Only</option>
          </select>

          {/* Generate button */}
          <button
            onClick={() => {
              toast.info(
                "Starting token generation, this may take a minute...",
              );
              generateMutation.mutate();
            }}
            disabled={generateMutation.isPending}
            className="px-4 py-2 bg-autofun-background-action-primary text-autofun-text-primary hover:bg-autofun-background-action-highlight disabled:opacity-50"
          >
            {generateMutation.isPending ? "Generating..." : "Generate More"}
          </button>
        </div>
      </div>

      {/* Tokens table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-autofun-background-primary">
              <th
                className="text-left p-2 cursor-pointer"
                onClick={() => handleSort("id")}
              >
                ID{getSortIndicator("id")}
              </th>
              <th
                className="text-left p-2 cursor-pointer"
                onClick={() => handleSort("name")}
              >
                Name{getSortIndicator("name")}
              </th>
              <th
                className="text-left p-2 cursor-pointer"
                onClick={() => handleSort("ticker")}
              >
                Ticker{getSortIndicator("ticker")}
              </th>
              <th className="text-left p-2">Description</th>
              <th className="text-left p-2">Prompt</th>
              <th className="text-left p-2">Image</th>
              <th
                className="text-left p-2 cursor-pointer"
                onClick={() => handleSort("createdAt")}
              >
                Created{getSortIndicator("createdAt")}
              </th>
              <th
                className="text-left p-2 cursor-pointer"
                onClick={() => handleSort("used")}
              >
                Used{getSortIndicator("used")}
              </th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="text-center p-4 text-autofun-text-secondary"
                >
                  No pre-generated tokens found.
                </td>
              </tr>
            ) : (
              tokens.map((token: PreGeneratedToken) => (
                <tr
                  key={token.id}
                  className="border-b border-autofun-background-primary hover:bg-autofun-background-secondary/10"
                >
                  <td className="p-2 font-mono text-xs" title={token.id}>
                    {token.id.substring(0, 8)}...
                  </td>
                  <td className="p-2 max-w-[150px] truncate" title={token.name}>
                    {token.name}
                  </td>
                  <td className="p-2">{token.ticker}</td>
                  <td
                    className="p-2 max-w-[200px] truncate"
                    title={token.description}
                  >
                    {token.description}
                  </td>
                  <td
                    className="p-2 max-w-[200px] truncate"
                    title={token.prompt}
                  >
                    {token.prompt}
                  </td>
                  <td className="p-2">
                    {token.image ? (
                      <img
                        src={token.image}
                        alt={token.name}
                        className="w-8 h-8 object-cover rounded-full"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "/placeholder.png";
                        }}
                      />
                    ) : (
                      <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-xs">
                        ?
                      </div>
                    )}
                  </td>
                  <td className="p-2">
                    {new Date(token.createdAt).toLocaleDateString()}
                  </td>
                  <td className="p-2 flex items-center space-x-2">
                    <button
                      onClick={() => openEditModal(token)}
                      className="text-blue-400 hover:text-blue-300"
                      title="Edit Token"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(token.id)}
                      disabled={deleteMutation.isPending}
                      className="text-red-500 hover:text-red-400 disabled:opacity-50"
                      title="Delete Token"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <div className="text-sm text-autofun-text-secondary">
            Showing {tokens.length} of {totalItems} tokens
          </div>
          <Pagination
            pagination={{
              page: currentPage,
              totalPages,
              total: totalItems,
              hasMore: hasMore,
            }}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {/* Edit Modal */}
      {editModalOpen && editingToken && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-autofun-background-primary p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Edit Token</h3>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={editFormState.name}
                  onChange={(e) =>
                    setEditFormState({ ...editFormState, name: e.target.value })
                  }
                  className="w-full p-2 bg-autofun-background-input text-white border border-neutral-700"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Ticker</label>
                <input
                  type="text"
                  value={editFormState.ticker}
                  onChange={(e) =>
                    setEditFormState({
                      ...editFormState,
                      ticker: e.target.value,
                    })
                  }
                  className="w-full p-2 bg-autofun-background-input text-white border border-neutral-700"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Description
                </label>
                <textarea
                  value={editFormState.description}
                  onChange={(e) =>
                    setEditFormState({
                      ...editFormState,
                      description: e.target.value,
                    })
                  }
                  className="w-full p-2 bg-autofun-background-input text-white border border-neutral-700 min-h-[80px]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Prompt</label>
                <textarea
                  value={editFormState.prompt}
                  onChange={(e) =>
                    setEditFormState({
                      ...editFormState,
                      prompt: e.target.value,
                    })
                  }
                  className="w-full p-2 bg-autofun-background-input text-white border border-neutral-700 min-h-[100px] font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Image URL
                </label>
                <input
                  type="text"
                  value={editFormState.image}
                  onChange={(e) =>
                    setEditFormState({
                      ...editFormState,
                      image: e.target.value,
                    })
                  }
                  className="w-full p-2 bg-autofun-background-input text-white border border-neutral-700"
                />
                {editFormState.image && (
                  <div className="mt-2">
                    <img
                      src={editFormState.image}
                      alt="Preview"
                      className="h-16 w-16 object-cover border border-neutral-600"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/placeholder.png";
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="px-4 py-2 border border-neutral-700 hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editMutation.isPending}
                  className="px-4 py-2 bg-autofun-background-action-primary hover:bg-autofun-background-action-highlight disabled:opacity-50"
                >
                  {editMutation.isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
