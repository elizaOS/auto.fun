import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { uploadToCloudflare } from "../../uploader";
import { Env } from "../../env";
import { unstable_dev } from "wrangler";

describe("Uploader Tests (Real R2)", () => {
  let env: Env;
  let worker: any;
  const objectsToCleanup: string[] = [];

  beforeAll(async () => {
    console.log("Starting worker with real R2 bindings...");
    // Set up real worker with real R2 bindings
    worker = await unstable_dev("worker/index.ts", {
      experimental: { disableExperimentalWarning: true },
      // Use the development config which includes R2 bindings
      env: "development",
      ip: "127.0.0.1",
    });

    // Extract environment from the worker
    console.log("Fetching worker environment...");
    const envResponse = await worker.fetch("http://localhost:8787/__env");
    if (!envResponse.ok) {
      throw new Error(
        `Failed to fetch environment: ${envResponse.status} ${envResponse.statusText}`,
      );
    }
    env = await envResponse.json();

    // Verify that R2 is available
    if (!env.R2) {
      throw new Error(
        "R2 is not available in worker environment. Tests require real R2.",
      );
    }

    console.log("Successfully connected to real R2 for testing");
  }, 30000);

  // Cleanup after all tests
  afterAll(async () => {
    console.log("Cleaning up test objects...");

    // Clean up any objects created during tests
    for (const objectKey of objectsToCleanup) {
      try {
        await env.R2!.delete(objectKey);
        console.log(`Cleaned up test object: ${objectKey}`);
      } catch (error) {
        console.error(`Failed to clean up object ${objectKey}:`, error);
      }
    }

    // Stop the worker
    if (worker) {
      await worker.stop();
      console.log("Worker stopped");
    }
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
    const result = await uploadToCloudflare(env, testData.buffer);

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
  });

  it("should upload JSON data with application/json content type", async () => {
    // Create test JSON data
    const jsonData = { test: "data", value: 123 };

    // Upload with isJson option
    const result = await uploadToCloudflare(env, jsonData, { isJson: true });

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
  });

  it("should use custom content type when provided", async () => {
    const testData = new Uint8Array([1, 2, 3, 4, 5]);
    const customContentType = "application/octet-stream";

    const result = await uploadToCloudflare(env, testData.buffer, {
      contentType: customContentType,
    });

    // Extract the object key (UUID) from the URL
    const objectKey = getObjectKeyFromUrl(result);
    objectsToCleanup.push(objectKey);

    // Verify content type
    const object = await env.R2!.get(objectKey);
    expect(object).not.toBeNull();
    expect(object?.httpMetadata?.contentType).toBe(customContentType);
  });

  it("should handle uploads with timeout parameter", async () => {
    const testData = new Uint8Array([1, 2, 3, 4, 5]);

    // Set a reasonable timeout for testing
    const result = await uploadToCloudflare(env, testData.buffer, {
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
  });

  it("should handle different input data types", async () => {
    // Test with Uint8Array
    const uint8Data = new Uint8Array([1, 2, 3, 4, 5]);
    const uint8Result = await uploadToCloudflare(env, uint8Data);
    const uint8Key = getObjectKeyFromUrl(uint8Result);
    objectsToCleanup.push(uint8Key);

    // Test with Uint8ClampedArray (like from a canvas)
    const clampedData = new Uint8ClampedArray([5, 4, 3, 2, 1]);
    const clampedResult = await uploadToCloudflare(env, clampedData);
    const clampedKey = getObjectKeyFromUrl(clampedResult);
    objectsToCleanup.push(clampedKey);

    // Test with plain object (falls back to JSON)
    const objectData = { hello: "world" };
    const objectResult = await uploadToCloudflare(env, objectData);
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
  });
});
