import { FormTab } from "@/create/types";

interface TabNavigationProps {
  activeTab: FormTab;
  onTabChange: (tab: FormTab) => void;
}

export const TabNavigation = ({
  activeTab,
  onTabChange,
}: TabNavigationProps) => {
  return (
    <div className="flex items-center md:justify-between flex-col md:flex-row gap-8 mx-auto w-full mb-2">
      <div className="flex shrink-0 items-center gap-4">
        <img
          src="/create/dicelogo.svg"
          alt="Coin Machine"
          className="w-24 h-24"
        />
        <img
          src="/create/coinmachine.svg"
          alt="Coin Machine"
          className="w-48 h-24"
        />
      </div>
      <div className="flex justify-between items-center text-lg w-full shrink">
        {Object.values(FormTab).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`uppercase font-satoshi font-medium transition-colors duration-200 cursor-pointer select-none ${
              activeTab === tab
                ? "border-[#03FF24] text-[#03FF24] font-bold"
                : "border-transparent text-neutral-400 hover:text-white"
            }`}
            onClick={() => onTabChange(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
};
