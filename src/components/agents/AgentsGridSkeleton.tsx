import { AgentsContainer } from "@/components/agents";
import Skeleton from "react-loading-skeleton";

export const AgentsGridSkeleton = () => {
  return (
    <AgentsContainer>
      {Array.from({ length: 9 }).map((_, idx) => {
        return (
          <div
            key={idx}
            className="flex flex-col bg-[#002605] p-6 rounded-2xl gap-6 h-[184px]"
          >
            <div className="flex justify-between items-center">
              <div className="flex gap-3 items-center">
                <Skeleton width={45} height={45} />
                <p>
                  <Skeleton width={100} />
                </p>
              </div>
              <div className={`p-2 rounded-lg w-[75px]`}>
                <Skeleton height={30} />
              </div>
            </div>
            <p className="line-clamp-3 opacity-40">
              <Skeleton count={3} />
            </p>
          </div>
        );
      })}
    </AgentsContainer>
  );
};
