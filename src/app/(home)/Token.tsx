import { Tweet } from "@/components/common/Tweet";
import Link from "next/link";

export const Token = () => {
  return (
    <Link
      className="h-[424px] px-4 pt-4 pb-5 bg-[#401141] rounded-[20px] flex-col justify-start items-start gap-4 inline-flex"
      href={`/token-details/1`}
    >
      <div className="self-stretch justify-between items-start inline-flex">
        <img
          className="w-[100px] h-[100px] relative rounded-xl border border-[#642064]"
          src="https://via.placeholder.com/100x100"
          alt="placeholder"
        />
        <div className="px-2 py-1 bg-[#f743f6]/10 rounded-lg justify-start items-start gap-1 flex">
          <div className="text-[#cab7c7] text-base font-medium leading-normal">
            Market cap:
          </div>
          <div className="text-[#f743f6] text-base font-medium leading-normal">
            $35.62k
          </div>
        </div>
      </div>
      <div className="self-stretch h-12 flex-col justify-start items-start flex">
        <div className="self-stretch text-white text-xl font-bold font-secondary leading-normal">
          USA EAGLE
        </div>
        <div className="self-stretch text-[#cab7c7] text-xl font-bold font-secondary uppercase leading-normal">
          $USA
        </div>
      </div>
      <Tweet />
      <div className="self-stretch text-[#cab7c7] text-base font-medium font-['Inter'] leading-normal">
        41m ago
      </div>
    </Link>
  );
};
