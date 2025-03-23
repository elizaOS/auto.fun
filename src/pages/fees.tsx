"use client";

const FeesContent = () => {
  return (
    <div className="grid h-[85vh] items-center justify-center">
      <div className="flex w-fit lg:w-[600px] bg-autofun-stroke-primary/40 flex-col h-fit rounded-md">
        <div className="flex-1">
          <div className="w-full justify-center">
            <div className="w-full">
              {/* Header */}
              <div className="flex flex-col p-5 gap-3.5 border-b border-[#262626]">
                <h1 className="text-2xl md:text-[32px] font-satoshi font-medium leading-9 tracking-[-0.018em] text-[#2FD345]">
                  Fees On Auto.fun
                </h1>
                <p className="text-sm md:text-base font-satoshi text-[#8C8C8C] leading-6">
                  The following fees apply when using the auto.fun platform
                </p>
              </div>

              {/* Table Header */}
              <div className="flex justify-between px-4 py-2 border-b border-[#262626]">
                <span className="font-mono text-sm md:text-base text-[#8C8C8C] tracking-[2px] uppercase">
                  Actions
                </span>
                <span className="font-mono text-sm md:text-base text-[#8C8C8C] tracking-[2px] uppercase">
                  Fee
                </span>
              </div>

              {/* Table Rows */}
              <div className="flex justify-between px-4 py-2 border-b border-[#262626]">
                <span className="font-mono text-[10px] md:text-xs text-white tracking-[2px] uppercase">
                  Create a token
                </span>
                <span className="font-mono text-[10px] md:text-xs text-[#2FD345] tracking-[2px] uppercase">
                  0 SOL
                </span>
              </div>

              <div className="flex justify-between px-4 py-2 border-b border-[#262626]">
                <span className="font-mono text-[10px] md:text-xs text-white tracking-[2px] uppercase">
                  Trading while on bonding curve
                </span>
                <span className="font-mono text-[10px] md:text-xs text-[#2FD345] tracking-[2px] uppercase">
                  1% of total sale price
                </span>
              </div>

              <div className="flex justify-between px-4 py-2 border-b border-[#262626]">
                <span className="font-mono text-[10px] md:text-xs text-white tracking-[2px] uppercase">
                  raydium graduation
                </span>
                <span className="font-mono text-[10px] md:text-xs text-[#2FD345] tracking-[2px] uppercase">
                  1% of migrated liquidity
                </span>
              </div>

              {/* Footer */}
              <div className="flex flex-col p-5 gap-3.5">
                <p className="text-sm md:text-base font-satoshi text-[#2FD345]">
                  Trading fees are distributed as follows
                </p>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#2FD345]" />
                  <span className="font-mono text-sm md:text-base text-[#8C8C8C] tracking-[-0.6px]">
                    Buy fees (1%) are collected in SOL
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#2FD345]" />
                  <span className="font-mono text-sm md:text-base text-[#8C8C8C] tracking-[-0.6px]">
                    All fees are sent to token creators
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeesContent;
