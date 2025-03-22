import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
/**
 * Initialize a connection to Solana DevNet
 */
export function initDevnetConnection() {
    return new Connection("https://api.devnet.solana.com", "confirmed");
}
/**
 * Get the associated token account address
 */
export function getAssociatedTokenAccount(ownerPubkey, mintPk) {
    const associatedTokenAccountPubkey = (PublicKey.findProgramAddressSync([
        ownerPubkey.toBytes(),
        TOKEN_PROGRAM_ID.toBytes(),
        mintPk.toBytes(),
    ], ASSOCIATED_TOKEN_PROGRAM_ID))[0];
    return associatedTokenAccountPubkey;
}
/**
 * Create test keypairs
 */
export function createTestKeys() {
    return {
        adminKp: Keypair.generate(),
        userKp: Keypair.generate(),
        testTokenKp: Keypair.generate(),
    };
}
/**
 * Wait for a specified number of milliseconds
 */
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Build API URL from endpoint
 */
export function apiUrl(baseUrl, endpoint) {
    return `${baseUrl}/api${endpoint}`;
}
/**
 * Helper to make API requests with authentication
 */
export async function fetchWithAuth(url, method = 'GET', body, apiKey, extraHeaders) {
    const headers = {
        'Content-Type': 'application/json',
    };
    if (apiKey) {
        headers['X-API-Key'] = apiKey;
    }
    // Merge any extra headers
    if (extraHeaders) {
        Object.entries(extraHeaders).forEach(([key, value]) => {
            headers[key] = value;
        });
    }
    const options = {
        method,
        headers,
    };
    if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
    }
    // Make a real request without any fallback to mocks
    const response = await fetch(url, options);
    let data;
    try {
        data = await response.json();
    }
    catch (e) {
        console.warn(`Error parsing JSON from ${url}: ${e}`);
        data = {};
    }
    return { response, data };
}
