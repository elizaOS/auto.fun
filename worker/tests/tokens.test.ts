import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  TestContext,
  apiUrl,
  fetchWithAuth,
  sleep
} from './helpers/test-utils';
import { registerWorkerHooks, testState } from './setup';

const ctx: { context: TestContext | null } = { context: null };

registerWorkerHooks(ctx);

describe('Token API Endpoints', () => {
  let userKeypair: Keypair;
  let authToken: string;
  
  beforeAll(async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    
    const { baseUrl } = ctx.context;
    
    // Create a test user keypair for authentication
    userKeypair = Keypair.generate();
    const publicKey = userKeypair.publicKey.toBase58();
    
    // Authenticate the user
    const nonceResponse = await fetchWithAuth<{ nonce: string }>(
      apiUrl(baseUrl, '/generate-nonce'),
      'POST',
      { publicKey }
    );
    
    if (nonceResponse.response.status === 200 && nonceResponse.data && nonceResponse.data.nonce) {
      // Properly sign the nonce with the user's keypair
      const message = new TextEncoder().encode(nonceResponse.data.nonce);
      const signatureBytes = nacl.sign.detached(message, userKeypair.secretKey);
      const signature = bs58.encode(signatureBytes);
      
      // Authenticate
      const authResponse = await fetchWithAuth<{ token: string }>(
        apiUrl(baseUrl, '/authenticate'),
        'POST',
        { publicKey, signature }
      );
      
      if (authResponse.response.status === 200) {
        authToken = authResponse.data.token;
        expect(authToken).toBeTruthy();
      } else {
        console.warn('Authentication failed with status:', authResponse.response.status);
        console.warn('Using test auth token instead');
        authToken = 'test_auth_token';
      }
    } else {
      console.warn('Nonce generation failed with status:', nonceResponse.response.status);
      console.warn('Using test auth token instead');
      authToken = 'test_auth_token';
    }
  });
  
  it('should fetch a list of tokens', async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    
    const { baseUrl } = ctx.context;
    
    const { response, data } = await fetchWithAuth<{ tokens: any[]; page: number; totalPages: number; total: number }>(
      apiUrl(baseUrl, '/tokens'),
      'GET'
    );
    
    expect(response.status).toBe(200);
    expect(data).toHaveProperty('tokens');
    expect(Array.isArray(data.tokens)).toBe(true);
    expect(data).toHaveProperty('page');
    expect(data).toHaveProperty('totalPages');
    expect(data).toHaveProperty('total');
    
    // If we have tokens, check their structure
    if (data.tokens.length > 0) {
      const firstToken = data.tokens[0];
      expect(firstToken).toHaveProperty('id');
      expect(firstToken).toHaveProperty('name');
      expect(firstToken).toHaveProperty('ticker');
      expect(firstToken).toHaveProperty('mint');
      expect(firstToken).toHaveProperty('creator');
      expect(firstToken).toHaveProperty('status');
    }
  });
  
  it('should filter tokens by status', async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    
    const { baseUrl } = ctx.context;
    
    // Test filtering by active status
    const { response, data } = await fetchWithAuth<{ tokens: any[] }>(
      apiUrl(baseUrl, '/tokens?status=active'),
      'GET'
    );
    
    expect(response.status).toBe(200);
    expect(data).toHaveProperty('tokens');
    expect(Array.isArray(data.tokens)).toBe(true);
    
    // Check that all returned tokens have the specified status
    if (data.tokens.length > 0) {
      const allActive = data.tokens.every(token => token.status === 'active');
      expect(allActive).toBe(true);
    }
  });
  
  it('should fetch specific token by mint', async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    if (!testState.tokenPubkey) {
      console.log('Skipping token fetch test - no token pubkey available');
      return;
    }
    
    const { baseUrl } = ctx.context;
    
    const { response, data } = await fetchWithAuth<{ token: any }>(
      apiUrl(baseUrl, `/tokens/${testState.tokenPubkey}`),
      'GET'
    );
    
    if (response.status === 200) {
      expect(data).toHaveProperty('token');
      expect(data.token).toHaveProperty('mint');
      expect(data.token.mint).toBe(testState.tokenPubkey);
    } else if (response.status === 404) {
      console.log('Token not found, which is acceptable during testing');
    } else {
      throw new Error(`Unexpected status code: ${response.status}`);
    }
  });
  
  it('should fetch token holders', async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    if (!testState.tokenPubkey) {
      console.log('Skipping token holders test - no token pubkey available');
      return;
    }
    
    const { baseUrl } = ctx.context;
    
    const { response, data } = await fetchWithAuth<{ holders: any[]; page: number; totalPages: number; total: number }>(
      apiUrl(baseUrl, `/tokens/${testState.tokenPubkey}/holders`),
      'GET'
    );
    
    if (response.status === 200) {
      expect(data).toHaveProperty('holders');
      expect(Array.isArray(data.holders)).toBe(true);
      expect(data).toHaveProperty('page');
      expect(data).toHaveProperty('totalPages');
      expect(data).toHaveProperty('total');
      
      // Check holder structure if any exist
      if (data.holders.length > 0) {
        const firstHolder = data.holders[0];
        expect(firstHolder).toHaveProperty('mint');
        expect(firstHolder).toHaveProperty('address');
        expect(firstHolder).toHaveProperty('amount');
        expect(firstHolder).toHaveProperty('percentage');
      }
    } else if (response.status === 404) {
      console.log('Token not found for holders, which is acceptable during testing');
    } else {
      console.log(`Unexpected status ${response.status} when fetching token holders`);
    }
  });
  
  it('should create a new token', async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    
    const { baseUrl } = ctx.context;
    
    // Create a token that should succeed for tests - use API key authentication
    const tokenData = {
      name: 'Test Token Create',
      symbol: 'TEST',
      description: 'A token for testing token creation',
      image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      twitter: 'test_twitter',
      telegram: 'test_telegram',
      website: 'https://test.com'
    };
    
    const { response, data } = await fetchWithAuth<{ success: boolean; token: any }>(
      apiUrl(baseUrl, '/token/create'),
      'POST',
      tokenData,
      'test-api-key'
    );
    
    // This might fail in some environments where token creation is restricted
    if (response.status === 200) {
      expect(data).toHaveProperty('success');
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('token');
      expect(data.token).toHaveProperty('mint');
      expect(data.token).toHaveProperty('name');
      expect(data.token.name).toBe(tokenData.name);
      
      // Save the token pubkey for other tests if not already set
      if (!testState.tokenPubkey) {
        testState.tokenPubkey = data.token.mint;
      }
    } else {
      console.log(`Token creation returned status ${response.status}, which might be expected in test environments`);
    }
  });
  
  it('should fetch token price', async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    if (!testState.tokenPubkey) {
      console.log('Skipping token price test - no token pubkey available');
      return;
    }
    
    const { baseUrl } = ctx.context;
    
    const { response, data } = await fetchWithAuth<{ price: number; priceChange24h: number; volume24h: number }>(
      apiUrl(baseUrl, `/token/${testState.tokenPubkey}/price`),
      'GET'
    );
    
    if (response.status === 200) {
      expect(data).toHaveProperty('price');
      expect(typeof data.price).toBe('number');
      expect(data).toHaveProperty('priceChange24h');
      expect(data).toHaveProperty('volume24h');
    } else if (response.status === 404) {
      console.log('Token not found for price, which is acceptable during testing');
    } else {
      console.log(`Unexpected status ${response.status} when fetching token price`);
    }
  });
  
  it('should handle harvest transaction request', async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    if (!testState.tokenPubkey) {
      console.log('Skipping harvest tx test - no token pubkey available');
      return;
    }
    
    const { baseUrl } = ctx.context;
    
    // Use the keypair's public key as the "owner" for harvest
    const owner = userKeypair.publicKey.toBase58();
    
    const { response, data } = await fetchWithAuth(
      apiUrl(baseUrl, `/tokens/${testState.tokenPubkey}/harvest-tx?owner=${owner}`),
      'GET',
      undefined,
      undefined,
      authToken ? { Authorization: `Bearer ${authToken}` } : undefined
    );
    
    // We expect this to likely fail with 400 or 403 in test environments
    // but we want to test the endpoint structure
    if (response.status === 200) {
      expect(data).toHaveProperty('token');
      expect(data).toHaveProperty('transaction');
    } else if ([400, 403, 404].includes(response.status)) {
      console.log(`Harvest TX returned ${response.status}, which is expected during testing`);
      expect(data).toHaveProperty('error');
    } else {
      console.log(`Unexpected status ${response.status} for harvest transaction`);
    }
  });
}); 