import { useCallback } from "react";

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  minValue: number;
  maxValue: number;
  step: number;
}

export const Slider = ({
  value,
  onChange,
  minValue,
  maxValue,
  step,
}: SliderProps) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange],
  );

  return (
    <div className="relative w-full">
      {/* Track */}
      <div className="absolute w-full h-1 bg-[#262626] rounded-full top-1/2 -translate-y-1/2" />

      {/* Input Range */}
      <input
        type="range"
        min={minValue}
        max={maxValue}
        step={step}
        value={value}
        onChange={handleChange}
        className="
          relative w-full h-2
          appearance-none bg-transparent cursor-pointer
          [&::-webkit-slider-thumb]:w-4
          [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-[#22C55E]
          [&::-webkit-slider-thumb]:appearance-none
          [&::-moz-range-thumb]:w-4
          [&::-moz-range-thumb]:h-4
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-[#22C55E]
          [&::-moz-range-thumb]:border-0
        "
      />
    </div>
  );
};
