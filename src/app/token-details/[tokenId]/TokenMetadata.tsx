import { Tweet } from "@/components/common/Tweet";
import { ContractAddress } from "./ContractAddress";

export const TokenMetadata = () => {
  return (
    <div className="bg-[#401141] rounded-2xl p-4 flex flex-col gap-4">
      <div className="flex gap-4">
        <img
          src="https://via.placeholder.com/132x132"
          className="rounded-xl aspect-square w-[132px] h-[132px]"
          alt="placeholder"
        />

        <div className="flex flex-col justify-between">
          <div>
            <div className="text-white text-2xl font-normal font-secondary">
              #1 grumpy catwifhat on tiktok (merlin)
            </div>

            <div className="text-[#b3a0b3] text-2xl font-bold font-secondary uppercase">
              $merlin
            </div>
          </div>

          <ContractAddress />
        </div>

        <Tweet />
      </div>

      <div className="bg-[#532954] h-px" />
      <div className="text-white/60 text-base font-medium">3h ago</div>
    </div>
  );
};
