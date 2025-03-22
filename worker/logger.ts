const getTimestamp = () => {
  return new Date().toISOString();
};

export const logger = {
  log: (...args: any[]) => {
    console.log(`[${getTimestamp()}]`, ...args);
  },
  error: (...args: any[]) => {
    console.error(`[${getTimestamp()}]`, ...args);
  },
};
