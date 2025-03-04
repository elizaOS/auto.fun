"use client";
import { AgentBrowser } from "@/components/agent-browser";
import { LoadingScreen } from "@/components/loading-screen";
import { Suspense } from "react";

export default function HomePage() {
  return (
    <div className="min-h-screen text-green-500 mt-8">
      <div className="min-h-screen text-green-500">
        <Suspense fallback={<LoadingScreen />}>
          <main className="container mx-auto">
            <AgentBrowser />
          </main>
        </Suspense>
      </div>
    </div>
  );
}
