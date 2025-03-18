import { useMemo } from "react";
import { Transaction } from "./page";
import { useTimeAgo } from "@/app/formatTimeAgo";
import { env } from "@/utils/env";
import {
  CellContext,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

const TransactionDate = ({ row }: CellContext<Transaction, unknown>) => {
  const timeAgo = useTimeAgo(row.original.timestamp);
  return <span className="py-3 text-[#8C8C8C]">{timeAgo}</span>;
};

const columnHelper = createColumnHelper<Transaction>();

const createColumns = (ticker: string) => [
  columnHelper.accessor("user", {
    header: "ACCOUNT",
    cell: ({ cell }) => (
      <span className="text-[#8C8C8C]">
        {cell.getValue().slice(0, 5)}...{cell.getValue().slice(-3)}
      </span>
    ),
  }),
  columnHelper.accessor("type", {
    header: "TYPE",
    cell: ({ cell }) => (
      <span
        className={`${cell.getValue() === "Buy" ? "text-[#4ADE80]" : "text-[#FF4444]"}`}
      >
        {cell.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("solAmount", {
    header: "SOL",
    cell: ({ cell }) => <span className="text-white">{cell.getValue()}</span>,
  }),
  columnHelper.accessor("tokenAmount", {
    header: ticker,
    cell: ({ cell }) => (
      <span className="text-white">
        {Intl.NumberFormat("en-US", {
          style: "decimal",
          notation: "compact",
        })
          .format(Number(cell.getValue()))
          .toLowerCase()}
      </span>
    ),
  }),
  columnHelper.accessor("timestamp", {
    header: "DATE",
    cell: TransactionDate,
  }),
  columnHelper.accessor("txId", {
    header: "TXN",
    cell: ({ cell }) => (
      <div className="flex justify-end">
        <a
          className="text-[#8C8C8C] hover:text-white"
          href={env.getTransactionUrl(cell.getValue())}
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    ),
  }),
];

export const TradeTable = ({
  transactions,
  ticker,
}: {
  transactions: Transaction[];
  ticker: string;
}) => {
  const columns = useMemo(() => createColumns(ticker), [ticker]);

  const table = useReactTable({
    data: transactions,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <table className="w-full min-w-[600px]">
      <thead>
        <tr className="text-[#8C8C8C] text-xs uppercase">
          {table.getFlatHeaders().map((header) => (
            <th key={header.id} className="text-left py-2 last:text-right">
              {flexRender(header.column.columnDef.header, header.getContext())}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="text-sm">
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id} className="border-b border-[#262626] last:border-0">
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id} className="py-2 ">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};
