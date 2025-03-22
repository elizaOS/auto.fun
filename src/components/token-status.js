import { jsx as _jsx } from "react/jsx-runtime";
import { twMerge } from "tailwind-merge";
export default function TokenStatus({ token }) {
    const status = token?.status;
    const labels = {
        active: "Active",
        harvested: "Harvested",
        locked: "Locked",
        migrated: "Migrated",
        migrating: "Migrating",
        migration_failed: "Migration Failed",
        pending: "Pending",
        withdrawn: "Withdrawn",
    };
    const variantStatus = {
        active: "info",
        harvested: "info",
        locked: "info",
        migrated: "info",
        migrating: "warning",
        migration_failed: "destructive",
        pending: "warning",
        withdrawn: "warning",
    };
    const variants = {
        info: "text-green-500 bg-green-500/10",
        destructive: "text-red-500 bg-red-500/10",
        warning: "text-yellow-500 bg-yellow-500/10",
    };
    return (_jsx("div", { className: twMerge([
            "w-full flex items-center justify-center py-2 rounded-md text-sm font-dm-mono select-none",
            variants[variantStatus[status]],
        ]), children: labels[status] || "Status Unknown" }));
}
