import { Raydium, TxVersion } from '@raydium-io/raydium-sdk-v2';
import { Connection, Keypair } from '@solana/web3.js';
import { logger } from './logger';
import { getLegacyRpcUrl, getRpcUrl } from './util';
const getOwner = (env) => {
    if (env.WALLET_PRIVATE_KEY) {
        return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env.WALLET_PRIVATE_KEY)));
    }
    return undefined; // Explicitly return undefined when no key is present
};
// Use the legacy getter for initialization
export const connection = new Connection(getLegacyRpcUrl());
export const txVersion = TxVersion.V0; // or TxVersion.LEGACY
export const initSdk = async ({ loadToken = true, env }) => {
    try {
        // Set the cluster from env or use default
        const cluster = env?.NETWORK || process.env.NETWORK || 'mainnet';
        // Get connection based on env if provided
        const sdkConnection = env ? new Connection(getRpcUrl(env)) : connection;
        // Create a new instance each time since we're passing potentially different config
        const raydium = await Raydium.load({
            owner: env ? getOwner(env) : undefined,
            connection: sdkConnection,
            cluster,
            disableFeatureCheck: true,
            disableLoadToken: !loadToken,
            blockhashCommitment: 'finalized',
            // urlConfigs: {
            //   BASE_HOST: '<API_HOST>', // api url configs, currently api doesn't support devnet
            // },
        });
        logger.log(`Raydium SDK: Connected to RPC ${sdkConnection.rpcEndpoint} in ${cluster}`);
        return raydium;
    }
    catch (error) {
        logger.error('Error initializing Raydium SDK:', error);
        throw error; // Re-throw to allow caller to handle
    }
};
