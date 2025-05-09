import WalletButton from "@/components/wallet-button";
import useAuthentication from "@/hooks/use-authentication";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import Button from "./button";
import SearchBar from "./search-bar";

export default function Header() {
  const { pathname } = useLocation();
  const { publicKey } = useWallet();
  const { isAuthenticated } = useAuthentication();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // const solBalance = useSolBalance();

  const mobileNavItems = [
    { icon: "/nav/stars.svg", title: "Create Token", href: "/create" },
    { icon: "/nav/eye.svg", title: "Tokens", href: "/" },
    { icon: "/nav/question-mark.svg", title: "Support", href: "/support" },
  ];

  // Add profile link if user is authenticated
  if (publicKey && isAuthenticated) {
    mobileNavItems.push({
      icon: "/nav/user.svg",
      title: "Profile",
      href: "/profile",
    });
  }

  useEffect(() => {
    if (drawerOpen) {
      setDrawerOpen(false);
    }
  }, [pathname]);

  return (
    <>
      <div className="hidden md:block w-full z-50 container">
        <div className="flex flex-row items-center justify-between w-full">
          <div className="flex items-center select-none">
            <Link to="/" className="mr-6" aria-label="Auto.fun frontpage">
              <img
                className="hidden md:block size-20 pointer-events-none"
                src="/logo_wide.svg"
                alt="logo"
              />
              <img
                className="block md:hidden size-20 pointer-events-none"
                src="/logo.svg"
                alt="logo"
              />
            </Link>
          </div>
          <div className="flex space-x-3 flex-row">
            {pathname !== "/create" && (
              <>
                <SearchBar />
                <Link to="/create">
                  <Button className="cursor-pointer flex items-center text-base text-autofun-text-highlight font-bold font-satoshi justify-center px-4 py-2.5 gap-2 h-11 bg-[#171717] border-2 border-[#03FF24] min-w-34">
                    New Coin{" "}
                    <img
                      src="/nav/stars.svg"
                      alt="stars"
                      className="text-[#03FF24]"
                    />
                  </Button>
                </Link>
              </>
            )}
            <WalletButton />
          </div>
        </div>
      </div>

      {/* mobile menu */}
      <div
        className={`sticky block md:hidden z-50 w-full mb-4 md:mb-0 ${pathname === "/create" ? "bg-transparent" : "bg-[#171717]"}`}
      >
        <div className="flex items-center justify-between lg:hidden w-full py-2 px-2">
          <Link to="/" className="shrink-0" aria-label="Auto.fun frontpage">
            <img className="h-11 w-15 sm:w-auto" src="/logo.svg" alt="logo" />
          </Link>
          {pathname !== "/create" && (
            <>
              <div className="flex-1 mx-2">
                <SearchBar />
              </div>
              <Link to="/create" className="mr-2 shrink-0">
                <Button className="cursor-pointer shrink-0 flex items-center text-base text-autofun-text-highlight font-bold font-satoshi justify-center px-2 sm:px-4 py-1 sm:py-2.5 gap-2 h-11 bg-[#171717] border-2 border-[#03FF24]">
                  <span className="hidden md:inline">New Coin</span>{" "}
                  <img
                    src="/nav/stars.svg"
                    alt="stars"
                    className="text-[#03FF24] shrink-0"
                  />
                </Button>
              </Link>
            </>
          )}
          <WalletButton />
        </div>
      </div>
    </>
  );
}
