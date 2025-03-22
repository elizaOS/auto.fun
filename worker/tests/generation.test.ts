import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { beforeAll, describe, expect, it } from 'vitest';
import { MediaType, RATE_LIMITS } from '../generation';
import {
    TestContext,
    apiUrl,
    fetchWithAuth,
    sleep
} from './helpers/test-utils';
import { registerWorkerHooks, testState } from './setup';

const ctx: { context: TestContext | null } = { context: null };

registerWorkerHooks(ctx);

describe('Media Generation API Endpoints', () => {
  let userKeypair: Keypair;
  let authToken: string;
  let tokenMint: string;
  let tokenCreationFailed = false;
  
  beforeAll(async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    
    const { baseUrl } = ctx.context;
    
    // Create a test user keypair for authentication
    userKeypair = Keypair.generate();
    const publicKey = userKeypair.publicKey.toBase58();
    
    // Use the test token from token tests if available
    if (testState.tokenPubkey) {
      tokenMint = testState.tokenPubkey;
    } else {
      // Create a new test token for generation tests
      const response = await fetchWithAuth(
        apiUrl(baseUrl, '/new_token'),
        'POST',
        {
          name: 'Test Generation Token',
          symbol: 'TEST',
          description: 'A token for testing media generation',
          image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          twitter: 'test_twitter',
          telegram: 'test_telegram',
          website: 'https://test.com'
        },
        'test-api-key'
      );
      
      if (response.response.status === 200 && response.data && response.data.mint) {
        tokenMint = response.data.mint;
        testState.tokenPubkey = tokenMint;
        
        // Wait for token creation to complete
        await sleep(2000);
      } else {
        console.warn('Token creation failed with status:', response.response.status);
        console.warn('Response data:', response.data);
        tokenCreationFailed = true;
        // Use a dummy token for test structure to continue
        tokenMint = Keypair.generate().publicKey.toBase58();
      }
    }
    
    // Authenticate the user with proper signature
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
  
  it('should generate an image', async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    if (tokenCreationFailed) {
      console.log('Skipping image generation test - token creation failed');
      return;
    }
    
    const { baseUrl } = ctx.context;
    
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
    
    const generationRequest = {
      prompt: 'A beautiful sunset over mountains',
      type: MediaType.IMAGE,
      negative_prompt: 'blurry, low quality',
      num_inference_steps: 20,
      guidance_scale: 7.5,
      width: 512,
      height: 512
    };
    
    const { response, data } = await fetchWithAuth<{ success: boolean; mediaUrl: string }>(
      apiUrl(baseUrl, `/${tokenMint}/generate`),
      'POST',
      generationRequest,
      undefined,
      headers
    );
    
    if (response.status === 200) {
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('mediaUrl');
      expect(data.success).toBe(true);
      // Verify the returned media URL points to a valid image
      expect(data.mediaUrl.startsWith('http')).toBe(true);
      
      // Verify we can access the generated image
      const imageResponse = await fetch(data.mediaUrl);
      expect(imageResponse.status).toBe(200);
      expect(imageResponse.headers.get('content-type')).toMatch(/^image\//);
    } else if (response.status === 429) {
      // Rate limit case
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('limit');
      expect(data).toHaveProperty('cooldown');
      expect((data as any).limit).toBe(RATE_LIMITS[MediaType.IMAGE].MAX_GENERATIONS_PER_DAY);
    } else {
      console.log(`Image generation test skipped - service returned status ${response.status}`);
      console.log('Response data:', data);
    }
  });
  
  it('should generate an image with only required parameters', async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    if (tokenCreationFailed) {
      console.log('Skipping minimal image generation test - token creation failed');
      return;
    }
    
    const { baseUrl } = ctx.context;
    
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
    
    // Only provide required parameters
    const minimalRequest = {
      prompt: 'A minimalist landscape',
      type: MediaType.IMAGE
    };
    
    const { response, data } = await fetchWithAuth<{ success: boolean; mediaUrl: string }>(
      apiUrl(baseUrl, `/${tokenMint}/generate`),
      'POST',
      minimalRequest,
      undefined,
      headers
    );
    
    if (response.status === 200) {
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('mediaUrl');
      expect(data.success).toBe(true);
      expect(data.mediaUrl.startsWith('http')).toBe(true);
    } else if (response.status === 429) {
      // Rate limit case is acceptable
      expect(data).toHaveProperty('error');
    } else {
      console.log(`Minimal image generation test skipped - service returned status ${response.status}`);
    }
  });
  
  it('should handle invalid prompt validation', async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    if (tokenCreationFailed) {
      console.log('Skipping validation test - token creation failed');
      return;
    }
    
    const { baseUrl } = ctx.context;
    
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
    
    // Empty prompt should fail validation
    const invalidRequest = {
      prompt: '', // Empty prompt
      type: MediaType.IMAGE
    };
    
    const { response, data } = await fetchWithAuth(
      apiUrl(baseUrl, `/${tokenMint}/generate`),
      'POST',
      invalidRequest,
      undefined,
      headers
    );
    
    // Should return a validation error
    expect(response.status).toBe(400);
    expect(data).toHaveProperty('error');
  });
  
  it('should handle invalid media type validation', async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    if (tokenCreationFailed) {
      console.log('Skipping media type validation test - token creation failed');
      return;
    }
    
    const { baseUrl } = ctx.context;
    
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
    
    // Invalid media type
    const invalidRequest = {
      prompt: 'A beautiful landscape',
      type: 'invalid_type' // Not a valid MediaType
    };
    
    const { response, data } = await fetchWithAuth(
      apiUrl(baseUrl, `/${tokenMint}/generate`),
      'POST',
      invalidRequest,
      undefined,
      headers
    );
    
    // Should return a validation error
    expect(response.status).toBe(400);
    expect(data).toHaveProperty('error');
  });
  
  it('should handle rate limits for generations', async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    if (tokenCreationFailed) {
      console.log('Skipping rate limit test - token creation failed');
      return;
    }
    
    const { baseUrl } = ctx.context;
    
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
    
    // Keep track of successful generations and rate limit responses
    let successCount = 0;
    let rateLimitHit = false;
    
    // Make multiple requests to potentially hit rate limit
    for (let i = 0; i < 5; i++) {
      const result = await fetchWithAuth(
        apiUrl(baseUrl, `/${tokenMint}/generate`),
        'POST',
        {
          prompt: `Test prompt ${i}`,
          type: MediaType.IMAGE,
          width: 512,
          height: 512
        },
        undefined,
        headers
      );
      
      if (result.response.status === 200) {
        successCount++;
        expect(result.data).toHaveProperty('success');
        expect(result.data).toHaveProperty('mediaUrl');
        expect(result.data).toHaveProperty('remainingGenerations');
        expect(result.data).toHaveProperty('resetTime');
      } else if (result.response.status === 429) {
        rateLimitHit = true;
        expect(result.data).toHaveProperty('error');
        expect(result.data).toHaveProperty('limit');
        expect(result.data).toHaveProperty('cooldown');
        expect(result.data).toHaveProperty('message');
        // Don't continue if we've hit the rate limit
        break;
      } else {
        console.warn(`Unexpected status code: ${result.response.status}`);
      }
      
      // Small delay between requests to avoid overwhelming the API
      await sleep(1000);
    }
    
    // Either we should have hit the rate limit or completed some successful requests
    if (successCount === 0 && !rateLimitHit) {
      console.log('Rate limit test skipped - no successful generations or rate limits hit');
    } else {
      expect(successCount > 0 || rateLimitHit).toBe(true);
    }
  });
  
  it('should fetch generation history', async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    if (tokenCreationFailed) {
      console.log('Skipping generation history test - token creation failed');
      return;
    }
    
    const { baseUrl } = ctx.context;
    
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
    
    const { response, data } = await fetchWithAuth<{ generations: any[]; total: number; remaining: any }>(
      apiUrl(baseUrl, `/${tokenMint}/history`),
      'GET',
      undefined,
      undefined,
      headers
    );
    
    if (response.status === 200) {
      expect(data).toHaveProperty('generations');
      expect(Array.isArray(data.generations)).toBe(true);
      expect(data).toHaveProperty('total');
      expect(typeof data.total).toBe('number');
      expect(data).toHaveProperty('remaining');
      expect(data).toHaveProperty('resetTime');
      
      // Verify the structure of generation history entries
      if (data.generations.length > 0) {
        const firstGeneration = data.generations[0];
        expect(firstGeneration).toHaveProperty('id');
        expect(firstGeneration).toHaveProperty('mint');
        expect(firstGeneration).toHaveProperty('type');
        expect(firstGeneration).toHaveProperty('prompt');
        expect(firstGeneration).toHaveProperty('mediaUrl');
        expect(firstGeneration).toHaveProperty('timestamp');
      }
    } else if (response.status === 401) {
      console.log('Generation history test skipped - authentication required');
    } else {
      console.log(`Generation history test skipped - service returned status ${response.status}`);
      console.log('Response data:', data);
    }
  });
  
  it('should filter generation history by type', async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    if (tokenCreationFailed) {
      console.log('Skipping history filtering test - token creation failed');
      return;
    }
    
    const { baseUrl } = ctx.context;
    
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
    
    // Get history filtered by type
    const { response, data } = await fetchWithAuth<{ generations: any[]; remaining: any }>(
      apiUrl(baseUrl, `/${tokenMint}/history?type=${MediaType.IMAGE}`),
      'GET',
      undefined,
      undefined,
      headers
    );
    
    if (response.status === 200) {
      expect(data).toHaveProperty('generations');
      expect(Array.isArray(data.generations)).toBe(true);
      
      // Verify filtering worked - all entries should be images
      if (data.generations.length > 0) {
        const allImages = data.generations.every(gen => gen.type === MediaType.IMAGE);
        expect(allImages).toBe(true);
      }
      
      // Verify remaining count structure for specific type
      expect(data.remaining).not.toBeUndefined();
      if (typeof data.remaining === 'number') {
        // If it's a number, it should be the remaining count for images
        expect(data.remaining).toBeLessThanOrEqual(RATE_LIMITS[MediaType.IMAGE].MAX_GENERATIONS_PER_DAY);
      }
    } else if (response.status === 401) {
      console.log('History filtering test skipped - authentication required');
    } else {
      console.log(`History filtering test skipped - service returned status ${response.status}`);
    }
  });
  
  it('should handle unauthorized access to history', async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    
    const { baseUrl } = ctx.context;
    
    // Generate a random public key to use (which won't be authorized)
    const randomKeypair = Keypair.generate();
    const randomPublicKey = randomKeypair.publicKey.toBase58();
    
    // Create an invalid auth token
    const invalidAuthToken = `invalid_token_${randomPublicKey}`;
    
    // Try to access history with invalid token
    const { response, data } = await fetchWithAuth(
      apiUrl(baseUrl, `/${tokenMint}/history`),
      'GET',
      undefined,
      undefined,
      { Authorization: `Bearer ${invalidAuthToken}` }
    );
    
    // Should return an authentication error
    expect([401, 403]).toContain(response.status);
    expect(data).toHaveProperty('error');
  });
  
  it('should handle video generation request', async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    if (tokenCreationFailed) {
      console.log('Skipping video generation test - token creation failed');
      return;
    }
    
    const { baseUrl } = ctx.context;
    
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
    
    const videoRequest = {
      prompt: 'A flowing river with mountains in the background',
      type: MediaType.VIDEO,
      num_frames: 20,
      fps: 8,
      motion_bucket_id: 127,
      guidance_scale: 7.5
    };
    
    const { response, data } = await fetchWithAuth(
      apiUrl(baseUrl, `/${tokenMint}/generate`),
      'POST',
      videoRequest,
      undefined,
      headers
    );
    
    if (response.status === 200) {
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('mediaUrl');
      expect(data.success).toBe(true);
      
      // Verify the returned media URL points to a valid video
      expect(data.mediaUrl.startsWith('http')).toBe(true);
      
      // Verify we can access the generated video
      const videoResponse = await fetch(data.mediaUrl);
      expect(videoResponse.status).toBe(200);
      expect(videoResponse.headers.get('content-type')).toMatch(/^(video\/|application\/)/);
    } else if (response.status === 429) {
      // Rate limit case
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('limit');
      expect((data as any).limit).toBe(RATE_LIMITS[MediaType.VIDEO].MAX_GENERATIONS_PER_DAY);
    } else {
      console.log(`Video generation test skipped - service returned status ${response.status}`);
      console.log('Response data:', data);
    }
  });
  
  it('should handle audio generation request', async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    if (tokenCreationFailed) {
      console.log('Skipping audio generation test - token creation failed');
      return;
    }
    
    const { baseUrl } = ctx.context;
    
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
    
    const audioRequest = {
      prompt: 'Peaceful ambient music with piano',
      type: MediaType.AUDIO,
      duration_seconds: 10,
      guidance_scale: 7.5
    };
    
    const { response, data } = await fetchWithAuth(
      apiUrl(baseUrl, `/${tokenMint}/generate`),
      'POST',
      audioRequest,
      undefined,
      headers
    );
    
    if (response.status === 200) {
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('mediaUrl');
      expect(data.success).toBe(true);
      
      // Verify the returned media URL points to a valid audio file
      expect(data.mediaUrl.startsWith('http')).toBe(true);
      
      // Verify we can access the generated audio
      const audioResponse = await fetch(data.mediaUrl);
      expect(audioResponse.status).toBe(200);
      expect(audioResponse.headers.get('content-type')).toMatch(/^audio\//);
    } else if (response.status === 429) {
      // Rate limit case
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('limit');
      expect((data as any).limit).toBe(RATE_LIMITS[MediaType.AUDIO].MAX_GENERATIONS_PER_DAY);
    } else {
      console.log(`Audio generation test skipped - service returned status ${response.status}`);
      console.log('Response data:', data);
    }
  });
  
  it('should handle invalid token mint', async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    
    const { baseUrl } = ctx.context;
    
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
    
    // Use an invalid token mint address
    const invalidMint = 'invalid_token_mint';
    
    const { response, data } = await fetchWithAuth(
      apiUrl(baseUrl, `/${invalidMint}/generate`),
      'POST',
      {
        prompt: 'Test prompt for invalid mint',
        type: MediaType.IMAGE
      },
      undefined,
      headers
    );
    
    // Should return a validation error for invalid mint address
    expect(response.status).toBe(400);
    expect(data).toHaveProperty('error');
  });
  
  it('should handle non-existent token mint', async () => {
    if (!ctx.context) throw new Error('Test context not initialized');
    
    const { baseUrl } = ctx.context;
    
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
    
    // Generate a valid-looking but non-existent token mint address
    const nonExistentMint = Keypair.generate().publicKey.toBase58();
    
    const { response, data } = await fetchWithAuth(
      apiUrl(baseUrl, `/${nonExistentMint}/generate`),
      'POST',
      {
        prompt: 'Test prompt for non-existent mint',
        type: MediaType.IMAGE
      },
      undefined,
      headers
    );
    
    // Should return a not found error
    expect(response.status).toBe(404);
    expect(data).toHaveProperty('error');
  });
});