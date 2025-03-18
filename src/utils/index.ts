import relativeTime from "dayjs/plugin/relativeTime";
import dayjs from "dayjs";

dayjs.extend(relativeTime);

export const moment = dayjs;

export const shortenAddress = (address: string) => {
  return address.slice(0, 3) + "..." + address.slice(-3);
};

export const abbreviateNumber = (num: number): string => {
  const absNum = Math.abs(num);
  if (absNum < 1000) return num.toString();

  const units = ["K", "M", "B", "T"];
  // Determine the exponent by finding how many groups of 3 digits the number has.
  let exponent = Math.floor(Math.log10(absNum) / 3);
  // Clamp exponent to the length of our units array.
  if (exponent > units.length) exponent = units.length;
  const unit = units[exponent - 1];
  const scaled = absNum / Math.pow(1000, exponent);
  const formatted = scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(1);

  return (num < 0 ? "-" : "") + formatted + unit;
};
