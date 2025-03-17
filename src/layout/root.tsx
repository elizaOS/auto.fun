import Header from "@/components/header";
import { Outlet } from "react-router";

export default function Layout() {
  return (
    <body>
      <div className="min-h-screen bg-autofun-background-primary text-autofun-text-primary flex flex-col">
        <Header />
        <main className="flex-grow container">
          <Outlet />
        </main>
      </div>
    </body>
  );
}
