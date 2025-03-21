import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { XIcon } from "lucide-react";
import { PropsWithChildren } from "react";
import Divider from "./divider";
import { twMerge } from "tailwind-merge";
import {
  type TTransactionSpeed,
  useTransactionSpeed,
} from "@/hooks/use-transaction-speed";

export default function ConfigDialog({ children }: PropsWithChildren) {
  const [transactionSpeed, setTransactionSpeed] = useTransactionSpeed();
  return (
    <Dialog>
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
            <XIcon className="size-5 text-autofun-icon-disabled" />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-0.5">
              <span className="text-base font-medium font-satoshi uppercase text-autofun-text-primary">
                Slippage%:{" "}
              </span>
              <span className="font-normal text-autofun-text-highlight text-xl">
                5.0
              </span>
            </div>
          </div>
          <p className="font-medium text-base text-autofun-text-secondary font-satoshi">
            This is the maximum amount of slippage you are willing to accept
            when placing trades
          </p>
          <Divider />
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
      </DialogContent>
    </Dialog>
  );
}
