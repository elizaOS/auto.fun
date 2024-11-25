import { FormInput } from "@/components/common/input/FormInput";
import { FormTextArea } from "@/components/common/input/FormTextArea";
import {
  AgentDetailsProps,
  Personality,
} from "../../../../types/components/forms/AgentDetails/index.type";
import { Personalities } from "./Personalities";
import { useController, useWatch } from "react-hook-form";
import { useState } from "react";
import { AdvancedCreation } from "./AdvancedCreation";
import { RoundedButton } from "@/components/common/button/RoundedButton";

export const AgentDetails = ({
  form: { register, control },
}: AgentDetailsProps) => {
  // TODO: replace with proper data
  const personalities: Personality[] = [
    { id: "1", description: "personality 1" },
    { id: "2", description: "personality 2" },
    { id: "3", description: "personality 3" },
    { id: "4", description: "personality 4" },
    { id: "5", description: "personality 5" },
    { id: "6", description: "personality 6" },
  ];

  const [showAdvanced, setShowAdvanced] = useState(false);

  const description = useWatch({ control, name: "description" });
  const name = useWatch({ control, name: "name" });

  console.log(description);

  const {
    field: { onChange },
  } = useController({
    name: "personality",
    control,
  });

  return (
    <form className="flex flex-col gap-6">
      <FormInput
        {...register("name")}
        type="text"
        label="What's Your Name"
        maxLength={50}
        rightIndicatorOpacity={name?.length >= 50 ? "full" : "low"}
        rightIndicator={`${name?.length ?? 0}/50`}
      />
      <FormTextArea
        {...register("description")}
        minRows={2}
        maxLength={2000}
        label="Who Are You?"
        rightIndicatorOpacity={description?.length >= 2000 ? "full" : "low"}
        rightIndicator={`${description?.length ?? 0}/2000`}
      />
      <Personalities
        personalities={personalities}
        onChange={(personality) => onChange(personality)}
      />
      <div className="flex justify-between">
        <button
          className="flex items-center gap-3"
          type="button"
          onClick={() => setShowAdvanced((showAdvanced) => !showAdvanced)}
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
          <RoundedButton className="p-3" variant="outlined" type="button">
            Refresh All
          </RoundedButton>
        )}
      </div>
      {showAdvanced && <AdvancedCreation register={register} />}
    </form>
  );
};
