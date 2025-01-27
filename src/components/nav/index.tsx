"use client";

import Link from "next/link";
import Image from "next/image";
import { WalletButton } from "../common/button/WalletButton";
import { RoundedButton } from "../common/button/RoundedButton";
import { useUserStore } from "../providers/UserProvider";
import { useState } from "react";
import { Modal } from "../common/Modal";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const Step = ({
  number,
  description,
}: {
  number: number;
  description: string;
}) => (
  <div className="py-4">
    <span className="text-white font-mono font-medium text-xl">
      Step {number}:{" "}
    </span>
    <span className="text-[#A1A1A1] font-mono text-base">{description}</span>
  </div>
);

export const Nav = () => {
  const authenticated = useUserStore((state) => state.authenticated);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <nav className="flex justify-between items-center fixed top-0 left-0 right-0 z-50 px-4 py-3 bg-[#0e0e0e] border-b border-b-[#03ff24]/40">
      <div className="flex gap-6 items-center">
        <div className="flex items-center">
          <Link href="/" className="flex items-center">
            <Image
              height={40}
              width={40}
              src="/logo_rounded_25percent.png"
              alt="logo"
            />
          </Link>
        </div>
        <div className="flex hidden md:flex gap-6 items-center">
          <RoundedButton variant="outlined" className="p-3 px-4 border-none">
            <Link href="/create">Create Agent</Link>
          </RoundedButton>
          {authenticated && (
            <Link href={`/my-agents`}>
              <RoundedButton
                className="p-3 font-medium border-none"
                variant="outlined"
              >
                My Agents
              </RoundedButton>
            </Link>
          )}
        </div>
      </div>
      <div className="hidden md:flex gap-6 items-center">
        <button
          className="text-center text-[#d1d1d1] text-base font-medium leading-normal py-3 px-4"
          onClick={() => setModalOpen(true)}
        >
          How it works?
        </button>
        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title="How it works"
          maxWidth={587}
          className="bg-[#171717]"
        >
          <div className="flex flex-col p-[14px]">
            <p className="text-[#A6A6A6] text-sm font-mono leading-5 mt-1.5 mb-6">
              auto.fun ensures that all created tokens are safe to trade through
              a secure and battle-tested token launching system. Each coin on
              auto.fun is a fair-launch with no presale and no team allocation.
            </p>

            <div className="flex flex-col divide-y divide-[#505050]/30 border-y border-[#505050]/30">
              <Step number={1} description="Pick a coin that you like" />
              <Step
                number={2}
                description="Buy the coin on the bonding curve"
              />
              <Step
                number={3}
                description="Sell at any time to lock in your profits or losses"
              />
              <Step
                number={4}
                description="When enough people buy on the bonding curve, it reaches a market cap of $100k"
              />
              <Step
                number={5}
                description="$17k of liquidity is then deposited in Raydium and burned"
              />
            </div>

            <div className="flex flex-col gap-[34px] items-center">
              <button
                className="w-full py-2 px-5 mt-[34px] bg-[#092F0E] rounded-lg text-[#03FF24] font-mono font-medium"
                onClick={() => setModalOpen(false)}
              >
                Continue
              </button>

              <p className="text-center text-[#A6A6A6] font-mono font-medium px-4">
                By clicking this button you agree to the terms and conditions.
              </p>

              <div className="flex items-center gap-3">
                <a
                  href="#"
                  className="text-[#A6A6A6] font-mono font-medium underline"
                >
                  Privacy Policy
                </a>
                <div className="h-6 w-px bg-[#505050]" />
                <a
                  href="#"
                  className="text-[#A6A6A6] font-mono font-medium underline"
                >
                  Terms of Service
                </a>
                <div className="h-6 w-px bg-[#505050]" />
                <a
                  href="#"
                  className="text-[#A6A6A6] font-mono font-medium underline"
                >
                  Fees
                </a>
              </div>
            </div>
          </div>
        </Modal>
        <WalletButton />
      </div>
      <div className="flex md:hidden items-center">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button className="text-[#d1d1d1] outline-solid">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16m-7 6h7"
                />
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-[#0e0e0e] border-b border-b-[#03ff24]/40 gap-1 flex flex-col py-6 px-4 mr-4">
            <DropdownMenuItem asChild>
              <Link href="/create" className="text-[#d1d1d1]">
                Create Agent
              </Link>
            </DropdownMenuItem>
            {authenticated && (
              <DropdownMenuItem asChild>
                <Link href={`/my-agents`} className="text-[#d1d1d1]">
                  My Agents
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <button
                className="text-center text-[#d1d1d1]"
                onClick={() => setModalOpen(true)}
              >
                How it works?
              </button>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <WalletButton />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
};
