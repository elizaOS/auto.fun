import { useSearchParams } from "react-router";
import { useState, useCallback, useEffect } from "react";

export function useUrlSearchParams<T>(
  key: string,
  defaultValue: T,
): [T, (value: T | ((val: T) => T)) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  // Get initial value from URL or use default
  const getValueFromUrl = (): T => {
    const param = searchParams.get(key);
    if (param === null) return defaultValue;

    try {
      // Try to parse as JSON for complex types
      return JSON.parse(param) as T;
    } catch {
      // If not valid JSON, return as is (for strings, etc.)
      return param as unknown as T;
    }
  };

  const [value, setValue] = useState<T>(getValueFromUrl());

  // Update state when URL changes
  useEffect(() => {
    setValue(getValueFromUrl());
  }, [searchParams]);

  // Update URL when state changes
  const updateValue = useCallback(
    (newValue: T | ((val: T) => T)) => {
      const updatedValue =
        typeof newValue === "function"
          ? (newValue as (val: T) => T)(value)
          : newValue;

      setValue(updatedValue);

      const newParams = new URLSearchParams(searchParams);

      if (
        typeof updatedValue === "string" ||
        typeof updatedValue === "number" ||
        typeof updatedValue === "boolean"
      ) {
        newParams.set(key, String(updatedValue));
      } else {
        // For objects and arrays, stringify to JSON
        newParams.set(key, JSON.stringify(updatedValue));
      }

      setSearchParams(newParams);
    },
    [key, value, searchParams, setSearchParams],
  );

  return [value, updateValue];
}
