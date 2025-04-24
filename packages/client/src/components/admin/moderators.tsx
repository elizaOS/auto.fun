import { useState } from "react";
import { toast } from "react-toastify";
import { useQuery, useMutation } from "@tanstack/react-query";
import useAuthentication from "@/hooks/use-authentication";
import { env } from "@/utils/env";
import { fetcher } from "@/utils/api";
import Loader from "@/components/loader";

interface Moderator {
  id: string;
  address: string;
  name?: string;
  isAdmin: boolean;
  createdAt: string;
}

export default function AdminModerators() {
  const [newModeratorAddress, setNewModeratorAddress] = useState("");
  const { walletAddress } = useAuthentication();
  const isAdmin = walletAddress && env.adminAddresses.includes(walletAddress);

  // Fetch moderators using react-query
  const moderatorsQuery = useQuery({
    queryKey: ["admin-moderators"],
    queryFn: async () => {
      const response = await fetcher("/api/admin/moderators", "GET");
      return response.moderators || [];
    },
  });

  // Add moderator mutation
  const addModeratorMutation = useMutation({
    mutationFn: async (address: string) => {
      return await fetcher("/api/admin/moderators", "POST", { address });
    },
    onSuccess: () => {
      toast.success("Moderator added successfully");
      setNewModeratorAddress("");
      moderatorsQuery.refetch();
    },
    onError: (error) => {
      toast.error(
        `Failed to add moderator: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  // Remove moderator mutation
  const removeModeratorMutation = useMutation({
    mutationFn: async (address: string) => {
      return await fetcher(`/api/admin/moderators/${address}`, "DELETE");
    },
    onSuccess: () => {
      toast.success("Moderator removed successfully");
      moderatorsQuery.refetch();
    },
    onError: (error) => {
      toast.error(
        `Failed to remove moderator: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  const addModerator = () => {
    if (!newModeratorAddress || newModeratorAddress.trim().length < 32) {
      toast.error("Please enter a valid wallet address");
      return;
    }
    addModeratorMutation.mutate(newModeratorAddress.trim());
  };

  const removeModerator = (address: string) => {
    if (!window.confirm(`Are you sure you want to remove this moderator?`)) {
      return;
    }
    removeModeratorMutation.mutate(address);
  };

  return (
    <div className="p-4 bg-autofun-background-input">
      <div className="flex flex-col gap-6">
        {/* Header with title */}
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Manage Moderators</h2>
        </div>

        {/* Show error if query failed */}
        {moderatorsQuery.isError && (
          <div className="bg-autofun-error/10 border border-autofun-error text-autofun-error p-4 rounded-md">
            <p className="font-semibold">Error:</p>
            <p>
              {moderatorsQuery.error instanceof Error
                ? moderatorsQuery.error.message
                : "Failed to load moderators"}
            </p>
          </div>
        )}

        {/* Add new moderator form (only shown to admins) */}
        {isAdmin && (
          <div>
            <h3 className="text-lg font-medium mb-3">Add New Moderator</h3>
            <div className="flex gap-2 mb-6">
              <input
                type="text"
                placeholder="Enter wallet address"
                className="flex-1 rounded-md bg-autofun-background-primary border border-autofun-border p-2 h-10"
                value={newModeratorAddress}
                onChange={(e) => setNewModeratorAddress(e.target.value)}
              />
              <button
                className="bg-autofun-background-primary hover:bg-autofun-background-secondary text-white px-4 py-2 rounded-md disabled:opacity-50 h-10"
                onClick={addModerator}
                disabled={
                  addModeratorMutation.isPending || !newModeratorAddress
                }
              >
                {addModeratorMutation.isPending
                  ? "Adding..."
                  : "Add New Moderator"}
              </button>
            </div>
          </div>
        )}

        {!isAdmin && (
          <div className="bg-autofun-background-secondary/50 border border-autofun-border rounded-lg p-4 mb-6">
            <p className="text-autofun-text-secondary italic">
              Only administrators can add or remove moderators. Moderators can
              view this list but cannot modify it.
            </p>
          </div>
        )}

        {/* Moderators list */}
        <div>
          <h3 className="text-lg font-medium mb-3">Current Moderators</h3>
          {moderatorsQuery.isLoading ? (
            <Loader />
          ) : moderatorsQuery.data?.length === 0 ? (
            <div className="text-center py-4 text-autofun-text-secondary">
              No moderators found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-autofun-border">
                    <th className="py-3 px-4">Address</th>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Added On</th>
                    {isAdmin && <th className="py-3 px-4">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {moderatorsQuery.data?.map((moderator: Moderator) => (
                    <tr
                      key={moderator.id}
                      className="border-b border-autofun-border"
                    >
                      <td className="py-3 px-4 font-mono">
                        {moderator.address.slice(0, 8)}...
                        {moderator.address.slice(-8)}
                      </td>
                      <td className="py-3 px-4">{moderator.name || "—"}</td>
                      <td className="py-3 px-4">
                        {moderator.isAdmin ? (
                          <span className="bg-autofun-success/20 text-autofun-success px-2 py-1 rounded text-xs">
                            Admin
                          </span>
                        ) : (
                          <span className="bg-autofun-info/20 text-autofun-info px-2 py-1 rounded text-xs">
                            Moderator
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {new Date(moderator.createdAt).toLocaleDateString()}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4">
                          {!moderator.isAdmin ? (
                            <button
                              onClick={() => removeModerator(moderator.address)}
                              className="text-green-500 hover:text-green-600"
                              disabled={removeModeratorMutation.isPending}
                            >
                              {removeModeratorMutation.isPending
                                ? "Removing..."
                                : "Remove"}
                            </button>
                          ) : (
                            <button
                              className="text-gray-400 cursor-not-allowed"
                              disabled={true}
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {moderatorsQuery.data?.length > 0 && isAdmin && (
          <div className="text-sm text-autofun-text-secondary mt-2">
            Note: Administrators (marked in green) cannot be removed from the
            moderators list.
          </div>
        )}
      </div>
    </div>
  );
}
