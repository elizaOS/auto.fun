import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { XIcon } from "lucide-react";
import { PropsWithChildren, useState } from "react";
import Divider from "./divider";
import { twMerge } from "tailwind-merge";
import {
  type TTransactionSpeed,
  useTransactionSpeed,
} from "@/hooks/use-transaction-speed";
import { useSlippage } from "@/hooks/use-slippage";
import {
  type TMevProtection,
  useMevProtection,
} from "@/hooks/use-mev-protection";

export default function ConfigDialog({ children }: PropsWithChildren) {
  const [open, setOpen] = useState<boolean>(false);
  const [transactionSpeed, setTransactionSpeed] = useTransactionSpeed();
  const [slippage, setSlippage] = useSlippage();
  const [mevProtection, setMevProtection] = useMevProtection();

  const storeSlippage = (num: number) => {
    if (num <= 0) return;
    if (num >= 100) return;

    setSlippage(num);
  };

  return (
    <Dialog onOpenChange={(op: boolean) => setOpen(op)} open={open}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <VisuallyHidden>
        <DialogTitle />
      </VisuallyHidden>
      <DialogContent hideCloseButton className="p-4 max-w-[496px]">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3 justify-between">
            <h1
              className="text-3xl text-autofun-text-highlight font-medium font-satoshi select-none"
              style={{
                letterSpacing: "-1.8%",
              }}
            >
              Trade Settings
            </h1>
            <XIcon
              className="size-5 text-autofun-icon-disabled cursor-pointer"
              onClick={() => setOpen(false)}
            />
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-0.5">
                <span className="text-base font-medium font-satoshi text-autofun-text-primary">
                  Slippage %:{" "}
                </span>
                <span
                  className="font-normal font-satoshi text-autofun-text-highlight text-xl"
                  style={{
                    lineHeight: "28px",
                    fontSize: "20px",
                    letterSpacing: "-1.4px",
                  }}
                >
                  {Number(slippage).toFixed(1)}
                </span>
              </div>
              <input
                className="max-w-[120px] px-3 py-2 bg-[#0a0a0a] rounded-md text-white border outline-none"
                placeholder="1.0%"
                min="0"
                max="100"
                step="0.1"
                type="number"
                autoFocus={false}
                onChange={({ target }) => storeSlippage(Number(target.value))}
                value={slippage}
              ></input>
            </div>
            <p className="font-medium text-base text-autofun-text-secondary font-satoshi">
              This is the maximum amount of slippage you are willing to accept
              when placing trades
            </p>
          </div>
          <Divider />
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center gap-3">
              <span className="text-base font-medium font-satoshi text-autofun-text-primary">
                Speed
              </span>
              <div className="p-1 rounded-md border flex items-center gap-2">
                {(["fast", "turbo", "ultra"] as TTransactionSpeed[]).map(
                  (speedItem: TTransactionSpeed, _) => {
                    const isActive = speedItem === transactionSpeed;
                    return (
                      <div
                        onClick={() => setTransactionSpeed(speedItem)}
                        className={twMerge([
                          "py-2 px-3 capitalize text-autofun-text-secondary text-sm font-dm-mono select-none cursor-pointer tracking-[-0.4px]",
                          isActive
                            ? "rounded-md bg-autofun-background-action-highlight text-autofun-background-primary font-medium"
                            : "",
                        ])}
                      >
                        {speedItem}
                      </div>
                    );
                  }
                )}
              </div>
            </div>
            <p className="font-medium text-base text-autofun-text-secondary font-satoshi">
              Higher speeds will increase your priority fees, making your
              transactions confirm faster
            </p>
          </div>
          <Divider />

          <div className="flex justify-between items-center gap-3">
            <span className="text-base font-medium font-satoshi text-autofun-text-primary">
              Enable front-running protection
            </span>
            <div className="p-1 rounded-md border flex items-center gap-2">
              {([true, false] as TMevProtection[]).map(
                (mevProtectionItem: TMevProtection, _) => {
                  const isActive = mevProtectionItem === mevProtection;
                  const label = mevProtectionItem ? "on" : "off";
                  return (
                    <div
                      onClick={() => setMevProtection(mevProtectionItem)}
                      className={twMerge([
                        "py-2 px-3 capitalize text-autofun-text-secondary text-sm font-dm-mono select-none cursor-pointer tracking-[-0.4px]",
                        isActive
                          ? "rounded-md bg-autofun-background-action-highlight text-autofun-background-primary font-medium"
                          : "",
                      ])}
                    >
                      {label}
                    </div>
                  );
                }
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
