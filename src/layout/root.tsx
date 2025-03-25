import BottomBar from "@/components/bottom-bar";
import BreakpointIndicator from "@/components/breakpoint-indicator";
import Header from "@/components/header";
import { Outlet } from "react-router";
import Footer from "@/components/footer";

export default function Layout() {
  return (
    <div className="min-h-screen bg-autofun-background-primary text-autofun-text-primary flex flex-col font-satoshi antialiased">
      <Header />
      <main className="flex-grow container pb-10">
        <Outlet />
        <BreakpointIndicator />
      </main>
      <Footer />
      <div className="block md:hidden">
        <BottomBar />
      </div>
    </div>
  );
}
