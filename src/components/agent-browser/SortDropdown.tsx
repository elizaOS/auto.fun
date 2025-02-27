import { Listbox } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/20/solid";

export const sortOptions = [
  { label: 'Creation Time (Newest)', value: 'newest' },
  { label: 'Creation Time (Oldest)', value: 'oldest' },
  { label: 'Market Cap (High to Low)', value: 'mcap_high' },
  { label: 'Market Cap (Low to High)', value: 'mcap_low' },
] as const;

export type SortValue = typeof sortOptions[number]['value'];

interface SortDropdownProps {
  value: SortValue;
  onChange: (value: SortValue) => void;
  options: typeof sortOptions;
}

export function SortDropdown({ value, onChange, options }: SortDropdownProps) {
  return (
    <Listbox value={value} onChange={onChange}>
      <div className="relative">
        <Listbox.Button className="flex items-center gap-2 px-4 py-2 bg-[#171717] border border-[#262626] rounded-lg text-white hover:border-[#2FD345]/50 transition-all duration-200">
          <span className="text-sm whitespace-nowrap">
            {options.find(opt => opt.value === value)?.label || 'Sort by'}
          </span>
          <ChevronDownIcon className="w-4 h-4" />
        </Listbox.Button>
        <Listbox.Options className="absolute right-0 mt-2 w-56 bg-[#171717] border border-[#262626] rounded-lg py-1 shadow-lg z-10">
          {options.map((option) => (
            <Listbox.Option
              key={option.value}
              value={option.value}
              className={({ active, selected }) => `
                ${active ? 'bg-[#262626]' : ''}
                ${selected ? 'text-[#2FD345]' : 'text-white'}
                cursor-pointer select-none px-4 py-2 text-sm transition-colors
              `}
            >
              {option.label}
            </Listbox.Option>
          ))}
        </Listbox.Options>
      </div>
    </Listbox>
  );
} 