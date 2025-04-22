import { IToken } from "@/types";
import { twMerge } from "tailwind-merge";

type TVariant = "info" | "destructive" | "warning" | "imported";

export default function TokenStatus({ token }: { token: IToken }) {
  const status = token?.status;

  const labels: Record<IToken["status"] | "imported", string> = {
    active: "Active",
    harvested: "Harvested",
    locked: "Bonded",
    migrated: "Migrated",
    migrating: "Migrating",
    migration_failed: "Migration Failed",
    pending: "Pending",
    withdrawn: "Withdrawn",
    partner_import: "Imported",
    imported: "Imported",
  };

  const variantStatus: Record<IToken["status"] | "imported", TVariant> = {
    active: "info",
    harvested: "info",
    locked: "info",
    migrated: "info",
    migrating: "warning",
    migration_failed: "destructive",
    pending: "warning",
    withdrawn: "warning",
    partner_import: "info",
    imported: "imported",
  };

  const variants: Record<TVariant, string> = {
    info: "text-[#03FF24] bg-green-500/10",
    destructive: "text-red-500 bg-red-500/10",
    warning: "text-yellow-500 bg-yellow-500/10",
    imported: "text-white bg-white/10",
  };

  const isImported = Number(token?.imported) === 1;

  if (!status) return null;

  return (
    <div
      className={twMerge([
        "flex items-center justify-center p-2 text-sm font-dm-mono select-none ml-auto",
        isImported ? variants["imported"] : variants[variantStatus[status]],
      ])}
    >
      {isImported ? labels["imported"] : labels[status] || "Status Unknown"}
    </div>
  );
}
