import React, { useState } from "react";

type Option<T> = {
  value: T;
  name: string;
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
  const [selectedValue, setSelectedValue] = useState<
    InferOptionValue<TOptions>
  >(defaultValue ?? options[0].value);

  const handleSelect = (value: InferOptionValue<TOptions>) => {
    setSelectedValue(value);
    onChange?.(value);
  };

  return (
    <div
      className="relative inline-flex rounded-md bg-[#0a0a0a] p-1 box-border border border-[#262626]"
      role="group"
    >
      {/* Selection indicator - animated background */}
      <div
        className="absolute transition-all duration-200 ease-in-out bg-green-600 rounded-md"
        style={{
          width: `calc((100% - 8px) / ${options.length})`,
          top: "4px",
          bottom: "4px",
          left: `calc((100% - 8px) / ${options.length} * ${options.findIndex((opt) => opt.value === selectedValue)} + 4px)`,
        }}
      />

      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
      >
        {options.map((option) => (
          <button
            key={option.name}
            type="button"
            onClick={() => handleSelect(option.value)}
            className={`
              relative px-4 py-1.5 text-sm font-medium
              transition-colors duration-200
              ${
                selectedValue === option.value
                  ? "text-white"
                  : "text-[#6c6c6c] hover:text-white"
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
