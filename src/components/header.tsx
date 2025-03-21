import { Link, useLocation } from "react-router";
import { twMerge } from "tailwind-merge";
import { HowItWorksDialog } from "./how-it-works-dialog";
import SearchBar from "./search-bar";
import Button from "./button";
import { CloseButton, Dialog, DialogPanel } from "@headlessui/react";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/utils";

export default function Header() {
  const { pathname } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mobileNavItems = [
    { icon: "/nav/stars.svg", title: "Create Token", href: "/create" },
    { icon: "/nav/eye.svg", title: "Tokens", href: "/tokens" },
    { icon: "/nav/circles.svg", title: "How It Works", href: "/how-it-works" },
    { icon: "/nav/question-mark.svg", title: "Support", href: "/support" },
  ];

  const mobileNavLinks = [
    { title: "Privacy Policy", href: "/legal/privacy" },
    { title: "Terms of Service", href: "/legal/terms" },
    { title: "Fees", href: "/legal/fees" },
  ];

  return (
    <div>
      <div className="hidden md:block border-b py-6">
        <div className="container flex flex-row items-center justify-between">
          <div className="flex items-center">
            <Link to="/" className="mr-6">
              <img className="size-10" src="/logo.png" />
            </Link>
            <NavLink title="Tokens" href="/" />
            <HowItWorksDialog />
            <NavLink title="Support" href="/support" />
          </div>
          <div className="flex space-x-4 flex-row justify-between">
            <SearchBar />
            <Button className="flex items-center text-base font-medium text-white font-satoshi justify-center px-4 py-2.5 gap-2 h-11 bg-[#171717] border border-[#2FD345] rounded-md">
              Create Token{" "}
              <img
                src="/nav/stars.svg"
                alt="stars"
                className="text-[#2FD345]"
              />
            </Button>
            <Button className="px-4 py-2.5 gap-2 h-11 rounded-md">
              Connect Wallet
            </Button>
          </div>
        </div>
      </div>
      <div className="block md:hidden border-b py-6">
        <div className="flex items-center lg:hidden">
          {drawerOpen ? (
            <CloseButton>
              <X className="size-[30px]" />
            </CloseButton>
          ) : (
            <Menu className="size-[30px]" onClick={() => setDrawerOpen(true)} />
          )}

          <Dialog
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            className="relative z-30"
          >
            <div className="fixed inset-0 overflow-hidden">
              <div className="inset-0 overflow-hidden">
                <div className="pointer-events-none fixed inset-y-0 flex w-full right-0 max-w-[280px]">
                  <DialogPanel className="pointer-events-auto relative w-full max-w-md">
                    <div className="flex w-full h-full flex-col overflow-y-scroll bg-[#171717] py-6 shadow-xl">
                      <div className="relative flex flex-col py-20 px-6 gap-3">
                        <button className="rounded-lg text-white border w-full h-[44px] border-[#2FD345] hover:bg-green-400">
                          Connect Wallet
                        </button>
                        <div>
                          {mobileNavItems.map((item, index) => (
                            <Link
                              className={cn([
                                pathname === item.href ? "text-white" : "",
                                "font-satoshi text-[20px] gap-2 flex text-[#8C8C8C] w-fit hover:text-white py-3",
                              ])}
                              key={index}
                              to={item.href}
                            >
                              <img
                                className="hover:text-green-400"
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
                      <div className="absolute bottom-20 flex flex-row  items-center w-full px-6 gap-4 text-[#8C8C8C] text-center bg-[#171717]">
                        <img
                          src="X-icon.svg"
                          height={40}
                          width={40}
                          alt="stars-icon"
                        />
                        <h1 className="text-[16px]">®2024 Auto.fun</h1>
                      </div>
                    </div>
                  </DialogPanel>
                </div>
              </div>
            </div>
          </Dialog>
        </div>
      </div>
    </div>
  );
}

const NavLink = ({ title, href }: { title: string; href: string }) => {
  const location = useLocation();

  return (
    <Link to={href} className="px-3 py-2">
      <div
        className={twMerge([
          "text-center justify-center text-base font-medium font-satoshi leading-tight transition-all duration-200",
          location.pathname === href
            ? "text-autofun-text-primary"
            : "text-autofun-text-secondary",
        ])}
      >
        {title}
      </div>
    </Link>
  );
};
