import { Link, useLocation } from "react-router";
import { twMerge } from "tailwind-merge";
import SearchBar from "./search-bar";
import Button from "./button";
import { CloseButton, Dialog, DialogPanel } from "@headlessui/react";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import WalletButton from "@/components/wallet-button";
import { useWallet } from "@solana/wallet-adapter-react";
import useAuthentication from "@/hooks/use-authentication";
// import { HowItWorksDialog } from "./how-it-works-dialog";

export default function Header() {
  const { pathname } = useLocation();
  const { publicKey } = useWallet();
  const { isAuthenticated } = useAuthentication();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const mobileNavItems = [
    { icon: "/nav/stars.svg", title: "Create Token", href: "/create" },
    { icon: "/nav/eye.svg", title: "Tokens", href: "/" },
    { icon: "/nav/circles.svg", title: "How It Works", href: "/how-it-works" },
    { icon: "/nav/question-mark.svg", title: "Support", href: "/support" },
  ];

  // Add profile link if user is authenticated
  if (publicKey && isAuthenticated) {
    mobileNavItems.push({
      icon: "/nav/user.svg",
      title: "Profile",
      href: "/profile",
    });
  }

  const mobileNavLinks = [
    { title: "Privacy Policy", href: "privacy-policy" },
    { title: "Terms of Service", href: "/terms-of-service" },
    { title: "Fees", href: "fees" },
  ];

  useEffect(() => {
    if (drawerOpen) {
      setDrawerOpen(false);
    }
  }, [pathname]);

  return (
    <>
      <div className="hidden md:block py-6 w-full container">
        <div className="flex flex-row items-center justify-between w-full">
          <div className="flex items-center select-none">
            <Link to="/" className="mr-6">
              <img
                className="size-20 pointer-events-none"
                src="/logo_wide.svg"
              />
            </Link>
          </div>
          <div className="flex space-x-3 flex-row">
            {pathname !== "/create" && (
              <>
                <SearchBar />
                <Link to="/create">
                  <Button className="flex items-center text-base text-autofun-text-highlight font-bold font-satoshi justify-center px-4 py-2.5 gap-2 h-11 bg-[#171717] border-2 border-[#2FD345] min-w-34">
                    New Coin{" "}
                    <img
                      src="/nav/stars.svg"
                      alt="stars"
                      className="text-[#2FD345]"
                    />
                  </Button>
                </Link>
              </>
            )}
            <WalletButton />
          </div>
        </div>
      </div>

      {/* mobile menu */}
      <div className="sticky block md:hidden bg-[#171717] border-b py-4 z-50">
        <div className="flex items-center mx-4 space-x-4 lg:hidden ">
          <Link to="/" className="shrink-0">
            <img className="h-11 w-auto" src="/logo_wide.svg" />
          </Link>
          <div className="flex-1">
            <SearchBar />
          </div>
          <div className="shrink-0">
            {drawerOpen ? (
              <CloseButton>
                <X className="size-[30px]" />
              </CloseButton>
            ) : (
              <Menu
                className="size-[30px]"
                onClick={() => setDrawerOpen(true)}
              />
            )}
          </div>
          <Dialog
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            className="relative md:hidden"
          >
            <div className="fixed inset-0 overflow-hidden">
              <div className="inset-0 overflow-hidden">
                <div className="pointer-events-none fixed inset-y-0 flex w-full">
                  <DialogPanel className="pointer-events-auto mt-[77px] relative w-full max-w-[310px] ml-auto">
                    <div className="flex w-full h-full flex-col overflow-y-hidden bg-[#171717] py-0 shadow-xl">
                      <div className="relative flex flex-col py-4 px-6 gap-3">
                        <WalletButton />
                        <div>
                          {mobileNavItems.map((item, index) => (
                            <Link
                              className={twMerge([
                                pathname === item.href ? "text-white" : "",
                                "font-satoshi text-[20px] gap-2 flex text-[#8C8C8C] w-fit hover:text-white py-3",
                              ])}
                              key={index}
                              to={item.href}
                            >
                              <img
                                className="hover:text-[#03FF24]"
                                src={item.icon}
                                height={20}
                                width={20}
                                alt="nav-icons"
                              />
                              {item.title}
                            </Link>
                          ))}
                        </div>
                        <div className="border-b border-white/10"></div>
                        <div className="flex flex-col">
                          {mobileNavLinks.map((item, index) => (
                            <Link
                              className="text-[16px] text-[#8C8C8C] w-fit hover:text-white py-3"
                              key={index}
                              to={item.href}
                            >
                              {item.title}
                            </Link>
                          ))}
                        </div>
                      </div>
                      <div className="absolute bottom-20 flex flex-row items-center w-full px-6 gap-4 text-[#8C8C8C] text-center bg-[#171717]">
                        <img
                          src="/nav/X-icon.svg"
                          height={40}
                          width={40}
                          alt="x-icon"
                        />
                      </div>
                    </div>
                  </DialogPanel>
                </div>
              </div>
            </div>
          </Dialog>
        </div>
      </div>
    </>
  );
}
