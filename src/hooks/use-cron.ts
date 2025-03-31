import { runCron } from "@/utils/api";
import { useEffect } from "react";

export const useAutoCronTrigger_development = () => {
  useEffect(() => {
    if (!import.meta.env.DEV)
      throw new Error("Cannot manually trigger crons in production");
    runCron()
    setInterval(runCron, 10_000);
  }, []);
};
