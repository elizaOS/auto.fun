import { useState, useEffect } from "react";
import {
  differenceInSeconds,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
  differenceInMonths,
  differenceInYears,
} from "date-fns";

const formatTimeAgo = (date: Date): string => {
  const now = new Date();

  const seconds = differenceInSeconds(now, date);
  if (seconds < 60) {
    return `${seconds} Sec`;
  }

  const minutes = differenceInMinutes(now, date);
  if (minutes < 60) {
    return `${minutes} Min`;
  }

  const hours = differenceInHours(now, date);
  if (hours < 24) {
    return `${hours} Hour`;
  }

  const days = differenceInDays(now, date);
  if (days < 30) {
    return `${days} Day`;
  }

  const months = differenceInMonths(now, date);
  if (months < 12) {
    return `${months} Month`;
  }

  const years = differenceInYears(now, date);
  return `${years} Year`;
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

export default formatTimeAgo;
