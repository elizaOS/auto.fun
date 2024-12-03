import Skeleton from "react-loading-skeleton";
import { AgentUpdateFormProps } from "../../../../types/components/agents/AgentUpdateForm.type";
import { CenterFormContainer } from "@/components/common/containers/CenterFormContainer";
import { UpdateFormContainer } from "./UpdateFormContainer";
import { AgentDetailsFormSkeleton } from "@/components/forms/AgentDetails/AgentDetailsFormSkeleton";

export const SkeletonForm = ({
  onBack,
}: Pick<AgentUpdateFormProps, "onBack">) => {
  return (
    <UpdateFormContainer onBack={onBack}>
      <div className="inline-block relative w-[896px]">
        <div className="flex flex-col gap-6 absolute top-6 left-[-25%]">
          <Skeleton width={268} height={65} className="rounded-xl" />
          <div className="flex flex-col gap-4">
            {Array.from({ length: 2 }).map((_, idx) => (
              <Skeleton
                key={idx}
                width={268}
                height={52}
                className="rounded-xl"
              />
            ))}
          </div>
        </div>

        <CenterFormContainer
          formComponent={<AgentDetailsFormSkeleton />}
          submitButton={<Skeleton width={140} height={48} />}
        />
      </div>
    </UpdateFormContainer>
  );
};
