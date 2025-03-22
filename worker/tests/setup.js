import { unstable_dev } from 'wrangler';
import { afterAll, beforeAll } from 'vitest';
import { createTestKeys, initDevnetConnection } from './helpers/test-utils';
export async function setupWorkerTest() {
    // Create a worker instance
    const worker = await unstable_dev('worker/index.ts', {
        experimental: { disableExperimentalWarning: true },
        vars: {
            NETWORK: 'devnet',
            DECIMALS: '9',
            TOKEN_SUPPLY: '1000000000000000000',
            VIRTUAL_RESERVES: '1000000000',
            CURVE_LIMIT: '1000000000000',
            // Add necessary environment variables for authentication
            ADMIN_API_KEY: 'admin-test-key',
            USER_API_KEY: 'test-api-key',
            // Add real keys for proper authentication if needed
            JWT_SECRET: 'test-jwt-secret',
        },
    });
    // Initialize DevNet connection
    const connection = initDevnetConnection();
    // Create test key pairs
    const { adminKp, userKp, testTokenKp } = createTestKeys();
    console.log('Test keypairs created:');
    console.log('Admin pubkey:', adminKp.publicKey.toBase58());
    console.log('User pubkey:', userKp.publicKey.toBase58());
    console.log('Token pubkey:', testTokenKp.publicKey.toBase58());
    // Get base URL for API requests - accessing as any due to type inconsistencies in wrangler
    const baseUrl = worker.url || `http://localhost:8787`;
    console.log(`Using API base URL: ${baseUrl}`);
    return {
        worker,
        connection,
        adminKp,
        userKp,
        testTokenKp,
        baseUrl,
    };
}
// Create a shared state storage
export const testState = {};
export function registerWorkerHooks(ctx) {
    beforeAll(async () => {
        ctx.context = await setupWorkerTest();
    });
    afterAll(async () => {
        if (ctx.context?.worker) {
            await ctx.context.worker.stop();
        }
    });
}
