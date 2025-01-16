import Skeleton from "react-loading-skeleton";

export const AgentDetailsFormSkeleton = () => {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton height={80} />
      <Skeleton height={144} />
      <Skeleton height={260} />
    </div>
  );
};
