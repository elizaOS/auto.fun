export function secondsToTimeUnits(totalSeconds: number) {
  const weeks = Math.floor(totalSeconds / (7 * 24 * 60 * 60));
  const remainingAfterWeeks = totalSeconds % (7 * 24 * 60 * 60);

  const days = Math.floor(remainingAfterWeeks / (24 * 60 * 60));
  const remainingAfterDays = remainingAfterWeeks % (24 * 60 * 60);

  const hours = Math.floor(remainingAfterDays / (60 * 60));
  const remainingAfterHours = remainingAfterDays % (60 * 60);

  const minutes = Math.floor(remainingAfterHours / 60);
  const seconds = remainingAfterHours % 60;

  return {
    weeks,
    days,
    hours,
    minutes,
    seconds,
  };
}
