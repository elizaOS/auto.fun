import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { BrowserRouter, Route, Routes } from "react-router";
import "./index.css";
import Layout from "./layout/root";
import Homepage from "./pages";
import Admin from "./pages/admin";
import CallbackPage from "./pages/callback";
import ChatPage from "./pages/chat";
import Create from "./pages/create";
import Fees from "./pages/fees";
import PageNotFound from "./pages/not-found";
import PrivacyPolicy from "./pages/privacy-policy";
import Profile from "./pages/profile";
import Staking from "./pages/staking";
import Support from "./pages/support";
import TermsOfService from "./pages/terms-of-service";
import Testing from "./pages/testing";
import Token from "./pages/token";

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Homepage />} />
          <Route path="/staking" element={<Staking />} />
          <Route path="/support" element={<Support />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profiles/:address" element={<Profile />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/fees" element={<Fees />} />
          <Route path="/token/:address" element={<Token />} />
          <Route path="/create" element={<Create />} />
          <Route path="/testing" element={<Testing />} />
          <Route path="/callback" element={<CallbackPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:mint" element={<ChatPage />} />
          <Route path="/admin/*" element={<Admin />} />
          <Route path="*" element={<PageNotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </HelmetProvider>,
);
