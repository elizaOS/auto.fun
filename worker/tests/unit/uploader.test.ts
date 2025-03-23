import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { uploadToCloudflare } from "../../uploader";
import { Env } from "../../env";
import { R2Bucket } from "@cloudflare/workers-types/experimental";

describe("Uploader Tests (Mock R2)", () => {
  let env: Partial<Env>;
  const objectsToCleanup: string[] = [];

  // Safely store data for cleanup
  const storage = new Map<string, { data: ArrayBuffer; contentType: string }>();

  beforeAll(async () => {
    console.log("Setting up mock R2 environment...");

    // Create a mock environment with mock R2 functionality
    env = {
      R2_PUBLIC_URL: "https://test-storage.example.com",
      // Create a minimal R2 interface that only exposes the methods we need
      R2: {
        put: async (
          key: string,
          value: ArrayBuffer,
          options?: { httpMetadata?: { contentType: string } },
        ) => {
          // Store data for verification later
          storage.set(key, {
            data: value,
            contentType:
              options?.httpMetadata?.contentType || "application/octet-stream",
          });
          return {};
        },
        get: async (key: string) => {
          const item = storage.get(key);
          if (!item) return null;

          return {
            httpMetadata: { contentType: item.contentType },
            arrayBuffer: async () => item.data,
            text: async () => new TextDecoder().decode(item.data),
          };
        },
        delete: async (key: string) => {
          storage.delete(key);
          return {};
        },
      } as unknown as R2Bucket,
    };

    console.log("Successfully initialized test environment with mock R2");
  });

  // Cleanup after all tests
  afterAll(async () => {
    console.log("Cleaning up test objects...");

    // Clean up specific test objects
    for (const key of objectsToCleanup) {
      await env.R2!.delete(key);
    }

    // Clear all stored objects
    storage.clear();

    console.log("Cleanup completed");
  });

  // Helper function to extract object key from URL
  function getObjectKeyFromUrl(url: string): string {
    const parts = url.split("/");
    return parts[parts.length - 1];
  }

  it("should upload binary data with correct content type", async () => {
    // Create a test buffer with image data
    const testData = new Uint8Array([1, 2, 3, 4, 5]);

    // Upload the data
    const result = await uploadToCloudflare(env as Env, testData.buffer);

    // Check returned URL format
    expect(result).toMatch(
      /^https:\/\/.*\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    // Extract the object key (UUID) from the URL
    const objectKey = getObjectKeyFromUrl(result);
    objectsToCleanup.push(objectKey);

    // Verify object in R2 storage
    const object = await env.R2!.get(objectKey);
    expect(object).not.toBeNull();

    // Verify content type
    expect(object?.httpMetadata?.contentType).toBe("image/png");

    // Verify data
    const data = await object!.arrayBuffer();
    const uploadedData = new Uint8Array(data);
    expect(uploadedData).toEqual(testData);
  }, 10000);

  it("should upload JSON data with application/json content type", async () => {
    // Create test JSON data
    const jsonData = { test: "data", value: 123 };

    // Upload with isJson option
    const result = await uploadToCloudflare(env as Env, jsonData, {
      isJson: true,
    });

    // Check returned URL format
    expect(result).toMatch(
      /^https:\/\/.*\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    // Extract the object key (UUID) from the URL
    const objectKey = getObjectKeyFromUrl(result);
    objectsToCleanup.push(objectKey);

    // Verify object in R2 storage
    const object = await env.R2!.get(objectKey);
    expect(object).not.toBeNull();
    expect(object?.httpMetadata?.contentType).toBe("application/json");

    // Verify data
    const text = await object!.text();
    const data = JSON.parse(text);
    expect(data).toEqual(jsonData);
  }, 10000);

  it("should use custom content type when provided", async () => {
    const testData = new Uint8Array([1, 2, 3, 4, 5]);
    const customContentType = "application/octet-stream";

    const result = await uploadToCloudflare(env as Env, testData.buffer, {
      contentType: customContentType,
    });

    // Extract the object key (UUID) from the URL
    const objectKey = getObjectKeyFromUrl(result);
    objectsToCleanup.push(objectKey);

    // Verify content type
    const object = await env.R2!.get(objectKey);
    expect(object).not.toBeNull();
    expect(object?.httpMetadata?.contentType).toBe(customContentType);
  }, 10000);

  it("should handle uploads with timeout parameter", async () => {
    const testData = new Uint8Array([1, 2, 3, 4, 5]);

    // Set a reasonable timeout for testing
    const result = await uploadToCloudflare(env as Env, testData.buffer, {
      timeout: 10000, // 10 seconds timeout
    });

    // Should return a valid URL
    expect(result).toMatch(
      /^https:\/\/.*\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    // Extract the object key (UUID) from the URL
    const objectKey = getObjectKeyFromUrl(result);
    objectsToCleanup.push(objectKey);

    // Verify object exists
    const object = await env.R2!.get(objectKey);
    expect(object).not.toBeNull();
  }, 15000);

  it("should handle different input data types", async () => {
    // Test with Uint8Array
    const uint8Data = new Uint8Array([1, 2, 3, 4, 5]);
    const uint8Result = await uploadToCloudflare(env as Env, uint8Data);
    const uint8Key = getObjectKeyFromUrl(uint8Result);
    objectsToCleanup.push(uint8Key);

    // Test with Uint8ClampedArray (like from a canvas)
    const clampedData = new Uint8ClampedArray([5, 4, 3, 2, 1]);
    const clampedResult = await uploadToCloudflare(env as Env, clampedData);
    const clampedKey = getObjectKeyFromUrl(clampedResult);
    objectsToCleanup.push(clampedKey);

    // Test with plain object (falls back to JSON)
    const objectData = { hello: "world" };
    const objectResult = await uploadToCloudflare(env as Env, objectData);
    const objectKey = getObjectKeyFromUrl(objectResult);
    objectsToCleanup.push(objectKey);

    // All should have returned valid URLs
    expect(uint8Result).toMatch(
      /^https:\/\/.*\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(clampedResult).toMatch(
      /^https:\/\/.*\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(objectResult).toMatch(
      /^https:\/\/.*\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  }, 20000);
});
