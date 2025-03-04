import React from "react";

const FeesContent = () => {
  return (
    <div className="flex flex-col p-[14px] text-[#A6A6A6]">
      <h2 className="text-white text-lg font-mono font-medium mb-4">
        Fees on auto.fun
      </h2>

      <p className="text-sm font-mono leading-5 mb-6">
        The following are fees charged by the auto.fun platform when you use our
        services:
      </p>

      <div className="mb-6">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[#505050]/30">
              <th className="text-left text-sm font-mono py-2 text-white">
                Action
              </th>
              <th className="text-right text-sm font-mono py-2 text-white">
                Fee
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[#505050]/30">
              <td className="text-sm font-mono py-2">Create an Agent</td>
              <td className="text-right text-sm font-mono py-2">0 SOL</td>
            </tr>
            <tr className="border-b border-[#505050]/30">
              <td className="text-sm font-mono py-2">
                Buy or sell an Agent on the bonding curve
              </td>
              <td className="text-right text-sm font-mono py-2">
                1% of total purchase or sale price
              </td>
            </tr>
            <tr>
              <td className="text-sm font-mono py-2">
                When an Agent graduates to Raydium
              </td>
              <td className="text-right text-sm font-mono py-2">6 SOL*</td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs font-mono mt-2 italic">
          *This is a fixed fee of 6 SOL that includes network and Raydium fees.
          This is taken from the liquidity of the Agent and does not require an
          additional payment from the user.
        </p>
      </div>

      <p className="text-sm font-mono leading-5 mb-4">
        Note that none of the auto.fun frontend services (web app, advanced
        interface, or mobile app) charge any additional fees beyond those listed
        above. If you access the platform or smart contracts via another
        interface, you may incur additional fees charged by those platforms.
      </p>

      <div className="flex flex-col gap-[34px] items-center">
        <p className="text-center text-[#A6A6A6] font-mono font-medium px-4">
          Fees are subject to change. Always refer to the latest documentation.
        </p>
      </div>
    </div>
  );
};

export default FeesContent;
