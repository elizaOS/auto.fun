"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { secondsToTimeUnits } from "./utils/secondsToTimeUnits";

type Props = {
  totalSeconds: number;
  setTotalSeconds: (totalSeconds: number) => void;
  isCreatingPool?: boolean;
};

type TimeUnit = "weeks" | "days" | "hours" | "minutes";

export default function DurationSelectSection({
  totalSeconds,
  setTotalSeconds,
  isCreatingPool = false,
}: Props) {
  const [time, setTime] = useState(secondsToTimeUnits(totalSeconds));

  useEffect(() => {
    console.log("time", time);
  }, [time]);

  useEffect(() => {
    const newTotalSeconds =
      time.weeks * 7 * 24 * 60 * 60 +
      time.days * 24 * 60 * 60 +
      time.hours * 60 * 60 +
      time.minutes * 60;
    setTotalSeconds(newTotalSeconds);
  }, [time]);

  const incrementTime = (unit: TimeUnit, amount: number) => {
    setTime((prevTime) => {
      const newTime = { ...prevTime };
      newTime[unit] += amount;

      // Ensure no negative values
      if (newTime[unit] < 0) {
        newTime[unit] = 0;
      }

      // Handle overflow
      if (unit === "minutes" && newTime.minutes >= 60) {
        newTime.hours += Math.floor(newTime.minutes / 60);
        newTime.minutes %= 60;
      }
      if (unit === "hours" || newTime.hours >= 24) {
        newTime.days += Math.floor(newTime.hours / 24);
        newTime.hours %= 24;
      }
      if (unit === "days" || newTime.days >= 7) {
        newTime.weeks += Math.floor(newTime.days / 7);
        newTime.days %= 7;
      }

      return newTime;
    });
  };

  const formatTime = (time: {
    weeks: number;
    days: number;
    hours: number;
    minutes: number;
  }) => {
    const parts = [];
    if (time.weeks)
      parts.push(`${time.weeks} week${time.weeks !== 1 ? "s" : ""}`);
    if (time.days) parts.push(`${time.days} day${time.days !== 1 ? "s" : ""}`);
    if (time.hours)
      parts.push(`${time.hours} hour${time.hours !== 1 ? "s" : ""}`);
    if (time.minutes)
      parts.push(`${time.minutes} minute${time.minutes !== 1 ? "s" : ""}`);
    return parts.join(", ") || "0 minutes";
  };

  const TimeUnitControl = ({
    unit,
    label,
  }: {
    unit: TimeUnit;
    label: string;
  }) => (
    <div className="flex flex-col items-center">
      <div className="font-semibold mb-2">{label}</div>
      <div className="flex space-x-2">
        <button
          disabled={isCreatingPool}
          className="flex items-center justify-center text-primary hover:text-black outline outline-primary hover:bg-primary transition ease-in-out h-5 w-5 md:h-8 md:w-8 disabled:bg-gray-700 disabled:cursor-not-allowed"
          onClick={() => incrementTime(unit, -1)}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          disabled={isCreatingPool}
          className="flex items-center justify-center text-primary hover:text-black outline outline-primary hover:bg-primary transition ease-in-out h-5 w-5 md:h-8 md:w-8 disabled:bg-gray-700 disabled:cursor-not-allowed"
          onClick={() => incrementTime(unit, 1)}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="">
      <div className="text-xl font-semibold text-center mb-2">
        {formatTime(time)}
      </div>
      <div className="text-neutral text-center text-muted-foreground mb-3">
        Total seconds: {totalSeconds}
      </div>
      <div className="grid grid-cols-4 gap-4">
        <TimeUnitControl key="weeks" unit="weeks" label="Weeks" />
        <TimeUnitControl key="days" unit="days" label="Days" />
        <TimeUnitControl key="hours" unit="hours" label="Hours" />
        <TimeUnitControl key="minutes" unit="minutes" label="Minutes" />
      </div>
    </div>
  );
}
