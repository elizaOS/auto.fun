import { useCallback, useMemo, useState } from "react";
import {
  AgentDetailsForm,
  TwitterDetailsForm,
} from "../../../../types/form.type";
import { useForm as useFormRhf } from "react-hook-form";
import { AgentDetails } from "@/components/forms/AgentDetails";
import { TwitterLoginForm } from "@/components/forms/TwitterLoginForm";

export const useForm = () => {
  const agentForm = useFormRhf<AgentDetailsForm>();
  const twitterForm = useFormRhf<TwitterDetailsForm>();
  const [currentStep, setCurrentStep] = useState<"agent" | "twitter">("agent");

  const back = useCallback(() => {
    switch (currentStep) {
      case "agent":
        break;
      case "twitter":
        setCurrentStep("agent");
        break;
    }
  }, [currentStep]);

  const next = useCallback(() => {
    switch (currentStep) {
      case "agent":
        setCurrentStep("twitter");
        break;
      case "twitter":
        break;
    }
  }, [currentStep]);

  const canGoNext = useMemo(() => {
    switch (currentStep) {
      case "agent":
        return agentForm.formState.isValid;
      case "twitter":
        return twitterForm.formState.isValid;
    }
  }, [agentForm.formState.isValid, currentStep, twitterForm.formState.isValid]);

  const FormBody = useMemo(() => {
    switch (currentStep) {
      case "agent":
        return <AgentDetails form={agentForm} mode="create" />;
      case "twitter":
        return <TwitterLoginForm form={twitterForm} />;
    }
  }, [agentForm, currentStep, twitterForm]);

  const getFormValues = useCallback(() => {
    const twitterCredentials = twitterForm.getValues();
    const agentDetails = agentForm.getValues();

    return { twitterCredentials, agentDetails };
  }, [agentForm, twitterForm]);

  const canGoBack = useMemo(() => currentStep !== "agent", [currentStep]);

  return {
    currentStep,
    back,
    next,
    canGoNext,
    FormBody,
    getFormValues,
    canGoBack,
    agentForm,
  };
};
