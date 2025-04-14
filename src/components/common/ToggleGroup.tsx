import React, { useState } from "react";

type Option<T> = {
  value: T;
  name: string;
  offState?: boolean;
};

type InferOptionValue<T> = T extends Option<infer V>[] ? V : never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ToggleGroupProps<TOptions extends Option<any>[]> {
  options: TOptions;
  onChange?: (value: InferOptionValue<TOptions>) => void;
  defaultValue?: InferOptionValue<TOptions>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ToggleGroup<TOptions extends Option<any>[]>({
  options,
  onChange,
  defaultValue,
}: ToggleGroupProps<TOptions>) {
  const [selectedIndex, setSelectedIndex] = useState<number>(
    defaultValue !== undefined
      ? options.findIndex((opt) => opt.value === defaultValue)
      : 0,
  );
  const selectedOption = options[selectedIndex];

  const handleSelect = (index: number) => {
    setSelectedIndex(index);
    onChange?.(options[index].value);
  };

  return (
    <div
      className="relative inline-flex rounded-md bg-[#212121] p-1 box-border border border-[#262626]"
      role="group"
    >
      {/* Selection indicator - animated background */}
      <div
        className={`absolute transition-all duration-200 ease-in-out ${options[selectedIndex].offState ? "bg-[#505050]" : "bg-green-600"} rounded`}
        style={{
          width: `calc((100% - 8px) / ${options.length})`,
          top: "4px",
          bottom: "4px",
          left: `calc((100% - 8px) / ${options.length} * ${selectedIndex} + 4px)`,
        }}
      />

      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
      >
        {options.map((option, index) => (
          <button
            key={option.name}
            type="button"
            onClick={() => handleSelect(index)}
            className={`
              relative px-3 py-2 text-sm font-medium
              transition-colors duration-200
              ${
                selectedOption === option && !option.offState
                  ? "text-[#0a0a0a]"
                  : "text-[#8c8c8c] hover:text-white"
              }
              z-10
              min-w-0
            `}
          >
            {option.name}
          </button>
        ))}
      </div>
    </div>
  );
}
