import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  SortingState,
} from "@tanstack/react-table";
import { ProfileToken } from "../types/profileTypes";
import { Link } from "react-router-dom";
import { useSolPriceContext } from "@/providers/use-sol-price-context";
import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

const columnHelper = createColumnHelper<ProfileToken>();

const SortIndicator = ({ isSorted }: { isSorted: false | "asc" | "desc" }) => {
  if (isSorted === "asc") {
    return <ChevronUp className="inline-block ml-1 h-4 w-4" />;
  }
  if (isSorted === "desc") {
    return <ChevronDown className="inline-block ml-1 h-4 w-4" />;
  }
  return <ChevronsUpDown className="inline-block ml-1 h-4 w-4 opacity-30" />;
};

const getColumns = (solPrice: number) => {
  const columns = [
    columnHelper.accessor("name", {
      id: "token",
      header: "Token",
      cell: ({ row }) => {
        const { image, name, ticker, mint } = row.original;

        return (
          <div className="flex gap-2 items-center">
            <img
              src={image ?? ""}
              alt="token image"
              className="h-4 w-4 rounded-full"
              onError={(e) => {
                e.currentTarget.src = "/default-avatar.png";
                e.currentTarget.onerror = null;
              }}
            />

            <Link
              to={`/token/${mint}`}
              className="hover:text-blue-500 flex items-center gap-1"
            >
              <span className="truncate max-w-[150px] sm:max-w-[200px]">
                {name}
              </span>
              <span className="text-[#8C8C8C] flex-shrink-0">${ticker}</span>
            </Link>
          </div>
        );
      },
      enableSorting: true,
    }),
    columnHelper.accessor((row) => row.tokensHeld ?? 0, {
      id: "tokensHeld",
      header: "Amount",
      cell: ({ row }) => (row.original.tokensHeld ?? 0).toLocaleString(),
      enableSorting: true,
    }),
    columnHelper.accessor((row) => row.solValue ?? 0, {
      id: "solValue",
      header: "SOL",
      cell: ({ row }) => {
        const solValue = Number(row.original.solValue ?? 0);
        const dollarValue = solValue * (solPrice ?? 0);
        return `${(row.original.solValue ?? 0).toFixed(4)} SOL`;
      },
      enableSorting: true,
    }),
    columnHelper.accessor("mint", {
      header: "View",
      enableSorting: false,
      cell: ({ cell }) => {
        const mint = cell.getValue();
        return (
          <Link to={`/token/${mint}`} className="flex justify-end items-center">
            <svg
              width="17"
              height="17"
              viewBox="0 0 17 17"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="fill-current text-white hover:text-blue-400 transition-colors"
            >
              <path d="M8.5,17 C3.80557963,17 0,13.1944204 0,8.5 C0,3.80557963 3.80557963,0 8.5,0 C13.1944204,0 17,3.80557963 17,8.5 C17,13.1944204 13.1944204,17 8.5,17 Z M8.5,1 C4.35786438,1 1,4.35786438 1,8.5 C1,12.6421356 4.35786438,16 8.5,16 C12.6421356,16 16,12.6421356 16,8.5 C16,4.35786438 12.6421356,1 8.5,1 Z" />
              <path d="M7.6502,12.6504 L11.8002,8.50039 L7.6502,4.35039 L8.3502,3.65039 L13.2002,8.50039 L8.3502,13.3504 L7.6502,12.6504 Z" />
              <path d="M4,8 L4,9 L12.5,9 L12.5,8 L4,8 Z" />
            </svg>
          </Link>
        );
      },
    }),
  ];
  return columns;
};

export const TokenTable = ({ tokens }: { tokens: ProfileToken[] }) => {
  const { solPrice } = useSolPriceContext();
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(() => getColumns(solPrice ?? 0), [solPrice]);

  const table = useReactTable({
    data: tokens ?? [],
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (!tokens || tokens?.length === 0) {
    return (
      <div className="text-center text-autofun-text-secondary my-6">
        No tokens to be displayed
      </div>
    );
  }

  return (
    <div className="border border-[#262626] w-full overflow-hidden">
      <table className="w-full">
        <thead className="bg-neutral-800">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  colSpan={header.colSpan}
                  className="text-left last:text-right px-6 py-3 text-[#8c8c8c] uppercase text-[13px] tracking-wider font-medium select-none"
                  style={{
                    cursor: header.column.getCanSort() ? "pointer" : "default",
                  }}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <div className="flex items-center gap-1 justify-start">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                    {header.column.getCanSort() && (
                      <SortIndicator isSorted={header.column.getIsSorted()} />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="border-t border-[#262626] hover:bg-neutral-800/50 transition-colors"
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-6 py-3 whitespace-nowrap">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
