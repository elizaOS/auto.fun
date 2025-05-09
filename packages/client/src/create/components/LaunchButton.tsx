import { FormTab } from "../types";

interface LaunchButtonProps {
  activeTab: FormTab;
  isSubmitting: boolean;
  isCreating: boolean;
  isAuthenticated: boolean;
  canLaunch: boolean;
  hasStoredToken: boolean;
}

export const LaunchButton = ({
  activeTab,
  isSubmitting,
  isCreating,
  isAuthenticated,
  canLaunch,
  hasStoredToken,
}: LaunchButtonProps) => {
  return (
    <div className="flex flex-col items-center gap-3 mt-4">
      <button
        type="submit"
        className="p-0 transition-colors cursor-pointer disabled:opacity-50 select-none"
        disabled={!canLaunch || isSubmitting}
      >
        <img
          src={
            isSubmitting || isCreating
              ? "/create/launching.svg"
              : activeTab === FormTab.IMPORT
              ? "/create/importup-thick.svg"
              : "/create/launchup.svg"
          }
          alt="Launch"
          className="h-32 mb-4 select-none pointer-events-none"
        />
      </button>
      {/* Validation/Auth Messages */}
      {!isAuthenticated ? (
        <p className="text-red-500 text-center text-sm">
          Please connect your wallet to create a token.
        </p>
      ) : !canLaunch && !isSubmitting && activeTab !== FormTab.IMPORT ? (
        <p className="text-red-500 text-center text-sm">
          Please fill required fields, ensure sufficient SOL, and generate a vanity address.
        </p>
      ) : !canLaunch && !isSubmitting && activeTab === FormTab.IMPORT ? (
        <p className="text-red-500 text-center text-sm">
          Please load token data via the import field above.
        </p>
      ) : null}
    </div>
  );
}; 