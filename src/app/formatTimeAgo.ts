import { useState, useEffect } from "react";
import { formatDistanceToNow, differenceInSeconds } from "date-fns";

const formatTimeAgo = (date: Date): string => {
  const seconds = differenceInSeconds(new Date(), date);

  if (seconds < 60) {
    return `${seconds} ${seconds === 1 ? "second" : "seconds"} ago`;
  }

  return formatDistanceToNow(date, { addSuffix: true });
};

export const useTimeAgo = (date: string): string => {
  const [timeAgo, setTimeAgo] = useState<string>("");

  useEffect(() => {
    if (!date) {
      setTimeAgo("");
      return;
    }

    const updateTime = () => {
      setTimeAgo(formatTimeAgo(new Date(date)));
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);

    return () => clearInterval(timer);
  }, [date]);

  return timeAgo;
};
