import { Icons } from "@/components/icons";

interface ImportStatus {
  type: "success" | "error" | "warning";
  message: string;
}

interface ImportTabContentProps {
  importAddress: string;
  onImportAddressChange: (val: string) => void;
  handleImportAddressPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  errors: { importAddress?: string; [k: string]: string | undefined };
  isImporting: boolean;
  isValidTokenAddress: (address: string) => boolean;
  importTokenFromAddress: () => Promise<void>;
  importStatus: ImportStatus | null;
}

export const ImportTabContent = ({
  importAddress,
  onImportAddressChange,
  handleImportAddressPaste,
  errors,
  isImporting,
  isValidTokenAddress,
  importTokenFromAddress,
  importStatus,
}: ImportTabContentProps) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-row">
          <input
            type="text"
            value={importAddress}
            onChange={(e) => onImportAddressChange(e.target.value)}
            onPaste={handleImportAddressPaste}
            placeholder="Enter any Solana token address (mint)"
            className="flex-1 truncate my-2 p-0 border-b-2 pb-2.5 border-b-[#03FF24] text-white bg-transparent focus:outline-none focus:border-b-white"
          />
          <button
            type="button"
            onClick={importTokenFromAddress}
            disabled={
              isImporting ||
              !importAddress.trim() ||
              !isValidTokenAddress(importAddress)
            }
            className="p-0 transition-colors disabled:opacity-50"
          >
            <img
              src={
                isImporting ? "/create/importing.svg" : "/create/importup.svg"
              }
              alt="Import"
              className="w-32 mb-2"
              onMouseDown={(e) => {
                const img = e.target as HTMLImageElement;
                if (!isImporting) {
                  img.src = "/create/importdown.svg";
                }
              }}
              onMouseUp={(e) => {
                const img = e.target as HTMLImageElement;
                if (!isImporting) {
                  img.src = "/create/importup.svg";
                }
              }}
              onDragStart={(e) => {
                e.preventDefault();
                const img = e.target as HTMLImageElement;
                if (!isImporting) {
                  img.src = "/create/importup.svg";
                }
              }}
              onMouseOut={(e) => {
                e.preventDefault();
                const img = e.target as HTMLImageElement;
                if (!isImporting) {
                  img.src = "/create/importup.svg";
                }
              }}
            />
          </button>
        </div>
        {errors.importAddress && (
          <div className="text-red-500 text-sm">{errors.importAddress}</div>
        )}

        {importStatus && (
          <div
            className={`p-3 border mb-4 ${
              importStatus.type === "error"
                ? "border-red-500 bg-red-950/20 text-red-400"
                : importStatus.type === "warning"
                  ? "border-yellow-500 bg-yellow-950/20 text-yellow-400"
                  : "border-green-500 bg-green-950/20 text-[#03FF24]"
            }`}
          >
            <div className="flex items-center gap-2 text-sm">
              {importStatus.type === "success" ? (
                <Icons.Check className="w-5 h-5 flex-shrink-0" />
              ) : importStatus.type === "warning" ? (
                <Icons.Warning className="w-5 h-5 flex-shrink-0" />
              ) : (
                <Icons.XCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <span>{importStatus.message}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
