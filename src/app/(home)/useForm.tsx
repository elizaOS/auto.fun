import { useCallback, useMemo, useState } from "react";
import {
  AgentDetails,
  TokenMetadataForm,
  TwitterDetailsForm,
} from "./form.types";
import { TokenCreationForm } from "./TokenCreationForm";
import { AgentCreationForm } from "./AgentCreationForm";
import { TwitterLoginForm } from "./TwitterLoginForm";
import { useForm as useFormRhf } from "react-hook-form";
import { FormStep } from "./page";

export const useForm = () => {
  const tokenForm = useFormRhf<TokenMetadataForm>();
  const agentForm = useFormRhf<AgentDetails>();
  const twitterForm = useFormRhf<TwitterDetailsForm>();
  const [currentStep, setCurrentStep] = useState<FormStep>("token");

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

  const FormBody = useMemo(() => {
    switch (currentStep) {
      case "token":
        return <TokenCreationForm form={tokenForm} />;
      case "agent":
        return <AgentCreationForm form={agentForm} />;
      case "twitter":
        return <TwitterLoginForm form={twitterForm} />;
    }
  }, [agentForm, currentStep, tokenForm, twitterForm]);

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
  };
};
