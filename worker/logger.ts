const getTimestamp = () => {
  return new Date().toISOString();
};

export const logger = {
  log: (...args: any[]) => {
    console.log(`[${getTimestamp()}]`, ...args);
  },
  info: (...args: any[]) => {
    console.info(`[${getTimestamp()}]`, ...args);
  },
  warn: (...args: any[]) => {
    console.warn(`[${getTimestamp()}]`, ...args);
  },
  error: (...args: any[]) => {
    console.error(`[${getTimestamp()}]`, ...args);
  },
};
