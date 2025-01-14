"use client";

import Link from "next/link";
import Image from "next/image";
import { HowItWorks } from "./HowItWorks";
import { WalletButton } from "../common/button/WalletButton";
import { RoundedButton } from "../common/button/RoundedButton";

export const Nav = () => {
  return (
    <nav className="flex justify-between items-center gap-6 fixed top-0 left-0 right-0 z-50 px-8 py-4 bg-[#0e0e0e] border-b border-b-[#03ff24]/40">
      <div className="flex gap-6 items-center">
        <div className="flex items-center">
          <Link href="/" className="flex gap-6 items-center">
            <Image
              height={40}
              width={40}
              src="/logo_rounded_25percent.png"
              alt="logo"
            />
          </Link>
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
        <Link href="#" target="_blank">
          <RoundedButton className="p-3">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4 20L10.768 13.232M13.228 10.772L20 4M4 4L15.733 20H20L8.267 4H4Z"
                stroke="black"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </RoundedButton>
        </Link>
      </div>
    </nav>
  );
};
