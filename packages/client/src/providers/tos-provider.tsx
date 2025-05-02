import { useLocalStorage } from "@uidotdev/usehooks";
import { Link, useLocation, useNavigate } from "react-router-dom";

// Define cookie types locally as CookieProvider will be removed
type CookieType = "necessary" | "analytics" | "preferences";

export default function TosProvider() {
  const location = useLocation();
  const routes = ["/privacy-policy", "/terms-of-service", "/fees", "/support"];
  const AllowedRoute = routes.includes(location.pathname);
  const [tosAccepted, setTosAccepted] = useLocalStorage<boolean>(
    "tosAccepted",
    false,
  );
  // Add cookie state management from CookieProvider
  const [, setCookieBannerInteracted] = // Renamed for consistency, though interaction is implicit now
    useLocalStorage<boolean>("cookieAccepted", false);
  const [, setCookieTypeAccepted] = useLocalStorage<CookieType[]>(
    "cookieTypeAccepted",
    [],
  );

  const navigate = useNavigate();

  // Updated function to accept both TOS and cookies
  const acceptTosAndCookies = () => {
    setTosAccepted(true);
    // Accept all cookie types when TOS is accepted
    setCookieBannerInteracted(true);
    setCookieTypeAccepted(["analytics", "preferences", "necessary"]);
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
              Fair launch a meme coin in seconds. When you create a token you get to keep a portion of the swap fees to help you grow a real community powered by Al content tools!
              </p>
              <p className="text-autofun-text-info font-satoshi text-base mb-6">
              No early dumps — everyone starts at the same line.
              </p>
              <p className="text-autofun-text-info font-satoshi text-base mb-6">
              You earn swap fees — built-in rewards for the creators.
              </p>
              <p className="text-autofun-text-info font-satoshi text-base mb-6">
              Al art + text - instant memes and tweets.
              </p>
              {/* Added Cookie Text */}
              <p className="text-autofun-text-highlight font-satoshi text-base mb-4">
                🍪 A Note About Cookies
              </p>
              <p className="text-autofun-text-info font-satoshi text-base mb-4 px-4">
                We use necessary cookies to make our site work. We'd also like
                to set optional analytics and preference cookies to help us
                improve it and provide the best experience.
              </p>
              <p className="text-autofun-text-info font-satoshi text-base mb-6">
                By clicking below, you're agreeing to our Terms of Service and
                Cookie Policy.
              </p>

              <button
                onClick={acceptTosAndCookies} // Use updated function
                className="m-4 bg-autofun-background-action-highlight font-satoshi text-black px-6 py-2 hover:bg-gray-200 transition-all font-semibold"
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
              {/* TODO: Add Cookie Policy Link if it exists */}
              {/* <Link to="/cookie-policy" className="hover:underline">
                Cookie Policy
              </Link> */}
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
