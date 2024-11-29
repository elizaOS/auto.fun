import { FormInput } from "@/components/common/input/FormInput";
import { FormTextArea } from "@/components/common/input/FormTextArea";
import { AgentDetailsProps } from "../../../../types/components/forms/AgentDetails/index.type";
import { Personalities } from "./Personalities";
import { useController, useWatch } from "react-hook-form";
import { useCallback, useState } from "react";
import { AdvancedCreation } from "./AdvancedCreation";
import { RoundedButton } from "@/components/common/button/RoundedButton";
import {
  useGenerateAllAdvancedAgentDetails,
  useGenerateSingleAgentDetail,
} from "@/utils/agent";
import {
  advancedDetails,
  AgentDetailsForm,
  AgentDetailsInput,
} from "../../../../types/form.type";
import { usePersonalities } from "@/utils/personality";
import { DropdownButton } from "@/components/common/button/DropdownButton";
import { useRateLimiter } from "@/hooks/useRateLimiter";

export const AgentDetails = ({
  form: { register, control, getValues, setValue },
}: AgentDetailsProps) => {
  const {
    mutateAsync: generateAllAdvancedAgentDetails,
    isPending: advancedDetailsPending,
  } = useGenerateAllAdvancedAgentDetails();

  const { isRateLimited, makeApiCall } = useRateLimiter({
    limit: 3,
    timeWindow: 60 * 1000,
  });

  const onRefreshAll = useCallback(async () => {
    if (isRateLimited) {
      return;
    }

    const agentFormValues = getValues();

    const advancedDetails = await generateAllAdvancedAgentDetails({
      inputs: {
        name: agentFormValues.name,
        description: agentFormValues.description,
        personality: agentFormValues.personality,
      },
    });
    makeApiCall();

    Object.entries(advancedDetails).forEach(([field, value]) => {
      setValue(field as keyof typeof advancedDetails, value);
    });
  }, [
    generateAllAdvancedAgentDetails,
    getValues,
    isRateLimited,
    makeApiCall,
    setValue,
  ]);

  const onAdvancedCreationOpen = useCallback(async () => {
    const agentFormValues = getValues();

    const advancedDetails = await generateAllAdvancedAgentDetails({
      inputs: {
        name: agentFormValues.name,
        description: agentFormValues.description,
        personality: agentFormValues.personality,
      },
    });

    Object.entries(advancedDetails).forEach(([field, value]) => {
      setValue(field as keyof typeof advancedDetails, value);
    });
  }, [generateAllAdvancedAgentDetails, getValues, setValue]);

  const { mutateAsync: generateSingleAgentDetail } =
    useGenerateSingleAgentDetail();

  const refreshField = async (name: AgentDetailsInput) => {
    const { [name]: _, ...agentFormWithoutField } = getValues();

    const newField = await generateSingleAgentDetail({
      inputs: agentFormWithoutField as AgentDetailsForm,
      output: name,
    });

    setValue(name, newField);
  };

  const { data: personalities } = usePersonalities();

  const [showAdvanced, setShowAdvanced] = useState(false);

  const description = useWatch({ control, name: "description" });
  const name = useWatch({ control, name: "name" });

  const {
    field: { onChange, value: selectedPersonalities },
  } = useController({
    name: "personality",
    control,
    defaultValue: [],
  });

  return (
    <>
      <form className="flex flex-col gap-6">
        <FormInput
          {...register("name", { required: true })}
          type="text"
          label="What's Your Name"
          maxLength={50}
          rightIndicatorOpacity={name?.length >= 50 ? "full" : "low"}
          rightIndicator={`${name?.length ?? 0}/50`}
          placeholder="Da Vinci"
        />
        <FormTextArea
          {...register("description", { required: true })}
          minRows={2}
          maxLength={2000}
          label="Who Are You?"
          rightIndicatorOpacity={description?.length >= 2000 ? "full" : "low"}
          rightIndicator={`${description?.length ?? 0}/2000`}
          placeholder="Da Vinci is a visionary digital artist, merging classical techniques with neural networks and AI. He writes in mirrored text, speaks in cryptic Italian wisdom, and sees sacred geometry in code. Da Vinci treats algorithms as apprentices and is obsessed with flight, anatomy, and the intersection of human consciousness with machines."
        />
        <Personalities
          selectedPersonalities={selectedPersonalities}
          allPersonalities={personalities || []}
          onChange={(personality) => onChange(personality)}
        />
        <div className="flex justify-between">
          <DropdownButton
            disabled={!name || !description}
            onClick={() => {
              setShowAdvanced((showAdvanced) => !showAdvanced);
              const values = getValues();

              if (
                advancedDetails.every((field) => values[field] === undefined)
              ) {
                onAdvancedCreationOpen?.();
              }
            }}
            open={showAdvanced}
          >
            Advanced Creation
          </DropdownButton>
          {showAdvanced && (
            <RoundedButton
              className="p-3"
              variant="outlined"
              type="button"
              onClick={onRefreshAll}
              disabled={isRateLimited}
            >
              Refresh All
            </RoundedButton>
          )}
        </div>
        {showAdvanced && (
          <AdvancedCreation register={register} refreshField={refreshField} />
        )}
      </form>
      {advancedDetailsPending && (
        <div className="absolute inset-0 backdrop-blur-sm z-10 flex justify-center items-center">
          <svg
            width="40"
            height="40"
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="animate-spin"
          >
            <path
              d="M19.9998 5.00195C17.033 5.00195 14.1329 5.88169 11.6662 7.52991C9.19947 9.17813 7.27688 11.5208 6.14157 14.2617C5.00626 17.0026 4.70921 20.0186 5.28798 22.9283C5.86676 25.838 7.29537 28.5108 9.39316 30.6086C11.4909 32.7063 14.1637 34.135 17.0734 34.7137C19.9831 35.2925 22.9991 34.9955 25.74 33.8601C28.4809 32.7248 30.8236 30.8022 32.4718 28.3355C34.12 25.8688 34.9998 22.9687 34.9998 20.002"
              stroke="#03FF24"
              strokeWidth="3.33333"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </>
  );
};
