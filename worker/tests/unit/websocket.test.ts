import { WebSocketClient } from '../../websocket-client';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock environment that would normally come from the Cloudflare worker
const mockEnv = {
  WEBSOCKET_DO: {
    idFromName: vi.fn().mockImplementation((name) => ({ name })),
    get: vi.fn().mockImplementation((id) => ({
      fetch: vi.fn().mockResolvedValue(new Response('OK')),
    })),
  },
};

describe('WebSocketClient', () => {
  let wsClient: WebSocketClient;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    wsClient = new WebSocketClient(mockEnv as any);
  });

  it('should initialize with the provided environment', () => {
    expect(wsClient).toBeDefined();
  });

  it('should emit messages to a specific room', async () => {
    const room = 'test-room';
    const event = 'update';
    const data = { value: 42 };
    
    await wsClient.emit(room, event, data);
    
    // Verify the Durable Object was accessed correctly
    expect(mockEnv.WEBSOCKET_DO.idFromName).toHaveBeenCalledWith(room);
    expect(mockEnv.WEBSOCKET_DO.get).toHaveBeenCalled();
    
    // Get the mock DO stub
    const mockStub = mockEnv.WEBSOCKET_DO.get.mock.results[0].value;
    
    // Verify the fetch was called with the right URL and data
    expect(mockStub.fetch).toHaveBeenCalledWith(
      'https://internal/broadcast',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String),
      })
    );
    
    // Check that the body contains the right data
    const callData = mockStub.fetch.mock.calls[0][1];
    const parsedBody = JSON.parse(callData.body);
    expect(parsedBody).toEqual({
      room,
      message: { event, data },
    });
  });

  it('should emit messages to a specific client', async () => {
    const clientId = 'test-client';
    const event = 'notification';
    const data = { message: 'Test notification' };
    
    await wsClient.emitToClient(clientId, event, data);
    
    // Verify the Durable Object was accessed correctly
    expect(mockEnv.WEBSOCKET_DO.idFromName).toHaveBeenCalledWith(clientId);
    expect(mockEnv.WEBSOCKET_DO.get).toHaveBeenCalled();
    
    // Get the mock DO stub
    const mockStub = mockEnv.WEBSOCKET_DO.get.mock.results[0].value;
    
    // Verify the fetch was called with the right URL and data
    expect(mockStub.fetch).toHaveBeenCalledWith(
      'https://internal/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String),
      })
    );
    
    // Check that the body contains the right data
    const callData = mockStub.fetch.mock.calls[0][1];
    const parsedBody = JSON.parse(callData.body);
    expect(parsedBody).toEqual({
      clientId,
      message: { event, data },
    });
  });

  it('should support the to() helper for chained emit calls', async () => {
    const room = 'test-room';
    const event = 'update';
    const data = { value: 42 };
    
    // Use the to() helper method
    await wsClient.to(room).emit(event, data);
    
    // Verify the end result is the same as calling emit directly
    expect(mockEnv.WEBSOCKET_DO.idFromName).toHaveBeenCalledWith(room);
    
    // Get the mock DO stub
    const mockStub = mockEnv.WEBSOCKET_DO.get.mock.results[0].value;
    
    // Check that the fetch parameters are correct
    const callData = mockStub.fetch.mock.calls[0][1];
    const parsedBody = JSON.parse(callData.body);
    expect(parsedBody).toEqual({
      room,
      message: { event, data },
    });
  });
});
