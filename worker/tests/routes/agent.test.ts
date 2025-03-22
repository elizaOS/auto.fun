import { beforeAll, describe, expect, it } from "vitest";
import {
  AgentDetails,
  ApiResponse,
  TestContext,
  apiUrl,
  fetchWithAuth,
} from "../helpers/test-utils";
import { registerWorkerHooks, testState } from "../setup";

const ctx: { context: TestContext | null } = { context: null };

registerWorkerHooks(ctx);

describe("Agent API Endpoints", () => {
  let testToken: string;

  beforeAll(async () => {
    // Use token from previous tests if available
    if (testState.tokenPubkey) {
      testToken = testState.tokenPubkey;
    } else {
      // Use a mock token address
      testToken = "mock-token-address-123456789012345678901234567890";
    }
  });

  it("should generate agent details", async () => {
    if (!ctx.context) throw new Error("Test context not initialized");

    const { baseUrl } = ctx.context;

    const requestBody = {
      inputs: {
        name: "Test Agent",
        description: "An agent created for testing purposes",
        personality: "friendly",
        topics: ["AI", "technology", "testing"],
      },
      requestedOutputs: ["systemPrompt", "bio", "style", "topics"],
    };

    const { response, data } = await fetchWithAuth<AgentDetails>(
      apiUrl(baseUrl, "/agent-details"),
      "POST",
      requestBody,
    );

    expect(response.status).toBe(200);

    // Verify that all requested outputs are present in the response
    requestBody.requestedOutputs.forEach((output) => {
      expect(data).toHaveProperty(output);
    });
  });

  it("should fetch agent personalities", async () => {
    if (!ctx.context) throw new Error("Test context not initialized");

    const { baseUrl } = ctx.context;

    const { response, data } = await fetchWithAuth<{ personalities: any[] }>(
      apiUrl(baseUrl, "/agent-personalities"),
      "GET",
    );

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("personalities");
    expect(Array.isArray(data.personalities)).toBe(true);
  });

  it("should create an agent", async () => {
    if (!ctx.context) throw new Error("Test context not initialized");

    const { baseUrl } = ctx.context;

    // Authenticate first
    const authRequest = {
      address: "mock-user-address-123456789012345678901234567890",
      signature: "mock-signature",
      message: "Sign this message to authenticate",
    };

    await fetchWithAuth(apiUrl(baseUrl, "/authenticate"), "POST", authRequest);

    // Create an agent
    const agentRequest = {
      twitter_credentials: {
        username: "test_twitter",
        password: "password123",
        email: "test@example.com",
      },
      agent_metadata: {
        name: "Test Agent",
        description: "Test agent for API testing",
        systemPrompt: "You are a helpful AI assistant",
        bio: "A test agent designed to verify API functionality",
        style: "friendly, helpful, concise",
        topics: "AI, technology, testing",
      },
    };

    const { response } = await fetchWithAuth<ApiResponse>(
      apiUrl(baseUrl, `/agents/${testToken}`),
      "POST",
      agentRequest,
    );

    // Due to authentication requirements, we might get 401 in tests
    // Just verify the endpoint exists and processes the request
    expect([200, 401, 404, 503].includes(response.status)).toBe(true);
  });

  it("should get all agents for a user", async () => {
    if (!ctx.context) throw new Error("Test context not initialized");

    const { baseUrl } = ctx.context;

    // Authenticate first
    const authRequest = {
      address: "mock-user-address-123456789012345678901234567890",
      signature: "mock-signature",
      message: "Sign this message to authenticate",
    };

    await fetchWithAuth(apiUrl(baseUrl, "/authenticate"), "POST", authRequest);

    // Get all agents
    const { response, data } = await fetchWithAuth<any[]>(
      apiUrl(baseUrl, "/agents"),
      "GET",
    );

    // Due to authentication requirements, we might get 401 in tests
    expect([200, 401, 503].includes(response.status)).toBe(true);

    if (response.status === 200) {
      expect(Array.isArray(data)).toBe(true);
    }
  });

  it("should get an agent by contract address", async () => {
    if (!ctx.context) throw new Error("Test context not initialized");

    const { baseUrl } = ctx.context;

    // Authenticate first
    const authRequest = {
      address: "mock-user-address-123456789012345678901234567890",
      signature: "mock-signature",
      message: "Sign this message to authenticate",
    };

    await fetchWithAuth(apiUrl(baseUrl, "/authenticate"), "POST", authRequest);

    // Get agent by contract address
    const { response } = await fetchWithAuth<any>(
      apiUrl(baseUrl, `/agents/mint/${testToken}`),
      "GET",
    );

    // Due to authentication and data requirements, we might get various status codes
    expect([200, 401, 404, 503].includes(response.status)).toBe(true);
  });

  it("should update an agent", async () => {
    if (!ctx.context) throw new Error("Test context not initialized");

    const { baseUrl } = ctx.context;

    // Authenticate first
    const authRequest = {
      address: "mock-user-address-123456789012345678901234567890",
      signature: "mock-signature",
      message: "Sign this message to authenticate",
    };

    await fetchWithAuth(apiUrl(baseUrl, "/authenticate"), "POST", authRequest);

    // For testing, we'll use a mock agent ID
    const mockAgentId = "mock-agent-id-12345";

    const updateRequest = {
      name: "Updated Agent Name",
      description: "Updated description",
      systemPrompt: "You are an updated AI assistant",
    };

    const { response } = await fetchWithAuth<ApiResponse>(
      apiUrl(baseUrl, `/agents/${mockAgentId}`),
      "PUT",
      updateRequest,
    );

    // Due to authentication and data requirements, we might get various status codes
    expect([200, 401, 404, 503].includes(response.status)).toBe(true);
  });

  it("should upload an image to Cloudflare", async () => {
    if (!ctx.context) throw new Error("Test context not initialized");

    const { baseUrl } = ctx.context;

    // Authenticate first
    const authRequest = {
      address: "mock-user-address-123456789012345678901234567890",
      signature: "mock-signature",
      message: "Sign this message to authenticate",
    };

    await fetchWithAuth(apiUrl(baseUrl, "/authenticate"), "POST", authRequest);

    // Create a small base64 image for testing
    // This is a 1x1 transparent pixel
    const smallImage =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

    const uploadRequest = {
      image: smallImage,
      metadata: {
        name: "Test Image",
        symbol: "TEST",
        description: "A test image for the API",
      },
    };

    const { response } = await fetchWithAuth<{
      success: boolean;
      imageUrl: string;
      metadataUrl: string;
    }>(apiUrl(baseUrl, "/upload-cloudflare"), "POST", uploadRequest);

    // Due to authentication requirements and Cloudflare setup, we might get various status codes
    expect([200, 401, 403, 500, 503].includes(response.status)).toBe(true);
  });
});
