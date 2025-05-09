import BreakpointIndicator from "@/components/breakpoint-indicator";
import Footer from "@/components/footer";
import Header from "@/components/header";
import { WalletModal } from "@/components/wallet-dialog";
import { Providers } from "@/providers";
import { queryClient } from "@/utils/api";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { ToastContainer } from "react-toastify";

export default function Layout() {
  const { pathname } = useLocation();
  const [showFooter, setShowFooter] = useState(false);
  const isHomepage = pathname === "/";
  const isTosAccepted = localStorage.getItem("tosAccepted") === "true";

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    if (!isHomepage) {
      setShowFooter(true);
      return;
    }

    const checkScrollPosition = () => {
      const isNearTop = window.scrollY < 200;
      if (isNearTop) {
        setShowFooter(false);
      } else {
        setShowFooter(true);
      }
    };

    checkScrollPosition();

    window.addEventListener("scroll", checkScrollPosition);
    return () => window.removeEventListener("scroll", checkScrollPosition);
  }, [isHomepage]);

  return (
    <QueryClientProvider client={queryClient}>
      <Providers>
        <div className="min-h-screen bg-autofun-background-primary text-autofun-text-primary flex flex-col font-satoshi antialiased items-center">
          {isTosAccepted ? <Header /> : null}
          <main className="flex-grow container">
            <Outlet />
            <BreakpointIndicator />
            <ToastContainer position="bottom-right" theme="dark" />
          </main>
          <WalletModal />
          <div className={`w-full ${showFooter ? "block" : "hidden"} z-50`}>
            {!pathname.startsWith("/chat/") && <Footer />}
          </div>
        </div>
      </Providers>
    </QueryClientProvider>
  );
}
