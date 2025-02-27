"use client";
// import { AgentBrowser } from "@/components/agent-browser";
import { AgentBrowser } from "@/components/agent-browser/index";
import { LoadingScreen } from "@/components/loading-screen";
import { Suspense } from "react";

export default function HomePage() {
  return (
    <div>
      <Suspense fallback={<LoadingScreen />}>
        {/* <AgentBrowser /> */}
        <AgentBrowser />
      </Suspense>
    </div>
  );
}
