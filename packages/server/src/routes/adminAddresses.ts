import 'dotenv/config';

// Parse admin addresses from comma-separated string to array
const parseAdminAddresses = (addressesStr: string | undefined): string[] => {
  if (!addressesStr) return [];
  return addressesStr.split(',').map(addr => addr.trim());
};

// Load from environment or use defaults
export const adminAddresses: string[] = parseAdminAddresses(process.env.ADMIN_ADDRESSES) || [];
