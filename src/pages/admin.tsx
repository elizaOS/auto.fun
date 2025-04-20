import { Link, Route, Routes, useLocation, Navigate } from "react-router-dom";
import AdminOverview from "./admin/overview";
import AdminUsers from "./admin/users";
import AdminTokens from "./admin/tokens";
import useAuthentication from "@/hooks/use-authentication";

// Define admin addresses directly in the component
const adminAddresses: string[] = [
  "8gikQQppeAGd9m5y57sW4fYyZwrJZoyniHD658arcnnx", // Joey (Santi)
  "ASktkp5ERQmmHChzSEqGbWNrqAdDdrJjS8AJG5G3cTCh", // Boris (Borko)
  "DScqtGwFoDTme2Rzdjpdb2w7CtuKc6Z8KF7hMhbx8ugQ", // Shaw
];

export default function Admin() {
  const location = useLocation();
  const currentPath = location.pathname;

  const { walletAddress } = useAuthentication(); // Get walletAddress
  console.log("walletAddress", walletAddress);
  console.log("adminAddresses", adminAddresses);
  // Check if the user is authenticated and is an admin (client-side check)
  const isAdmin = walletAddress && adminAddresses.includes(walletAddress);

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

  // If not authenticated or not an admin, redirect to home page
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      <div className="flex items-center gap-2 border-b border-autofun-background-action-primary pb-2">
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
      </div>

      <Routes>
        <Route path="/" element={<AdminOverview />} />
        <Route path="/users" element={<AdminUsers />} />
        <Route path="/users/:address" element={<AdminUsers />} />
        <Route path="/tokens" element={<AdminTokens />} />
        <Route path="/tokens/:address" element={<AdminTokens />} />
      </Routes>
    </div>
  );
}
