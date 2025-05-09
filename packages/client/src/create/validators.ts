export const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]+$/;
export function isValidTokenAddress(address: string): boolean {
  return (
    BASE58_REGEX.test(address) && address.length >= 32 && address.length <= 44
  );
}
