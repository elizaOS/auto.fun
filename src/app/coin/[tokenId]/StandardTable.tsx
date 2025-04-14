import { ReactNode } from "react";
import { flexRender, Table } from "@tanstack/react-table";

export const StandardTable = <TTable,>({
  table,
  emptyComponent,
}: {
  table: Table<TTable>;
  emptyComponent: ReactNode;
}) => {
  return (
    <table className="w-full min-w-[600px]">
      <thead>
        <tr className="text-[#8C8C8C] uppercase border-b border-neutral-800">
          {table.getFlatHeaders().map((header) => (
            <th
              key={header.id}
              className="text-left py-3 px-6 last:text-right text-sm tracking-widest"
            >
              {flexRender(header.column.columnDef.header, header.getContext())}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="text-sm">
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id} className="border-b border-[#262626] last:border-0">
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id} className="py-3.5 px-6">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}

        {table.getRowCount() === 0 && (
          <tr>
            <td colSpan={table.getAllColumns().length} className="py-3.5">
              <div className="flex justify-center">{emptyComponent}</div>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
};
