"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { RoundedButton } from "../common/button/RoundedButton";
import { HowItWorks } from "./HowItWorks";
import { WalletButton } from "../common/button/WalletButton";
import { useUserStore } from "../providers/UserProvider";

export const Nav = () => {
  const authenticated = useUserStore((state) => state.authenticated);
  const pathname = usePathname();

  if (pathname === "/landing") {
    return null;
  }

  return (
    <nav className="px-[5%] flex justify-between items-center pt-12 gap-6 sm:flex-col">
      <div className="flex gap-6 items-center">
        <div className="flex gap-6 items-center">
          <Link href="/" className="flex items-center">
            <Image
              height={40}
              width={40}
              src="/logo_rounded_25percent.png"
              alt="logo"
            />
          </Link>
          <Link href="/">
            <RoundedButton
              className="p-3 font-medium border-none"
              variant="outlined"
            >
              Create Agent
            </RoundedButton>
          </Link>
          {authenticated && (
            <Link href="/agents">
              <RoundedButton
                className="p-3 font-medium border-none"
                variant="outlined"
              >
                My Agents
              </RoundedButton>
            </Link>
          )}
        </div>
        <div className="sm:block hidden">
          <HowItWorks />
        </div>
      </div>
      <div className="flex gap-6 items-center">
        <div className="sm:hidden">
          <HowItWorks />
        </div>
        <WalletButton />

        <a
          href="https://x.com/autodotfun"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg
            width="44"
            height="44"
            viewBox="0 0 44 44"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="1" y="1" width="42" height="42" rx="11" fill="black" />
            <rect
              x="1"
              y="1"
              width="42"
              height="42"
              rx="11"
              stroke="#03FF24"
              strokeWidth="2"
            />
            <path
              d="M15.3333 28.6666L20.9733 23.0266M23.0233 20.9766L28.6666 15.3333M15.3333 15.3333L25.1108 28.6666H28.6666L18.8891 15.3333H15.3333Z"
              stroke="#03FF24"
              strokeWidth="1.66667"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      </div>
    </nav>
  );
};
