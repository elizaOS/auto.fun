import { FormTab } from "../types";
import { Icons } from "../../icons";
import { MAX_INITIAL_SOL, TOKEN_SUPPLY, VIRTUAL_RESERVES } from "../consts";

interface BuySectionProps {
  activeTab: FormTab;
  buyValue: string;
  solBalance: number;
  isAuthenticated: boolean;
  isFormValid: boolean;
  insufficientBalance: boolean;
  maxInputSol: number;
  onBuyValueChange: (value: string) => void;
}

export const BuySection = ({
  activeTab,
  buyValue,
  solBalance,
  isAuthenticated,
  isFormValid,
  insufficientBalance,
  maxInputSol,
  onBuyValueChange,
}: BuySectionProps) => {
  if (activeTab === FormTab.IMPORT) return null;

  // Helper function to calculate token amount based on SOL input using bonding curve formula
  const calculateTokensFromSol = (solAmount: number): number => {
    // Convert SOL to lamports
    const lamports = solAmount * 1e9;
    // Using constant product formula: (dx * y) / (x + dx)
    // where x is virtual reserves, y is token supply, dx is input SOL amount
    const tokenAmount = (lamports * TOKEN_SUPPLY) / (VIRTUAL_RESERVES + lamports);
    return tokenAmount;
  };

  // Helper function to calculate percentage of total supply for a given token amount
  const calculatePercentage = (tokenAmount: number): number => {
    return (tokenAmount / TOKEN_SUPPLY) * 100;
  };

  return (
    <div className="flex flex-col gap-3 justify-end uppercase">
      <div className="flex flex-row gap-3 justify-end uppercase">
        <span className="text-white text-xl font-medium relative group">
          Buy
          <span className="inline-block ml-1 cursor-help">
            <Icons.Info className="h-4 w-4 text-[#8c8c8c] hover:text-white" />
            <div className="absolute hidden group-hover:block right-0 bottom-8 p-3 text-xs normal-case bg-black border border-neutral-800 shadow-lg z-10 w-64">
              <p className="text-white mb-2">
                Choose how much of the token you want to buy on launch:
              </p>
              <p className="text-neutral-400 mb-1">
                • <b>SOL</b>: Amount of SOL to invest
              </p>
              <p className="text-neutral-400 mb-2">
                • <b>%</b>: Percentage of token supply to acquire
              </p>
              <div className="border-t border-neutral-800 pt-2 mt-1">
                <p className="text-neutral-400 text-xs">
                  Total token supply: {TOKEN_SUPPLY.toLocaleString()} tokens
                </p>
                <p className="text-neutral-400 text-xs mt-1">
                  Pricing follows a bonding curve, your percentage increases with more SOL.
                </p>
              </div>
              <div className="border-t border-neutral-800 pt-2 mt-1">
                <p className="text-neutral-400 text-xs">
                  Maximum supply of 50% can be purchased prior to coin launch
                </p>
              </div>
            </div>
          </span>
        </span>
        <div className="flex flex-col items-end">
          <div className="relative">
            <input
              type="number"
              value={buyValue}
              onChange={(e) => {
                let value = e.target.value.replace(" SOL", "");
                value = value.replace(/[^\d.]/g, "");
                const decimalCount = (value.match(/\./g) || []).length;
                if (decimalCount > 1) {
                  value = value.substring(0, value.lastIndexOf(".")); // Keep only first decimal
                }
                const parts = value.split(".");
                let wholePart = parts[0] || "0"; // Default to 0 if empty
                let decimalPart = parts[1] || "";

                // Limit whole part length (e.g., 2 digits for SOL up to 99)
                if (wholePart.length > String(Math.floor(MAX_INITIAL_SOL)).length) {
                  wholePart = wholePart.slice(0, String(Math.floor(MAX_INITIAL_SOL)).length);
                }
                // Limit decimal part length
                if (decimalPart.length > 2) {
                  // Allow 2 decimal places
                  decimalPart = decimalPart.slice(0, 2);
                }

                value = decimalPart ? `${wholePart}.${decimalPart}` : wholePart;

                // Final numeric check against maxInputSol
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                  if (numValue < 0) value = "0";
                  else if (numValue > maxInputSol) value = maxInputSol.toString();
                } else if (value !== "") {
                  value = "0"; // Reset invalid non-empty strings
                }

                onBuyValueChange(value);
              }}
              min="0"
              max={maxInputSol.toString()}
              step="0.01"
              className="w-26 pr-10 text-white text-xl font-medium text-right inline border-b border-b-[#424242] focus:outline-none focus:border-white bg-transparent"
            />
            <span className="absolute right-0 top-0 bottom-0 flex items-center text-white text-xl font-medium pointer-events-none">
              SOL
            </span>
          </div>
        </div>
      </div>
      {parseFloat(buyValue) > 0 && (
        <div className="text-right text-xs text-neutral-400">
          ≈ {calculatePercentage(calculateTokensFromSol(parseFloat(buyValue))).toFixed(2)} % of supply
        </div>
      )}

      {/* Balance information */}
      <div className="mt-2 text-right text-xs text-neutral-400">
        Balance: {solBalance?.toFixed(2) ?? "0.00"} SOL
        {isAuthenticated && isFormValid && insufficientBalance && (
          <div className="text-red-500 mt-1">
            Insufficient SOL balance (need ~0.05 SOL for mint + buy amount)
          </div>
        )}
        {Number(buyValue) === maxInputSol && maxInputSol < MAX_INITIAL_SOL && (
          <div className="text-yellow-500 mt-1">
            Maximum amount based on your balance
          </div>
        )}
      </div>
    </div>
  );
}; 