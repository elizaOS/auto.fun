import { useCallback, useMemo, useState } from "react";
import {
  AgentDetailsForm,
  TokenMetadataForm,
  TwitterDetailsForm,
} from "../../../types/form.type";
import { TokenCreationForm } from "./TokenCreationForm";
import { useForm as useFormRhf } from "react-hook-form";
import { FormStep } from "./page";
import { AgentDetails } from "@/components/forms/AgentDetails";
import { useGenerateAllAdvancedAgentDetails } from "@/utils/agent";
import { TwitterLoginForm } from "@/components/forms/TwitterLoginForm";
import { useRateLimiter } from "@/hooks/useRateLimiter";

export const useForm = () => {
  const tokenForm = useFormRhf<TokenMetadataForm>();
  const agentForm = useFormRhf<AgentDetailsForm>();
  const twitterForm = useFormRhf<TwitterDetailsForm>();
  const [currentStep, setCurrentStep] = useState<FormStep>("token");
  const {
    mutateAsync: generateAllAdvancedAgentDetails,
    isPending: advancedDetailsPending,
  } = useGenerateAllAdvancedAgentDetails();
  const [hasOpenedAdvancedCreation, setHasOpenedAdvancedCreation] =
    useState(false);

  const { isRateLimited, makeApiCall } = useRateLimiter({
    limit: 3,
    timeWindow: 60 * 1000,
  });

  const onRefreshAll = useCallback(async () => {
    if (isRateLimited) {
      return;
    }

    const agentFormValues = agentForm.getValues();

    const advancedDetails = await generateAllAdvancedAgentDetails({
      inputs: {
        name: agentFormValues.name,
        description: agentFormValues.description,
        personality: agentFormValues.personality,
      },
    });
    makeApiCall();

    Object.entries(advancedDetails).forEach(([field, value]) => {
      agentForm.setValue(field as keyof typeof advancedDetails, value);
    });
  }, [agentForm, generateAllAdvancedAgentDetails, isRateLimited, makeApiCall]);

  const back = useCallback(() => {
    switch (currentStep) {
      case "token":
        break;
      case "agent":
        setCurrentStep("token");
        break;
      case "twitter":
        setCurrentStep("agent");
        break;
    }
  }, [currentStep]);

  const next = useCallback(() => {
    switch (currentStep) {
      case "token":
        setCurrentStep("agent");
        break;
      case "agent":
        setCurrentStep("twitter");
        break;
      case "twitter":
        break;
    }
  }, [currentStep]);

  const canGoNext = useMemo(() => {
    switch (currentStep) {
      case "token":
        return tokenForm.formState.isValid;
      case "agent":
        return agentForm.formState.isValid;
      case "twitter":
        return twitterForm.formState.isValid;
    }
  }, [
    agentForm.formState.isValid,
    currentStep,
    tokenForm.formState.isValid,
    twitterForm.formState.isValid,
  ]);

  const onAdvancedCreationOpen = useCallback(async () => {
    if (hasOpenedAdvancedCreation) return;

    const agentFormValues = agentForm.getValues();

    const advancedDetails = await generateAllAdvancedAgentDetails({
      inputs: {
        name: agentFormValues.name,
        description: agentFormValues.description,
        personality: agentFormValues.personality,
      },
    });

    setHasOpenedAdvancedCreation(true);

    Object.entries(advancedDetails).forEach(([field, value]) => {
      agentForm.setValue(field as keyof typeof advancedDetails, value);
    });
  }, [agentForm, generateAllAdvancedAgentDetails, hasOpenedAdvancedCreation]);

  const FormBody = useMemo(() => {
    switch (currentStep) {
      case "token":
        return <TokenCreationForm form={tokenForm} />;
      case "agent":
        return (
          <AgentDetails
            form={agentForm}
            onAdvancedCreationOpen={onAdvancedCreationOpen}
            onRefreshAll={onRefreshAll}
            isRateLimited={isRateLimited}
          />
        );
      case "twitter":
        return <TwitterLoginForm form={twitterForm} />;
    }
  }, [
    agentForm,
    currentStep,
    isRateLimited,
    onAdvancedCreationOpen,
    onRefreshAll,
    tokenForm,
    twitterForm,
  ]);

  const getFormValues = useCallback(() => {
    const tokenMetadata = tokenForm.getValues();
    const twitterCredentials = twitterForm.getValues();
    const agentDetails = agentForm.getValues();

    return { tokenMetadata, twitterCredentials, agentDetails };
  }, [agentForm, tokenForm, twitterForm]);

  const canGoBack = useMemo(() => currentStep !== "token", [currentStep]);

  return {
    currentStep,
    back,
    next,
    canGoNext,
    FormBody,
    getFormValues,
    canGoBack,
    advancedDetailsPending,
  };
};
