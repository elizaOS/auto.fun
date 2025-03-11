import { HTMLAttributes } from "react";
import { FormInput } from "@/components/common/input/FormInput";
import { Personality } from "@/utils/personality";

export type PersonalitiesProps = {
  allPersonalities: Personality[];
  onChange: (selectedPersonalities: string[]) => void;
  selectedPersonalities: string[];
};

<div className="px-4 py-2.5 rounded-md outline-1 outline-offset-[-1px] outline-neutral-800 inline-flex justify-start items-center gap-2">
  <div className="text-center justify-center text-white text-base font-normal font-['DM_Mono'] leading-tight">
    Schizo-autist (obsessed, aggressive)
  </div>
</div>;

const PersonalitySelection = ({
  selected,
  ...props
}: { selected: boolean } & Omit<
  HTMLAttributes<HTMLButtonElement>,
  "className" | "type"
>) => {
  return (
    <button
      className={`px-4 py-2.5 rounded-md border leading-tight ${selected ? "border-[#2fd345]" : "border-neutral-800"} `}
      type="button"
      {...props}
    />
  );
};

export const Personalities = ({
  allPersonalities,
  onChange,
  selectedPersonalities,
}: PersonalitiesProps) => {
  const selectPersonality = (id: string) => {
    let newPersonality: string[] = [];
    const idIndex = selectedPersonalities?.indexOf(id) ?? -1;

    if (idIndex > -1) {
      newPersonality = [...selectedPersonalities];
      newPersonality.splice(idIndex, 1);
    } else {
      if (selectedPersonalities.length === 3) {
        return;
      }

      newPersonality = [...selectedPersonalities, id];
    }

    onChange(newPersonality);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between">
        <FormInput.Label label="your personality" isOptional />
        <div className="text-[#8c8c8c] uppercase tracking-widest">
          select up to 3
        </div>
      </div>
      <div className="grid grid-cols-2 gap-5">
        {allPersonalities.map(({ id, name }) => (
          <PersonalitySelection
            selected={selectedPersonalities?.indexOf(id) > -1}
            key={id}
            onClick={() => selectPersonality(id)}
          >
            {name}
          </PersonalitySelection>
        ))}
      </div>
    </div>
  );
};
