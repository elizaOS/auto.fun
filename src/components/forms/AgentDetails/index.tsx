import { FormInput } from "@/components/common/input/FormInput";
import { FormTextArea } from "@/components/common/input/FormTextArea";
import { AgentDetailsProps } from "../../../../types/components/forms/AgentDetails/index.type";
import { Personalities } from "./Personalities";
import { useController, useWatch } from "react-hook-form";
import { useState } from "react";
import { AdvancedCreation } from "./AdvancedCreation";
import { RoundedButton } from "@/components/common/button/RoundedButton";
import { useGenerateSingleAgentDetail } from "@/utils/agent";
import {
  AgentDetailsForm,
  AgentDetailsInput,
} from "../../../../types/form.type";
import { usePersonalities } from "@/utils/personality";

export const AgentDetails = ({
  form: { register, control, getValues, setValue },
  onAdvancedCreationOpen,
  onRefreshAll,
  isRateLimited,
}: AgentDetailsProps) => {
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
        <button
          className="flex items-center gap-3 disabled:opacity-30"
          type="button"
          onClick={() => {
            setShowAdvanced((showAdvanced) => !showAdvanced);
            onAdvancedCreationOpen?.();
          }}
          disabled={!name || !description}
        >
          <p>Advanced Creation</p>
          {showAdvanced ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
            >
              <path
                d="M12.4999 9.16797L9.99988 11.668L7.49988 9.16797"
                stroke="#03FF24"
                strokeWidth="1.66667"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9.99988 2.50195C15.9999 2.50195 17.4999 4.00195 17.4999 10.002C17.4999 16.002 15.9999 17.502 9.99988 17.502C3.99988 17.502 2.49988 16.002 2.49988 10.002C2.49988 4.00195 3.99988 2.50195 9.99988 2.50195Z"
                stroke="#03FF24"
                strokeWidth="1.66667"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
            >
              <path
                d="M9.16797 7.5L11.668 10L9.16797 12.5"
                stroke="#03FF24"
                strokeWidth="1.66667"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2.50195 10C2.50195 4 4.00195 2.5 10.002 2.5C16.002 2.5 17.502 4 17.502 10C17.502 16 16.002 17.5 10.002 17.5C4.00195 17.5 2.50195 16 2.50195 10Z"
                stroke="#03FF24"
                strokeWidth="1.66667"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
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
  );
};
