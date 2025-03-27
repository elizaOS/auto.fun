import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ProfileToken } from "../types/profileTypes";
import { Link } from "react-router-dom";

const columnHelper = createColumnHelper<ProfileToken>();

const columns = [
  columnHelper.display({
    id: "token",
    header: "Token",
    cell: ({ row }) => {
      const { image, name, ticker } = row.original;

      return (
        <div className="flex gap-2 items-center">
          <img
            src={image ?? ""}
            alt="token image"
            className="h-4 w-4 rounded-full"
          />
          <div>
            <span>{name}</span>{" "}
            <span className="text-[#8C8C8C]">${ticker}</span>
          </div>
        </div>
      );
    },
  }),
  columnHelper.accessor("tokensHeld", {
    header: "Token Amount",
    cell: ({ cell }) => cell.getValue().toLocaleString(),
  }),
  columnHelper.accessor("solValue", {
    header: "SOL",
    cell: ({ cell }) => cell.getValue().toFixed(4),
  }),
  columnHelper.accessor("mint", {
    header: "View",
    cell: ({ cell }) => {
      const mint = cell.getValue();

      return (
        <Link to={`/coin/${mint}`} className="flex justify-end">
          <svg
            width="17"
            height="17"
            viewBox="0 0 17 17"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M0 8.5C0 3.8 3.8 0 8.5 0C13.2 0 17 3.8 17 8.5C17 13.2 13.2 17 8.5 17C3.8 17 0 13.2 0 8.5ZM16 8.5C16 4.35 12.65 1 8.5 1C4.35 1 1 4.35 1 8.5C1 12.65 4.35 16 8.5 16C12.65 16 16 12.65 16 8.5Z"
              fill="white"
            />
            <path
              d="M7.6502 12.6504L11.8002 8.50039L7.6502 4.35039L8.3502 3.65039L13.2002 8.50039L8.3502 13.3504L7.6502 12.6504Z"
              fill="white"
            />
            <path d="M12.5 8V9H4V8L12.5 8Z" fill="white" />
          </svg>
        </Link>
      );
    },
  }),
];

export const TokenTable = ({ tokens }: { tokens: ProfileToken[] }) => {
  const table = useReactTable({
    data: tokens,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="border border-[#262626] w-full">
      <table className="w-full">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="text-left last:text-right px-6 py-3 text-[#8c8c8c] uppercase text-[14px] tracking-widest text-sm"
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-t border-[#262626]">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-6 py-3">
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
