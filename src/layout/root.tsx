import BreakpointIndicator from "@/components/breakpoint-indicator";
import Footer from "@/components/footer";
import Header from "@/components/header";
import { WalletModal } from "@/components/wallet-dialog";
import { Providers } from "@/providers";
import { queryClient } from "@/utils/api";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { Outlet, useLocation } from "react-router";
import { ToastContainer } from "react-toastify";

export default function Layout() {
  const { pathname } = useLocation();
  const [showFooter, setShowFooter] = useState(false);
  const [isFixed, setIsFixed] = useState(false);
  const bottomHitCount = useRef(0);
  const lastScrollY = useRef(0);
  const isInitialMount = useRef(true);
  const isHomepage = pathname === "/";
  const isTosAccepted = localStorage.getItem("tosAccepted") === "true";

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    if (!isHomepage) {
      setShowFooter(true);
      setIsFixed(false);
      return;
    }

    const checkScrollPosition = () => {
      const scrollPosition = window.scrollY + window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const threshold = 100;
      const isAtBottom = scrollPosition >= documentHeight - threshold;
      const isNearTop = window.scrollY < 200;

      const isScrollingDown = window.scrollY > lastScrollY.current;
      lastScrollY.current = window.scrollY;

      if (isAtBottom) {
        if (isScrollingDown) {
          bottomHitCount.current += 1;
          if (bottomHitCount.current >= 2) {
            setIsFixed(true);
            setShowFooter(true);
          } else {
            setShowFooter(true);
          }
        }
      } else if (!isFixed) {
        setShowFooter(false);
      }

      if (isNearTop) {
        bottomHitCount.current = 0;
        setIsFixed(false);
        setShowFooter(false);
      }
    };

    // Check initial position
    if (isInitialMount.current) {
      checkScrollPosition();
      isInitialMount.current = false;
    }

    window.addEventListener("scroll", checkScrollPosition);
    return () => window.removeEventListener("scroll", checkScrollPosition);
  }, [isFixed, isHomepage]);

  return (
    <QueryClientProvider client={queryClient}>
      <Providers>
        <div className="min-h-screen bg-autofun-background-primary text-autofun-text-primary flex flex-col font-satoshi antialiased">
          {isTosAccepted ? <Header /> : null}
          <main className="flex-grow px-2 md:px-4 pb-24">
            <Outlet />
            <BreakpointIndicator />
            <ToastContainer position="bottom-right" theme="dark" />
          </main>
          <div
            className={`${isHomepage ? (isFixed ? "fixed" : "absolute") : "static"} bottom-0 left-0 right-0 ${showFooter ? "block" : "hidden"} z-50`}
          >
            <Footer />
          </div>
          {/* <div className="block md:hidden">
        <BottomBar />
      </div> */}
          <WalletModal />
        </div>
      </Providers>
    </QueryClientProvider>
  );
}
