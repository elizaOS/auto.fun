import { Link, Route, Routes, useLocation, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AdminOverview from "../components/admin/overview";
import AdminUsers from "../components/admin/users";
import AdminTokens from "../components/admin/tokens";
import AdminPregenerated from "../components/admin/pregenerated";
import AdminModerators from "../components/admin/moderators";
import useAuthentication from "@/hooks/use-authentication";
import { env } from "@/utils/env";
import { fetcher } from "@/utils/api";
import Loader from "@/components/loader";

// Use admin addresses from environment
const { adminAddresses } = env;

export default function Admin() {
  const location = useLocation();
  const currentPath = location.pathname;

  const { walletAddress } = useAuthentication();
  
  // Check if the user is an admin (client-side check)
  const isAdmin = walletAddress && adminAddresses.includes(walletAddress);
  
  // Fetch moderator status if not an admin
  const moderatorQuery = useQuery({
    queryKey: ["user-moderator-status", walletAddress],
    queryFn: async () => {
      if (!walletAddress || isAdmin) return { isModerator: false };
      try {
        const response = await fetcher(`/api/admin/users/${walletAddress}`, "GET");
        return { isModerator: response.user?.isModerator === 1 };
      } catch (error) {
        console.error("Error checking moderator status:", error);
        return { isModerator: false };
      }
    },
    enabled: !!walletAddress && !isAdmin
  });

  // Helper function to determine if a link is active
  const isActive = (path: string) => {
    if (path === "/admin" && currentPath === "/admin") {
      return true;
    }
    if (path !== "/admin" && currentPath.startsWith(path)) {
      return true;
    }
    return false;
  };

  // If the query is still loading, show a loading state
  if (moderatorQuery.isLoading && !isAdmin) {
    return <div className="flex justify-center items-center h-screen"><Loader /></div>;
  }

  // Check if user has access (either admin or moderator)
  const isModerator = moderatorQuery.data?.isModerator || false;
  const hasAccess = isAdmin || isModerator;

  // If not authenticated or doesn't have access, redirect to home page
  if (!walletAddress || !hasAccess) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      <div className="flex items-center gap-2 border-b border-autofun-background-action-primary pb-2 flex-wrap">
        <Link
          to="/admin"
          className={`px-4 py-2 rounded-t-md ${
            isActive("/admin") && !currentPath.includes("/admin/")
              ? "bg-autofun-background-highlight text-black"
              : "bg-autofun-background-primary hover:bg-autofun-background-action-primary"
          }`}
        >
          Overview
        </Link>
        <Link
          to="/admin/users"
          className={`px-4 py-2 rounded-t-md ${
            isActive("/admin/users")
              ? "bg-autofun-background-highlight text-black"
              : "bg-autofun-background-primary hover:bg-autofun-background-action-primary"
          }`}
        >
          Users
        </Link>
        <Link
          to="/admin/tokens"
          className={`px-4 py-2 rounded-t-md ${
            isActive("/admin/tokens")
              ? "bg-autofun-background-highlight text-black"
              : "bg-autofun-background-primary hover:bg-autofun-background-action-primary"
          }`}
        >
          Tokens
        </Link>
        <Link
          to="/admin/pregenerated"
          className={`px-4 py-2 rounded-t-md ${
            isActive("/admin/pregenerated")
              ? "bg-autofun-background-highlight text-black"
              : "bg-autofun-background-primary hover:bg-autofun-background-action-primary"
          }`}
        >
          Pre-generated
        </Link>
        {isAdmin && (
          <Link
            to="/admin/moderators"
            className={`px-4 py-2 rounded-t-md ${
              isActive("/admin/moderators")
                ? "bg-autofun-background-highlight text-black"
                : "bg-autofun-background-primary hover:bg-autofun-background-action-primary"
            }`}
          >
            Moderators
          </Link>
        )}
      </div>

      <Routes>
        <Route path="/" element={<AdminOverview />} />
        <Route path="/users" element={<AdminUsers />} />
        <Route path="/users/:address" element={<AdminUsers />} />
        <Route path="/tokens" element={<AdminTokens />} />
        <Route path="/tokens/:address" element={<AdminTokens />} />
        <Route path="/pregenerated" element={<AdminPregenerated />} />
        {isAdmin && <Route path="/moderators" element={<AdminModerators />} />}
      </Routes>
    </div>
  );
}
