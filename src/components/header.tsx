import WalletButton from "@/components/wallet-button";
import useAuthentication from "@/hooks/use-authentication";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import Button from "./button";
import SearchBar from "./search-bar";
import { useCurrentTheme } from "@/stores/useThemeStore";
import ThemedUiElement from "@/components/themed-ui-element";

export default function Header() {
  const { pathname } = useLocation();
  const { publicKey } = useWallet();
  const { isAuthenticated } = useAuthentication();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const currentTheme = useCurrentTheme();

  const logoPath = `/hues/logo/logo-${currentTheme.fileSuffix}.svg`;
  const logoWidePath = `/hues/logo/logo-${currentTheme.fileSuffix}.svg`;

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
      <div className="hidden md:block w-full z-50 px-4">
        <div className="flex flex-row items-center justify-between w-full">
          <div className="flex items-center select-none">
            <Link to="/" className="mr-6" aria-label="Auto.fun frontpage">
              <img
                className="hidden md:block size-20 pointer-events-none"
                src={logoWidePath}
                alt="logo"
                key={logoWidePath}
              />
              <img
                className="block md:hidden size-20 pointer-events-none"
                src={logoPath}
                alt="logo"
                key={logoPath}
              />
            </Link>
          </div>
          <div className="flex space-x-3 flex-row items-center">
            {pathname !== "/create" && (
              <>
                <SearchBar />
                <Link to="/create">
                  <Button className="cursor-pointer flex items-center text-base text-accent font-bold font-satoshi justify-center px-4 py-2.5 gap-2 h-11 bg-[#171717] border-2 border-accent min-w-34 hover:bg-accent hover:text-autofun-background-primary transition-colors">
                    New Coin{" "}
                    <ThemedUiElement
                      type="stars"
                      alt="stars"
                      className="text-accent"
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
        className={`sticky block md:hidden z-50 w-full ${pathname === "/create" ? "bg-transparent" : "bg-[#171717]"}`}
      >
        <div className="flex items-center justify-between lg:hidden w-full py-2 px-2">
          <Link to="/" className="shrink-0" aria-label="Auto.fun frontpage">
            <img
              className="h-11 w-15 sm:w-auto"
              src={logoPath}
              alt="logo"
              key={logoPath}
            />
          </Link>
          {pathname !== "/create" && (
            <>
              <div className="flex-1 mx-2">
                <SearchBar />
              </div>
              <Link to="/create" className="mr-2 shrink-0">
                <Button className="cursor-pointer shrink-0 flex items-center text-base text-accent font-bold font-satoshi justify-center px-2 sm:px-4 py-1 sm:py-2.5 gap-2 h-11 bg-[#171717] border-2 border-accent hover:bg-accent hover:text-autofun-background-primary transition-colors">
                  <span className="hidden md:inline">New Coin</span>{" "}
                  <ThemedUiElement
                    type="stars"
                    alt="stars"
                    className="text-accent shrink-0"
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
