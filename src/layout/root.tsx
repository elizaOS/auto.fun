import BottomBar from "@/components/bottom-bar";
import BreakpointIndicator from "@/components/breakpoint-indicator";
import Header from "@/components/header";
import { Outlet } from "react-router";

export default function Layout() {
  return (
    <div className="min-h-screen bg-autofun-background-primary text-autofun-text-primary flex flex-col font-satoshi antialiased">
      <Header />
      <main className="flex-grow container py-10">
        <Outlet />
        <BreakpointIndicator />
      </main>
      <div className="visible md:hidden">
        <BottomBar />
      </div>
    </div>
  );
}
