import {
  CellContext,
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Transaction } from "./page";
import { useTimeAgo } from "@/app/formatTimeAgo";
import { env } from "@/utils/env";
import { useMemo } from "react";
import { StandardTable } from "./StandardTable";

const TransactionDate = ({ row }: CellContext<Transaction, unknown>) => {
  const timeAgo = useTimeAgo(row.original.timestamp);
  return <span>{timeAgo}</span>;
};

const columnHelper = createColumnHelper<Transaction>();

const createColumns = (ticker: string) => [
  columnHelper.accessor("user", {
    header: "ACCOUNT",
    cell: ({ cell }) => (
      <span>
        {cell.getValue().slice(0, 5)}...{cell.getValue().slice(-3)}
      </span>
    ),
  }),
  columnHelper.accessor("type", {
    header: "TYPE",
    cell: ({ cell }) => (
      <span
        className={`${cell.getValue() === "Buy" ? "text-[#03ff24]" : "text-[#ef5350]"}`}
      >
        {cell.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("solAmount", {
    header: "SOL",
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
  ticker: string;
  transactions: Transaction[];
}) => {
  const columns = useMemo(() => createColumns(ticker), [ticker]);

  const table = useReactTable({
    data: transactions,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return <StandardTable table={table} emptyComponent="No transactions found" />;
};
