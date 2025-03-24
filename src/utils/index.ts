import relativeTime from "dayjs/plugin/relativeTime";
import dayjs from "dayjs";

dayjs.extend(relativeTime);

const moment = dayjs;

export const LAMPORTS_PER_SOL = 1000000000;

export const normalizedProgress = (progress: number) =>
  Math.round(Math.min(100, progress));

export const shortenAddress = (address: string) => {
  return address.slice(0, 3) + "..." + address.slice(-3);
};

export const abbreviateNumber = (num: number): string => {
  const absNum = Math.abs(Number(num));
  if (absNum < 1000) return formatNumber(num);

  const units = ["K", "M", "B", "T"];
  let exponent = Math.floor(Math.log10(absNum) / 3);
  if (exponent > units.length) exponent = units.length;
  const unit = units[exponent - 1];
  const scaled = absNum / Math.pow(1000, exponent);
  const formatted = scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(1);

  return `$${(num < 0 ? "-" : "") + formatted + unit}`;
};

export const formatNumber = (
  num: number,
  showDecimals?: boolean,
  hideDollarSign?: boolean,
) => {
  const formatted = Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: showDecimals ? "standard" : "compact",
  }).format(num);

  if (hideDollarSign) {
    return formatted?.replace("$", "");
  }

  return formatted;
};

export const fromNow = (
  date: string | Date | number,
  hideAgo?: boolean,
): string => {
  const now = String(moment(date).fromNow());
  if (hideAgo) {
    return String(moment(date).fromNow()).replace("ago", "");
  }
  return now;
};

function toSubscript(num: number): string {
  const subDigits: { [key: string]: string } = {
    "0": "\u2080",
    "1": "\u2081",
    "2": "\u2082",
    "3": "\u2083",
    "4": "\u2084",
    "5": "\u2085",
    "6": "\u2086",
    "7": "\u2087",
    "8": "\u2088",
    "9": "\u2089",
  };
  return num
    .toString()
    .split("")
    .map((digit) => subDigits[digit] || digit)
    .join("");
}

export const formatNumberSubscript = (num: number): string => {
  if (num === 0) return "0";
  let sign = "";
  if (num < 0) {
    sign = "-";
    num = Math.abs(num);
  }
  if (num >= 1) {
    return sign + num.toString();
  }
  const expStr = num.toExponential();
  const [mantissa, exponentStr] = expStr.split("e");
  const exponent = parseInt(exponentStr, 10);
  const totalZeros = -exponent - 1;
  const mantissaDigits = mantissa.replace(".", "");

  if (totalZeros > 1) {
    return sign + "0.0" + toSubscript(totalZeros - 1) + mantissaDigits;
  } else {
    return sign + "0." + "0".repeat(totalZeros) + mantissaDigits;
  }
};
