import { HTMLAttributes } from "react";
import { PersonalitiesProps } from "../../../../types/components/forms/AgentDetails/Personalities.type";

const PersonalitySelection = ({
  selected,
  ...props
}: { selected: boolean } & Omit<
  HTMLAttributes<HTMLButtonElement>,
  "className" | "type"
>) => {
  return (
    <button
      className={`text-left p-3 rounded-lg min-h-[64px] ${selected ? "bg-[#03FF24] text-black" : "bg-[#002605]"}`}
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
  const selectPersonality = (id: number) => {
    let newPersonality: number[] = [];
    const idIndex = selectedPersonalities.indexOf(id);

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
        <p>Your Personality (optional)</p>
        <p className="opacity-40">select up to 3</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {allPersonalities.map(({ id, name }) => (
          <PersonalitySelection
            selected={selectedPersonalities.indexOf(id) > -1}
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
