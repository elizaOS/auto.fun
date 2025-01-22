import { useState, useEffect, useCallback } from "react";

// syncs across tabs and other rendered hooks
function useLocalStorage<T extends string | number | boolean>(
  key: string,
  defaultValue: T,
): [T, (value: T) => void] {
  const isLocalStorageAvailable = () => {
    try {
      localStorage.setItem("__test__", "__test__");
      localStorage.removeItem("__test__");
      return true;
    } catch {
      return false;
    }
  };

  // Parse stored value based on its type
  const parseValue = useCallback(
    (storedValue: string): T => {
      if (typeof defaultValue === "boolean") {
        return (storedValue === "true") as T;
      }
      if (typeof defaultValue === "number") {
        return Number(storedValue) as T;
      }
      return storedValue as T;
    },
    [defaultValue],
  );

  // Initialize state with existing value from localStorage or default
  const [value, setValue] = useState<T>(() => {
    if (!isLocalStorageAvailable()) return defaultValue;

    const storedValue = localStorage.getItem(key);
    if (storedValue === null) return defaultValue;

    try {
      return parseValue(storedValue);
    } catch (error) {
      console.error(
        `Error parsing localStorage value for key "${key}":`,
        error,
      );
      return defaultValue;
    }
  });

  // Create a custom event name for this key
  const eventName = `localStorage-${key}`;

  const updateValue = (newValue: T) => {
    setValue(newValue);

    if (isLocalStorageAvailable()) {
      // Update localStorage
      localStorage.setItem(key, String(newValue));

      // Dispatch custom event for same-page updates
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: String(newValue),
        }),
      );
    }
  };

  useEffect(() => {
    if (!isLocalStorageAvailable()) return;

    // Handle storage events (cross-tab)
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === key && event.newValue !== null) {
        try {
          setValue(parseValue(event.newValue));
        } catch (error) {
          console.error(
            `Error parsing storage event value for key "${key}":`,
            error,
          );
        }
      }
    };

    // Handle custom events (same-page)
    const handleCustomEvent = (event: CustomEvent) => {
      try {
        setValue(parseValue(event.detail));
      } catch (error) {
        console.error(
          `Error parsing custom event value for key "${key}":`,
          error,
        );
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(eventName, handleCustomEvent as EventListener);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(eventName, handleCustomEvent as EventListener);
    };
  }, [eventName, key, parseValue]);

  return [value, updateValue];
}

export default useLocalStorage;
