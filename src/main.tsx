import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "./index.css";
import Layout from "./layout/root";
import Homepage from "./pages";
import { Create } from "./pages/create";
import Fees from "./pages/fees";
import PrivacyPolicy from "./pages/privacy-policy";
import Profile from "./pages/profile";
import Support from "./pages/support";
import TermsOfService from "./pages/terms-of-service";
import Token from "./pages/token";
import Testing from "./pages/testing";
import CallbackPage from "./pages/callback";
import PageNotFound from "./pages/not-found";
import Admin from "./pages/admin";

// if the date is before 2025-04-15, redirect to the old website
if (
  (window.location.hostname.includes("auto.fun") ||
    window.location.hostname.includes("autofun.tech")) &&
  new Date() < new Date("2025-04-19T00:00:00Z") &&
  !window.location.search.includes("dev") &&
  !window.location.hostname.includes("localhost") &&
  !window.location.hostname.includes("127.0.0.1")
) {
  window.location.href = "https://x.com/autodotfun";
} else {
  createRoot(document.getElementById("root")!).render(
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Homepage />} />
          <Route path="/support" element={<Support />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/fees" element={<Fees />} />
          <Route path="/token/:address" element={<Token />} />
          <Route path="/create" element={<Create />} />
          <Route path="/testing" element={<Testing />} />
          <Route path="/callback" element={<CallbackPage />} />
          <Route path="/admin/*" element={<Admin />} />
          <Route path="*" element={<PageNotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>,
  );
}
