import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "./index.css";
import Layout from "./layout/root";
import Homepage from "./pages";
import { Create } from "./pages/create";
import Fees from "./pages/fees";
import PrivacyPolicy from "./pages/privacy-policy";
import Support from "./pages/support";
import TermsOfService from "./pages/terms-of-service";
import Token from "./pages/token";
import { Providers } from "./providers";
import { queryClient } from "./utils/api";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <QueryClientProvider client={queryClient}>
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
      </QueryClientProvider>
    </Providers>
  </StrictMode>
);
