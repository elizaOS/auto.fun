import { useEffect, useState } from "react";

export const useInterval = ({
  ms,
  resolver,
}: {
  ms: number;
  resolver: any;
}) => {
  const [value, setValue] = useState(resolver());
  useEffect(() => {
    const interval = setInterval(() => {
      setValue(resolver());
    }, ms);

    return () => {
      clearInterval(interval);
    };
  }, [resolver, ms]);

  return value;
};
