import { Token } from "@/utils/tokens";
import { Grid } from "lucide-react";
import { useTimeAgo } from "@/app/formatTimeAgo";
import { CopyButton } from "@/app/create/CopyButton";
import {
  CellContext,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

interface TableViewProps {
  tokens: Token[];
  onTokenClick: (mint: string) => void;
}

const CreationTime = ({ row }: CellContext<Token, unknown>) => {
  const { createdAt } = row.original;
  const timeAgo = useTimeAgo(createdAt);

  return <div className={`truncate text-right`}>{timeAgo}</div>;
};

const columnHelper = createColumnHelper<Token>();

const columns = [
  columnHelper.display({
    id: "aiAgents",
    header: "AI AGENTS",
    cell: ({ row }) => {
      const { image, name, ticker, mint } = row.original;

      return (
        <div className="flex items-center gap-4">
          <div className="relative w-[50px] h-[50px] rounded-lg bg-[#262626] overflow-hidden">
            {image ? (
              <img
                src={image}
                alt={name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Grid className="w-6 h-6 text-[#8C8C8C]" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`text-base font-medium text-white truncate font-satoshi`}
              >
                {name}
              </span>
              <span
                className={`text-base font-normal text-[#8C8C8C] tracking-widest uppercase shrink-0`}
              >
                ${ticker}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs text-[#8C8C8C] truncate`}>
                {mint.slice(0, 6)}...{mint.slice(-4)}
              </span>
              <CopyButton text={mint} />
            </div>
          </div>
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "marketCap",
    header: "MARKET CAP",
    cell: ({ row }) => {
      const { marketCapUSD } = row.original;

      return (
        <span className={`text-[#2FD345]`}>
          {Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            notation: "compact",
          }).format(Number(marketCapUSD))}
        </span>
      );
    },
  }),
  columnHelper.display({
    id: "24hVolume",
    header: "24H VOLUME",
    cell: ({ row }) => {
      const { volume24h } = row.original;

      return (
        <span className={`text-white`}>
          {Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            notation: "compact",
          }).format(volume24h)}
        </span>
      );
    },
  }),
  columnHelper.display({
    id: "holdersCount",
    header: "HOLDERS COUNT",
    cell: ({ row }) => {
      const { holderCount } = row.original;

      return <span className={`text-white`}>{holderCount || 0}</span>;
    },
  }),
  columnHelper.display({
    id: "bondingCurve",
    header: "BONDING CURVE",
    cell: ({ row }) => {
      const { curveProgress } = row.original;
      const normalizedProgress = Math.round(Math.min(100, curveProgress));

      return (
        <div className="flex items-center gap-2">
          <div className="relative w-[120px] h-2">
            <div className="absolute w-full h-2 bg-[#2E2E2E] rounded-full" />
            <div
              className="absolute h-2 bg-gradient-to-r from-[#0F4916] to-[#2FD345] rounded-full"
              style={{ width: `${normalizedProgress}%` }}
            />
          </div>
          <span className={`text-sm text-white`}>{normalizedProgress}%</span>
        </div>
      );
    },
  }),
  columnHelper.display({
    id: "creationTime",
    header: "CREATION TIME",
    cell: CreationTime,
  }),
];

export function TableView({ tokens, onTokenClick }: TableViewProps) {
  const table = useReactTable({
    data: tokens,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <table className="w-full border-separate border-spacing-y-3.5 -mt-3.5">
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map((header, index) => (
              <th
                key={header.id}
                className={`pb-3 px-4 text-left text-[#8c8c8c] uppercase text-[14px] tracking-widest ${index === headerGroup.headers.length - 1 && "text-right"}`}
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
          <tr
            key={row.id}
            className="bg-[#171717] cursor-pointer"
            onClick={() => onTokenClick(row.original.mint)}
          >
            {row.getVisibleCells().map((cell, index) => (
              <td
                key={cell.id}
                className={`py-3 px-4 border-t border-b border-t-neutral-800 border-b-neutral-800  bg-neutral-900 ${index === 0 && "border-l rounded-l-md border-l-neutral-800"} ${index === row.getVisibleCells().length - 1 && "border-r rounded-r-md border-r-neutral-800"}`}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
