import BreakpointIndicator from "@/components/breakpoint-indicator";
import Footer from "@/components/footer";
import Header from "@/components/header";
import { WalletModal } from "@/components/wallet-dialog";
import { Providers } from "@/providers";
import { queryClient } from "@/utils/api";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { ToastContainer } from "react-toastify";

export default function Layout() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  
  return (
    <QueryClientProvider client={queryClient}>
      <Providers>
        <div className="min-h-screen bg-autofun-background-primary text-autofun-text-primary flex flex-col font-satoshi antialiased">
          <Header />
          <main className="flex-grow container pb-10">
            <Outlet />
            <BreakpointIndicator />
            <ToastContainer position="bottom-right" theme="dark" />
          </main>
          <Footer />
          {/* <div className="block md:hidden">
        <BottomBar />
      </div> */}
          <WalletModal />
        </div>
      </Providers>
    </QueryClientProvider>
  );
}
