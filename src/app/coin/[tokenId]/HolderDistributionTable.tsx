import { useEffect, useState } from "react";

type HolderDistribution = {
  contractAddress: string;
  holderPercentage: number;
  type: "bonding_curve" | "dev" | "normal";
};

export const HolderDistributionTable = ({}) => {
  const [holderDistribution, setHolderDistribution] = useState<
    HolderDistribution[]
  >([]);

  // Fetch transactions data
  useEffect(() => {
    // API call to fetch transactions
    setHolderDistribution([
      {
        contractAddress: "0x123",
        holderPercentage: 20.4,
        type: "bonding_curve",
      },
      {
        contractAddress: "0x124",
        holderPercentage: 10.9,
        type: "dev",
      },
      {
        contractAddress: "0x125",
        holderPercentage: 3,
        type: "normal",
      },
    ]);
  }, []);

  return (
    <div className="p-4">
      <table className="w-full">
        <tbody>
          {holderDistribution.map((holder, index) => (
            <tr
              key={holder.contractAddress}
              className={`${index !== 0 ? "border-t border-[#532954]" : ""}`}
            >
              <td className="py-4 flex justify-between">
                <div>
                  {index + 1}.{" "}
                  <a
                    href={`https://solscan.io/address/${holder.contractAddress}?cluster=devnet`}
                    target="_blank"
                    className="text-[#f743f6] font-medium"
                  >
                    {holder.contractAddress}
                  </a>
                  {holder.type === "bonding_curve" && (
                    <span className="text-[#b3a0b3] font-medium">
                      {" "}
                      🏦 (bonding curve)
                    </span>
                  )}
                  {holder.type === "dev" && (
                    <span className="text-[#b3a0b3] font-medium">
                      {" "}
                      💻 (dev)
                    </span>
                  )}
                </div>
                <div>{holder.holderPercentage}%</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
