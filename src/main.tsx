import { StrictMode } from "react";
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { Routes, Route } from "react-router";
import Layout from "./layout/root";
import Homepage from "./pages";
import Support from "./pages/support";
import TermsOfService from "./pages/terms-of-service";
import PrivacyPolicy from "./pages/privacy-policy";
import Fees from "./pages/fees";
import Token from "./pages/token";
import { Create } from "./pages/create";
import { queryClient } from "./utils/api";
import { WalletProvider } from "./providers/wallet";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WalletProvider autoConnect={false}>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Homepage />} />
              <Route path="/support" element={<Support />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/fees" element={<Fees />} />
              <Route path="/token/:address" element={<Token />} />
              <Route path="/create" element={<Create />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </WalletProvider>
    </QueryClientProvider>
  </StrictMode>,
);
