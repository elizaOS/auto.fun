import { Link, useLocation, useNavigate } from "react-router-dom";
import { useLocalStorage } from "@uidotdev/usehooks";

export default function TosProvider() {
  const location = useLocation();
  const routes = ["/privacy-policy", "/terms-of-service", "/fees", "/support"];
  const AllowedRoute = routes.includes(location.pathname);
  const [tosAccepted, setTosAccepted] = useLocalStorage<boolean>(
    "tosAccepted",
    false
  );
  const navigate = useNavigate();

  const acceptTos = () => {
    setTosAccepted(true);
    navigate("/");
  };

  return (
    <>
      {!tosAccepted && !AllowedRoute ? (
        <div className="h-screen w-full grid place-items-center fixed z-1000 backdrop-blur-xs">
          <div className="max-w-[400px] md:max-w-[496px] w-full bg-autofun-background-card shadow-lg overflow-hidden">
            <div className="p-4 border-b border-autofun-border relative mx-auto">
              <h1 className="mx-auto text-xl text-center font-satoshi font-medium tracking-[-0.018em] text-autofun-text-highlight">
                Welcome to AUTO.FUN [beta]
              </h1>
            </div>
            <div className="p-6 text-center">
              <p className="text-autofun-text-info font-satoshi text-base mb-4">
                Create tokens with AI, build a community with AI content
                creation, and engage with role-gated chat.
              </p>
              <p className="text-autofun-text-secondary font-satoshi text-base mb-6">
                Buy into the bonding curve; bonded tokens are migrated to
                Raydium.
              </p>
              <p className="text-autofun-text-secondary font-satoshi text-base mb-6">
                By clicking below, you're agreeing to our Terms of Service.
              </p>

              <button
                onClick={acceptTos}
                className="m-4 bg-autofun-background-action-highlight text-black px-6 py-2 hover:bg-gray-200 transition-all font-semibold"
              >
                I'm Ready to Have Fun!
              </button>
            </div>

            <div className="mt-3 border-t border-autofun-border p-4 flex justify-center gap-4 text-sm text-white">
              <Link to="/privacy-policy" className="hover:underline">
                Privacy Policy
              </Link>
              <Link to="/terms-of-service" className="hover:underline">
                Terms of Service
              </Link>
              <Link to="/fees" className="hover:underline">
                Fees
              </Link>
              <Link to="/support" className="hover:underline">
                Support
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
