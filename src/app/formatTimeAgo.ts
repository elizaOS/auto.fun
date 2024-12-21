import { useState, useEffect } from "react";
import { formatDistanceToNow, differenceInSeconds } from "date-fns";

const formatTimeAgo = (date: Date): string => {
  const seconds = differenceInSeconds(new Date(), date);

  if (seconds < 60) {
    return `${seconds} ${seconds === 1 ? "second" : "seconds"} ago`;
  }

  return formatDistanceToNow(date, { addSuffix: true });
};

export const useTimeAgo = <T extends string | string[]>(dates: T) => {
  type ReturnType = T extends string[] ? string[] : string;

  const [timeAgo, setTimeAgo] = useState<ReturnType>(() =>
    Array.isArray(dates)
      ? (dates.map(() => "") as ReturnType)
      : ("" as ReturnType),
  );

  useEffect(() => {
    if (!dates || (Array.isArray(dates) && dates.length === 0)) {
      setTimeAgo((Array.isArray(dates) ? [] : "") as ReturnType);
      return;
    }

    const updateTime = () => {
      if (Array.isArray(dates)) {
        setTimeAgo(
          dates.map((date) => formatTimeAgo(new Date(date))) as ReturnType,
        );
      } else {
        setTimeAgo(formatTimeAgo(new Date(dates as string)) as ReturnType);
      }
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);

    return () => clearInterval(timer);
  }, [dates]);

  return timeAgo;
};
