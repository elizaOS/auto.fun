import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Holder } from "@/utils/tokenDetails";
import { env } from "@/utils/env";
import { StandardTable } from "./StandardTable";
import { PropsWithChildren } from "react";

const AddressLabel = ({ children }: PropsWithChildren) => {
  return (
    <span className="text-[#8c8c8c] text-sm font-satoshi ml-3.5">
      {children}
    </span>
  );
};

const columnHelper = createColumnHelper<Holder>();

const columns = [
  columnHelper.accessor("address", {
    header: "ACCOUNT",
    cell: ({ cell, row }) => (
      <>
        <span className="py-3 pr-8 text-[#8C8C8C] font-satoshi">
          #{row.index + 1}
        </span>
        {cell.getValue().slice(0, 5)}...
        {cell.getValue().slice(-3)}
        {cell.getValue() === env.bondingCurveAddress && (
          <AddressLabel>(Bonding Curve)</AddressLabel>
        )}
        {cell.getValue() === env.devAddress && (
          <AddressLabel>(DEV)</AddressLabel>
        )}
      </>
    ),
  }),
  columnHelper.accessor("percentage", {
    header: "%",
    cell: ({ cell }) => `${cell.getValue().toFixed(2)}%`,
  }),
  columnHelper.accessor("address", {
    id: "addressLink",
    header: "EXP",
    cell: ({ cell }) => (
      <a
        href={env.getWalletUrl(cell.getValue())}
        className="inline-flex justify-end w-full"
        target="_blank"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M11 1.5H14.5V5M13.75 2.25L10 6M8.5 2.5H4C3.60218 2.5 3.22064 2.65804 2.93934 2.93934C2.65804 3.22064 2.5 3.60218 2.5 4V12C2.5 12.3978 2.65804 12.7794 2.93934 13.0607C3.22064 13.342 3.60218 13.5 4 13.5H12C12.3978 13.5 12.7794 13.342 13.0607 13.0607C13.342 12.7794 13.5 12.3978 13.5 12V7.5"
            stroke="#8C8C8C"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </a>
    ),
  }),
];

export const HolderTable = ({ holders }: { holders: Holder[] }) => {
  const table = useReactTable({
    data: holders,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return <StandardTable table={table} emptyComponent="No holders found" />;
};
