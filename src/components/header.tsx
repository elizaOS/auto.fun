import { Link, useLocation } from "react-router";
import { twMerge } from "tailwind-merge";
import { HowItWorksDialog } from "./how-it-works-dialog";
import SearchBar from "./search-bar";
import Button from "./button";

export default function Header() {
  return (
    <div className="border-b py-6">
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
            <img src="/nav/stars.svg" alt="stars" className="text-[#2FD345]" />
          </Button>
          <Button className="px-4 py-2.5 gap-2 h-11 rounded-md">
            Connect Wallet
          </Button>
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
