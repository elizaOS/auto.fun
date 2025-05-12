import { FormImageInput } from "../forms/FormImageInput";
import { FormTextArea } from "../forms/FormTextArea";
import { FormTab } from "../types";
import { BuySection } from "./BuySection";
import { LaunchButton } from "./LaunchButton";
import { VanityAddressSection } from "./VanityAddressSection";

interface FormSectionProps {
  activeTab: FormTab;
  hasGeneratedToken: boolean;
  hasStoredToken: boolean;
  form: {
    name: string;
    symbol: string;
    description: string;
    initialSol: string;
    links: {
      twitter: string;
      telegram: string;
      website: string;
      discord: string;
      farcaster: string;
    };
  };
  errors: {
    name: string;
    symbol: string;
    description: string;
    prompt: string;
    initialSol: string;
    userPrompt: string;
    importAddress: string;
    percentage: string;
  };
  isGenerating: boolean;
  generatingField: string | null;
  imageFile: File | null;
  coinDropImageUrl: string | null;
  autoForm: {
    name: string;
    symbol: string;
    description: string;
    prompt: string;
    concept: string;
    imageUrl: string | null;
  };
  manualForm: {
    name: string;
    symbol: string;
    description: string;
    imageFile: File | null;
  };
  buyValue: string;
  solBalance: number;
  isAuthenticated: boolean;
  isFormValid: boolean;
  insufficientBalance: boolean;
  maxInputSol: number;
  isSubmitting: boolean;
  isCreating: boolean;
  canLaunch: () => boolean;
  onImageChange: (file: File | null) => void;
  onPromptChange: (prompt: string) => void;
  onPromptFunctionsChange: (
    setPrompt: ((prompt: string) => void) | null,
    onPromptChange: ((prompt: string) => void) | null,
  ) => void;
  onPreviewChange: (previewUrl: string | null) => void;
  onDirectPreviewSet: (
    setter: ((preview: string | null) => void) | null,
  ) => void;
  onNameChange: (value: string) => void;
  onTickerChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onBuyValueChange: (value: string) => void;
  onGenerateAll: () => void;
  // Vanity props
  isGeneratingVanity: boolean;
  displayedPublicKey: string;
  vanitySuffix: string;
  vanityResult: { publicKey: string; secretKey: any } | null;
  suffixError: string | null;
  onSuffixChange: (suffix: string) => void;
  onGenerateClick: () => void;
}

export const FormSection = ({
  activeTab,
  hasGeneratedToken,
  hasStoredToken,
  form,
  errors,
  isGenerating,
  generatingField,
  imageFile,
  coinDropImageUrl,
  autoForm,
  manualForm,
  buyValue,
  solBalance,
  isAuthenticated,
  isFormValid,
  insufficientBalance,
  maxInputSol,
  isSubmitting,
  isCreating,
  canLaunch,
  onImageChange,
  onPromptChange,
  onPromptFunctionsChange,
  onPreviewChange,
  onDirectPreviewSet,
  onNameChange,
  onTickerChange,
  onDescriptionChange,
  onBuyValueChange,
  onGenerateAll,
  // Vanity props
  isGeneratingVanity,
  displayedPublicKey,
  vanitySuffix,
  vanityResult,
  suffixError,
  onSuffixChange,
  onGenerateClick,
}: FormSectionProps) => {
  if (
    !(
      activeTab === FormTab.MANUAL ||
      (activeTab === FormTab.AUTO && hasGeneratedToken) ||
      (activeTab === FormTab.IMPORT && hasStoredToken)
    )
  ) {
    return null;
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3">
        <FormImageInput
          onChange={onImageChange}
          onPromptChange={onPromptChange}
          isGenerating={isGenerating && generatingField === "prompt"}
          setIsGenerating={() => {}}
          setGeneratingField={() => {}}
          onPromptFunctionsChange={onPromptFunctionsChange}
          onPreviewChange={onPreviewChange}
          imageUrl={
            activeTab === FormTab.AUTO
              ? autoForm.imageUrl
              : activeTab === FormTab.IMPORT && hasStoredToken
                ? coinDropImageUrl
                : undefined
          }
          onDirectPreviewSet={onDirectPreviewSet}
          activeTab={activeTab}
          nameValue={form.name}
          onNameChange={onNameChange}
          tickerValue={form.symbol}
          onTickerChange={onTickerChange}
          key={`image-input-${activeTab}`}
        />

        {activeTab === FormTab.IMPORT ? (
          <span className="bg-transparent text-white text-xl font-bold focus:outline-none px-1 py-0.5 mb-4">
            {form.description}
          </span>
        ) : (
          <FormTextArea
            value={form.description}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              onDescriptionChange(e.target.value)
            }
            label="Description"
            minRows={1}
            placeholder="Description"
            maxLength={2000}
            error={errors.description}
            onClick={onGenerateAll}
            isLoading={isGenerating && generatingField === "description"}
          />
        )}
      </div>

      <VanityAddressSection
        activeTab={activeTab}
        isGeneratingVanity={isGeneratingVanity}
        displayedPublicKey={displayedPublicKey}
        vanitySuffix={vanitySuffix}
        vanityResult={vanityResult}
        suffixError={suffixError}
        onSuffixChange={onSuffixChange}
        onGenerateClick={onGenerateClick}
      />

      <BuySection
        activeTab={activeTab}
        buyValue={buyValue}
        solBalance={solBalance}
        isAuthenticated={isAuthenticated}
        isFormValid={isFormValid}
        insufficientBalance={insufficientBalance}
        maxInputSol={maxInputSol}
        onBuyValueChange={onBuyValueChange}
      />

      <LaunchButton
        activeTab={activeTab}
        isSubmitting={isSubmitting}
        isCreating={isCreating}
        isAuthenticated={isAuthenticated}
        canLaunch={canLaunch()}
        hasStoredToken={hasStoredToken}
      />
    </div>
  );
};
