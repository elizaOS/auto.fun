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
import { DropdownButton } from "@/components/common/button/DropdownButton";

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
        <DropdownButton
          disabled={!name || !description}
          onClick={() => {
            setShowAdvanced((showAdvanced) => !showAdvanced);
            onAdvancedCreationOpen?.();
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
  );
};
