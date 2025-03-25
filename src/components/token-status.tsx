import { IToken } from "@/types";
import { twMerge } from "tailwind-merge";

type TVariant = "info" | "destructive" | "warning";

export default function TokenStatus({ token }: { token: IToken }) {
  const status = token?.status;

  const labels: Record<IToken["status"], string> = {
    active: "Active",
    harvested: "Harvested",
    locked: "Locked",
    migrated: "Migrated",
    migrating: "Migrating",
    migration_failed: "Migration Failed",
    pending: "Pending",
    withdrawn: "Withdrawn",
  };

  const variantStatus: Record<IToken["status"], TVariant> = {
    active: "info",
    harvested: "info",
    locked: "info",
    migrated: "info",
    migrating: "warning",
    migration_failed: "destructive",
    pending: "warning",
    withdrawn: "warning",
  };

  const variants: Record<TVariant, string> = {
    info: "text-green-500 bg-green-500/10",
    destructive: "text-red-500 bg-red-500/10",
    warning: "text-yellow-500 bg-yellow-500/10",
  };

  if (!status) return null;

  return (
    <div
      className={twMerge([
        "flex items-center justify-center p-2 rounded-xl text-sm font-dm-mono select-none ml-auto",
        variants[variantStatus[status]],
      ])}
    >
      {labels[status] || "Status Unknown"}
    </div>
  );
}
