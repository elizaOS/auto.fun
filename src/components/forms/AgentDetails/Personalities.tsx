import { HTMLAttributes, useState } from "react";
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
      className={`p-3 rounded-lg min-h-[64px] ${selected ? "bg-[#03FF24] text-black" : "bg-[#002605]"}`}
      type="button"
      {...props}
    />
  );
};

export const Personalities = ({
  personalities,
  onChange,
}: PersonalitiesProps) => {
  const [selected, setSelected] = useState<Record<string, boolean | undefined>>(
    {},
  );

  const selectPersonality = (id: string) => {
    const totalSelected = Object.values(selected).filter(
      (isSelected) => isSelected,
    ).length;

    const newSelected = { ...selected };
    if (selected[id]) {
      newSelected[id] = false;
    } else {
      if (totalSelected === 3) {
        return;
      }
      newSelected[id] = true;
    }

    setSelected(newSelected);
    onChange(
      Object.entries(newSelected)
        .filter(([, value]) => value === true)
        .map(([key]) => key),
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between">
        <p>Your Personality (optional)</p>
        <p className="opacity-40">select up to 3</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {personalities.map(({ id, description }) => (
          <PersonalitySelection
            selected={!!selected[id]}
            key={id}
            onClick={() => selectPersonality(id)}
          >
            {description}
          </PersonalitySelection>
        ))}
      </div>
    </div>
  );
};
