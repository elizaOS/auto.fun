import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Fragment, useEffect, useState } from "react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useLocation, Link } from "react-router";
import { twMerge } from "tailwind-merge";

type TopButtonProps = {
  isActive?: boolean;
  title: string;
  onClick?: () => void;
};

const TopButton: React.FC<TopButtonProps> = ({ isActive, title, onClick }) => {
  return (
    <div
      className="h-[60px] flex place-items-center w-1/2 text-center select-none cursor-pointer border-b border-autofun-stroke-primary"
      onClick={onClick}
    >
      <span
        className={twMerge([
          "mx-auto font-satoshi font-medium text-xl leading-7 tracking-[-0.02em] transition-colors duration-200",
          isActive
            ? "text-autofun-text-highlight"
            : "text-autofun-text-secondary",
        ])}
      >
        {title}
      </span>
    </div>
  );
};

const Divider = () => {
  return (
    <div className="flex-shrink-0 w-full h-[1px] bg-autofun-stroke-primary" />
  );
};

const StepText = ({ step, text }: { step: number; text: string }) => {
  return (
    <div className="flex items-start gap-2">
      <div className="font-dm-mono font-medium text-xl tracking-[-0.02em] shrink-0 text-white">
        Step {step}:
      </div>
      <div className="font-dm-mono  font-normal text-base leading-6 tracking-[-0.6px] text-autofun-text-secondary mt-0.5">
        {text}
      </div>
    </div>
  );
};

const TextWithCircle = ({ text }: { text: string }) => {
  return (
    <div className="flex items-center gap-2">
      <div className="size-[6px] bg-autofun-background-action-highlight rounded-full" />
      <p className="font-dm-mono font-normal text-base tracking-[-0.6px] mt-0.5 text-autofun-text-secondary">
        {text}
      </p>
    </div>
  );
};

const Trading = () => {
  return (
    <Fragment>
      <StepText step={1} text="Pick a token you like" />
      <Divider />
      <StepText step={2} text="Buy the token on the bonding curve" />
      <Divider />
      <StepText
        step={3}
        text="If the token reaches $100k market cap, the token transitions to Raydium"
      />
      <Divider />
    </Fragment>
  );
};

const Creation = () => {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-satoshi font-normal text-base leading-6 tracking-normal text-autofun-text-secondary">
        Auto.fun creates a dual-pool trading environment for sustainable AI
        token launches.
      </p>
      <div className="flex flex-col gap-3 overflow-y-auto max-h-96">
        <Divider />
        <StepText step={1} text="Initial Setup" />
        <TextWithCircle text="Configure token details & symbol" />
        <TextWithCircle text="Create or link an agent if desired" />
        <TextWithCircle text="Define project parameters" />
        <Divider />
        <StepText
          step={2}
          text="Buy tokens through our bonding curve mechanism"
        />
        <TextWithCircle text="Set optional creator allocation" />
        <TextWithCircle text="Initialize bonding curve" />
        <TextWithCircle text="Define project parameters" />
        <Divider />
        <StepText step={3} text="Step 3: Market Activity" />
        <TextWithCircle text="Trading begins in primary SOL pool" />
        <Divider />
        <StepText step={4} text="Raydium Graduation" />
        <TextWithCircle text="Once Token reaches $100k market cap, there is an automatic" />
        <TextWithCircle text="Transition to Raydium" />
        <TextWithCircle text="Maintains dual pool benefits" />
        <TextWithCircle text="Primary pool (SOL:Token) for main trading activity" />
        <TextWithCircle text="Secondary pool (Ai16z:Token) for secondary layer of liquidity" />
        <Divider />
      </div>
    </div>
  );
};

export function HowItWorksDialog() {
  const [activeTab, setActiveTab] = useState<"trading" | "creation">("trading");
  const [open, setOpen] = useState<boolean>(false);

  const pathname = useLocation();

  useEffect(() => {
    if (open) {
      setOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (activeTab !== "trading") {
      setActiveTab("trading");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(op: boolean) => setOpen(op)}>
      <DialogTrigger onClick={() => setOpen(true)} asChild>
        <button className="flex items-center justify-center px-3 py-2 gap-2 h-9 rounded-md bg-transparent text-autofun-text-secondary hover:text-white transition-colors duration-200">
          <span className="text-base font-normal">How It Works</span>
        </button>
      </DialogTrigger>
      <VisuallyHidden>
        <DialogTitle />
      </VisuallyHidden>
      <DialogContent
        className="sm:max-w-[597px] pt-0 pb-6 px-0"
        hideCloseButton
      >
        <div className="flex items-center justify-center w-full divide-x">
          <TopButton
            isActive={activeTab === "trading"}
            title="Token Trading"
            onClick={() => setActiveTab("trading")}
          />
          <TopButton
            isActive={activeTab === "creation"}
            title="Token Creation"
            onClick={() => setActiveTab("creation")}
          />
        </div>
        <div className="flex flex-col gap-4 px-4">
          {activeTab === "trading" ? <Trading /> : <Creation />}
        </div>
        <div className="flex flex-col gap-4 px-4">
          <div className="flex items-center gap-4 mx-auto">
            <Link
              to="/privacy-policy"
              className="text-autofun-text-secondary text-base font-satoshi font-medium underline underline-offset-4"
            >
              Privacy Policy
            </Link>
            <div className="h-5 w-[1px] bg-[#505050]" />
            <Link
              to="/terms-of-service"
              className="text-autofun-text-secondary text-base font-satoshi font-medium underline underline-offset-4"
            >
              Terms of Service
            </Link>
            <div className="h-5 w-[1px] bg-[#505050]" />
            <Link
              to="/fees"
              className="text-autofun-text-secondary text-base font-satoshi font-medium underline underline-offset-4"
            >
              Fees
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
