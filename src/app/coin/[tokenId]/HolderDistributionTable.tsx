import { usePaginatedLiveData } from "@/utils/paginatedLiveData";
import { z } from "zod";
import { Socket } from "socket.io-client";
import { useToken } from "@/utils/tokens";

const HolderSchema = z.object({
  address: z.string(),
  mint: z.string(),
  amount: z.number(),
  percentage: z.number(),
  createdAt: z.string().datetime(),
  lastUpdated: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const HolderDistributionTable = ({ 
  socket,
  mint 
}: { 
  socket: Socket;
  mint: string;
}) => {
  const { data: token } = useToken(mint);
  const { items: holders } = usePaginatedLiveData({
    itemsPerPage: 100,
    maxPages: 1,
    endpoint: `/tokens/${mint}/holders`,
    socket,
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

  const getBondingCurveAddress = () => {
    if (!token) return null;
    // TODO: make these env variables for after deployment
    return "4FRxv5k1iCrE4kdjtywUzAakCaxfDQmpdVLx48kUXQQC";
  };

  const getDevAddress = () => {
    if (!token) return null;
    // TODO: make these env variables for after deployment
    return "BoeEDSULDSF1s81XCtmsgWPZmgLjiF1PyDFub2j8Wtsz";
  };

  const getRaydiumAddress = () => {
    if (!token) return null;
    // TODO: make these env variables for after deployment
    // Devnet Raydium address
    return "7rQ1QFNosMkUCuh7Z7fPbTHvh73b68sQYdirycEzJVuw";
  };

  return (
    <div className="p-4">
      <div className="text-[#b3a0b3] text-sm mb-4">
        * Holder Distribution Data is cached and updated daily
      </div>
      <table className="w-full">
        <tbody>
          {holders.map((holder, index) => {
            const bondingCurveAddress = getBondingCurveAddress();
            const devAddress = getDevAddress();
            const raydiumAddress = getRaydiumAddress();
            return (
              <tr
                key={holder.address}
                className={`${index !== 0 ? "border-t border-[#532954]" : ""}`}
              >
                <td className="py-4 flex justify-between">
                  <div>
                    {index + 1}.{" "}
                    <a
                      href={`https://solscan.io/address/${holder.address}?cluster=devnet`}
                      target="_blank"
                      className="text-[#f743f6] font-medium"
                    >
                      {holder.address.slice(0, 4)}...{holder.address.slice(-4)}
                    </a>
                    {holder.address === bondingCurveAddress && (
                      <span className="text-[#b3a0b3] font-medium ml-2">
                        🏦 (bonding curve)
                      </span>
                    )}
                    {holder.address === devAddress && (
                      <span className="text-[#b3a0b3] font-medium ml-2">
                        💻 (dev)
                      </span>
                    )}
                    {holder.address === raydiumAddress && (
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