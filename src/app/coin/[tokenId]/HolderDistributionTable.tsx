import { usePaginatedLiveData } from "@/utils/paginatedLiveData";
import { z } from "zod";
import { env } from "@/utils/env";

const HolderSchema = z.object({
  address: z.string(),
  mint: z.string(),
  amount: z.number(),
  percentage: z.number(),
  createdAt: z.string().datetime(),
  lastUpdated: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const HolderDistributionTable = ({ mint }: { mint: string }) => {
  const { items: holders } = usePaginatedLiveData({
    itemsPerPage: 100,
    maxPages: 1,
    endpoint: `/tokens/${mint}/holders`,
    validationSchema: HolderSchema,
    getUniqueId: (holder) => holder.address,
    socketConfig: {
      subscribeEvent: {
        event: "subscribe",
        args: [mint],
      },
      newDataEvent: "newHolder",
    },
    itemsPropertyName: "holders",
  });

  return (
    <div className="p-4">
      <div className="text-[#b3a0b3] text-sm mb-4">
        * Holder Distribution Data is cached and updated daily
      </div>
      <table className="w-full">
        <tbody>
          {holders.map((holder, index) => {
            return (
              <tr
                key={holder.address}
                className={`${index !== 0 ? "border-t border-[#532954]" : ""}`}
              >
                <td className="py-4 flex justify-between">
                  <div>
                    {index + 1}.{" "}
                    <a
                      href={env.getWalletUrl(holder.address)}
                      target="_blank"
                      className="text-[#f743f6] font-medium"
                    >
                      {holder.address.slice(0, 4)}...{holder.address.slice(-4)}
                    </a>
                    {holder.address === env.bondingCurveAddress && (
                      <span className="text-[#b3a0b3] font-medium ml-2">
                        🏦 (bonding curve)
                      </span>
                    )}
                    {holder.address === env.devAddress && (
                      <span className="text-[#b3a0b3] font-medium ml-2">
                        💻 (dev)
                      </span>
                    )}
                    {holder.address === env.raydiumAddress && (
                      <span className="text-[#b3a0b3] font-medium ml-2">
                        Ⓡ (raydium)
                      </span>
                    )}
                  </div>
                  <div>{holder.percentage.toFixed(2)}%</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {holders.length === 0 && (
        <div className="flex justify-center items-center py-8">
          <p className="text-[#b3a0b3] font-medium">No holders found</p>
        </div>
      )}
    </div>
  );
};
