import { useState, useCallback } from "react";
import { FormTab, FormState, FormErrors } from "../types";
import { MAX_INITIAL_SOL } from "../consts";

interface UseTokenFormProps {
  initialForm?: Partial<FormState>;
  onFormChange?: (form: FormState) => void;
}

export const useTokenForm = ({ initialForm, onFormChange }: UseTokenFormProps = {}) => {
  const [form, setForm] = useState<FormState>({
    name: initialForm?.name || "",
    symbol: initialForm?.symbol || "",
    description: initialForm?.description || "",
    prompt: initialForm?.prompt || "",
    initialSol: initialForm?.initialSol || "0",
    links: {
      twitter: initialForm?.links?.twitter || "",
      telegram: initialForm?.links?.telegram || "",
      website: initialForm?.links?.website || "",
      discord: initialForm?.links?.discord || "",
      farcaster: initialForm?.links?.farcaster || "",
    },
    importAddress: initialForm?.importAddress || "",
  });

  const [errors, setErrors] = useState<FormErrors>({
    name: "",
    symbol: "",
    description: "",
    prompt: "",
    initialSol: "",
    userPrompt: "",
    importAddress: "",
    percentage: "",
  });

  const handleChange = useCallback((field: string, value: string) => {
    setForm((prev) => {
      let newForm;
      if (field.includes(".")) {
        const [parent, child] = field.split(".");
        if (parent === "links") {
          newForm = {
            ...prev,
            links: {
              ...prev.links,
              [child]: value,
            },
          };
        } else {
          newForm = prev;
        }
      } else {
        newForm = {
          ...prev,
          [field]: value,
        };
      }

      if (onFormChange) {
        onFormChange(newForm);
      }

      return newForm;
    });

    if (field === "name" || field === "symbol" || field === "description") {
      if (value) {
        setErrors((prev) => ({
          ...prev,
          [field]: "",
        }));
      } else {
        setErrors((prev) => ({
          ...prev,
          [field]: `${field.charAt(0) + field.slice(1)} is required`,
        }));
      }
    }

    if (field === "initialSol" && value) {
      const numValue = parseFloat(value);
      if (numValue < 0 || numValue > MAX_INITIAL_SOL) {
        setErrors((prev) => ({
          ...prev,
          initialSol: `Max initial SOL is ${MAX_INITIAL_SOL}`,
        }));
      } else {
        setErrors((prev) => ({
          ...prev,
          initialSol: "",
        }));
      }
    }
  }, [onFormChange]);

  const validateForm = useCallback(() => {
    const newErrors = { ...errors };
    let isValid = true;

    if (!form.name) {
      newErrors.name = "Name is required";
      isValid = false;
    }
    if (!form.symbol) {
      newErrors.symbol = "Symbol is required";
      isValid = false;
    }
    if (!form.description) {
      newErrors.description = "Description is required";
      isValid = false;
    }

    const initialSol = parseFloat(form.initialSol);
    if (isNaN(initialSol) || initialSol < 0 || initialSol > MAX_INITIAL_SOL) {
      newErrors.initialSol = `Initial SOL must be between 0 and ${MAX_INITIAL_SOL}`;
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  }, [form, errors]);

  const isFormValid = useCallback(() => {
    return (
      !!form.name &&
      !!form.symbol &&
      !!form.description &&
      !errors.name &&
      !errors.symbol &&
      !errors.description &&
      !errors.initialSol
    );
  }, [form, errors]);

  return {
    form,
    errors,
    handleChange,
    validateForm,
    isFormValid,
    setForm,
    setErrors,
  };
}; 