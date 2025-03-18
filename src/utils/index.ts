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
  let exponent = Math.floor(Math.log10(absNum) / 3);
  if (exponent > units.length) exponent = units.length;
  const unit = units[exponent - 1];
  const scaled = absNum / Math.pow(1000, exponent);
  const formatted = scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(1);

  return (num < 0 ? "-" : "") + formatted + unit;
};

export const formatNumber = (num: number) => {
  return Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
  }).format(num);
};

export const fromNow = (date: Date | number, hideAgo?: boolean): string => {
  const now = String(moment(date).fromNow());
  if (hideAgo) {
    return String(moment(date).fromNow()).replace("ago", "");
  }
  return now;
};
