const CURRENCY_FORMATS = [
  { divisor: 1_000_000_000_000, suffix: "t" },
  { divisor: 1_000_000_000, suffix: "b" },
  { divisor: 1_000_000, suffix: "m" },
  { divisor: 1_000, suffix: "k" },
] as const;

export const formatCurrency = (value: number): string => {
  const format = CURRENCY_FORMATS.find(({ divisor }) => value >= divisor);

  if (format) {
    return `${(value / format.divisor).toFixed(1)}${format.suffix}`;
  }

  return value.toFixed(2);
};
