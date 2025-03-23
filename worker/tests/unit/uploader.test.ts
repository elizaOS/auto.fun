import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadToCloudflare } from '../../uploader';
import { Env } from '../../env';
import { logger } from '../../logger';

// Mock the logger to avoid console noise
vi.mock('../../logger', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
  }
}));

// Create a mock R2 environment
const createMockEnv = () => {
  return {
    R2: {
      put: vi.fn().mockResolvedValue(undefined),
    },
    R2_PUBLIC_URL: 'https://mock-storage.test.com',
  } as unknown as Env;
};

describe('Uploader', () => {
  let mockEnv: Env;
  
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    mockEnv = createMockEnv();
  });

  describe('uploadToCloudflare', () => {
    it('should upload binary data to R2 with correct content type', async () => {
      // Create a test buffer with image data
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      
      // Upload the data
      const result = await uploadToCloudflare(mockEnv, testData.buffer);
      
      // Check returned URL format
      expect(result).toMatch(/^https:\/\/mock-storage\.test\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      
      // Verify R2 was called with correct parameters
      expect(mockEnv.R2?.put).toHaveBeenCalledWith(
        expect.any(String), // UUID
        testData.buffer,
        {
          httpMetadata: { contentType: 'image/png' },
        }
      );
    });

    it('should upload JSON data with application/json content type', async () => {
      // Create test JSON data
      const jsonData = { test: 'data', value: 123 };
      
      // Upload with isJson option
      const result = await uploadToCloudflare(mockEnv, jsonData, { isJson: true });
      
      // Check returned URL format
      expect(result).toMatch(/^https:\/\/mock-storage\.test\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      
      // Verify R2 was called with correct parameters
      expect(mockEnv.R2?.put).toHaveBeenCalledWith(
        expect.any(String), // UUID
        expect.any(ArrayBuffer), // Converted JSON
        {
          httpMetadata: { contentType: 'application/json' },
        }
      );
    });

    it('should use custom content type when provided', async () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const customContentType = 'application/octet-stream';
      
      const result = await uploadToCloudflare(mockEnv, testData.buffer, { 
        contentType: customContentType 
      });
      
      // Check URL format
      expect(result).toMatch(/^https:\/\/mock-storage\.test\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      
      // Verify correct content type was used
      expect(mockEnv.R2?.put).toHaveBeenCalledWith(
        expect.any(String),
        testData.buffer,
        {
          httpMetadata: { contentType: customContentType },
        }
      );
    });

    it('should handle timeout parameter correctly', async () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const customTimeout = 5000;
      
      // Set a custom timeout for testing
      const result = await uploadToCloudflare(mockEnv, testData.buffer, { 
        timeout: customTimeout
      });
      
      // Should return a valid URL
      expect(result).toMatch(/^https:\/\/mock-storage\.test\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
    
    it('should handle cases where R2 is not available', async () => {
      // Create environment without R2
      const envWithoutR2 = {
        R2: null,
        R2_PUBLIC_URL: 'https://mock-storage.test.com',
      } as unknown as Env;
      
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      
      // Upload should still work
      const result = await uploadToCloudflare(envWithoutR2, testData.buffer);
      
      // Check that it returns a fallback URL
      expect(result).toMatch(/^https:\/\/mock-storage\.test\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      
      // Log should be called
      expect(logger.log).toHaveBeenCalledWith('R2 is not available, using mock storage URL');
    });
    
    it('should handle R2 upload errors gracefully', async () => {
      // Create environment with R2 that fails
      const envWithFailingR2 = {
        R2: {
          put: vi.fn().mockRejectedValue(new Error('R2 upload failed')),
        },
        R2_PUBLIC_URL: 'https://mock-storage.test.com',
      } as unknown as Env;
      
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      
      // Upload should still return a URL even if R2 fails
      const result = await uploadToCloudflare(envWithFailingR2, testData.buffer);
      
      // Check that it returns a fallback URL with the R2_PUBLIC_URL
      expect(result).toMatch(/^https:\/\/mock-storage\.test\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      
      // Error should be logged
      expect(logger.error).toHaveBeenCalledWith('Cloudflare R2 upload failed:', expect.any(Error));
    });
  });
});
