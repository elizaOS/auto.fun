const getTimestamp = () => {
    return new Date().toISOString();
};
export const logger = {
    log: (...args) => {
        console.log(`[${getTimestamp()}]`, ...args);
    },
    error: (...args) => {
        console.error(`[${getTimestamp()}]`, ...args);
    }
};
