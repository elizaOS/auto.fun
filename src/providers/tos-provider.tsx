import { PropsWithChildren } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTosAccepted } from "@/hooks/use-tos";

export default function TosProvider({ children }: PropsWithChildren) {
  const location = useLocation();
  const routes = ["/privacy-policy", "/terms-of-service", "/fees"];
  const AllowedRoute = routes.includes(location.pathname);

  const { tosAccepted, acceptTos } = useTosAccepted();

  if (tosAccepted || AllowedRoute) {
    return <>{children}</>;
  }

  return (
    <div className="h-screen w-screen grid place-items-center bg-autofun-background">
      <div className="max-w-[400px] md:max-w-[496px] w-full bg-autofun-background-card shadow-lg overflow-hidden">
        <div className="p-4 border-b border-autofun-border relative">
          <h1 className="text-xl font-satoshi font-medium tracking-[-0.018em] text-autofun-text-highlight">
            How Auto.Fun Works
          </h1>
        </div>

        <div className="p-6 text-center">
          <p className="text-autofun-text-info font-satoshi text-base mb-4">
          Auto.Fun lets anyone create coins with fair-launch tokenomics, so everyone gets an equal shot at buying and selling when the coin first drops.
          </p>
          <p className="text-autofun-background-action-highlight text-left font-satoshi mb-6 text-xl">
          How it’s done:
          </p>
          <ol className="text-white font-satoshi text-left space-y-4 text-base mb-6 list-decimal list-inside">
            <li>Choose a coin that catches your interests</li>
            <li>Buy in through the bonding curve</li>
            <li>Sell it at any point to lock in gains</li>
            <li>Engage with the community through AI agents and content generation</li>
          </ol>
          <p className="text-autofun-text-secondary font-satoshi text-base mb-6">
          By clicking below, you're agreeing to our Terms of Service.
          </p>

          <button
            onClick={acceptTos}
            className="m-4 bg-autofun-background-action-highlight text-black px-6 py-2 hover:bg-gray-200 transition-all font-semibold"
          >
            Fun Button
          </button>
        </div>

        <div className="mt-3 border-t border-autofun-border p-4 flex justify-center gap-4 text-xs text-autofun-background-disabled">
          <Link to="/privacy-policy" className="hover:underline">Privacy Policy</Link>
          <Link to="/terms-of-service" className="hover:underline">Terms of Service</Link>
          <Link to="/fees" className="hover:underline">Fees</Link>
        </div>
      </div>
    </div>
  );
}
