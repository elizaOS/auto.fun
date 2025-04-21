const Redis = require('ioredis');

// The Redis URL to test
const redisUrl = 'redis://default:MDikUKnhRHlURlnORexvVztDTrNCUBze@crossover.proxy.rlwy.net:47118/1';

// Create a Redis client with improved configuration
const redis = new Redis(redisUrl, {
  connectTimeout: 5000,
  maxRetriesPerRequest: 5,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  commandTimeout: 5000,
  enableReadyCheck: true,
  keepAlive: 10000,
  reconnectOnError(err) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Only reconnect when the error contains "READONLY"
      return true;
    }
    return false;
  },
});

// Set up event listeners
redis.on('connect', () => {
  console.log('✅ Redis connection established');
});

redis.on('ready', () => {
  console.log('✅ Redis connection ready to accept commands');
  
  // Test basic operations
  testRedisOperations(redis);
});

redis.on('error', (err) => {
  console.error(`❌ Redis connection error: ${err.message}`);
  process.exit(1);
});

redis.on('close', () => {
  console.warn('⚠️ Redis connection closed');
});

redis.on('reconnecting', () => {
  console.info('🔄 Redis attempting to reconnect');
});

redis.on('end', () => {
  console.warn('⚠️ Redis connection ended');
  process.exit(0);
});

// Function to test basic Redis operations
async function testRedisOperations(redis) {
  try {
    // Test PING operation
    console.log('Testing PING operation...');
    const pingResult = await redis.ping();
    console.log(`PING result: ${pingResult}`);
    
    // Test SET operation
    console.log('Testing SET operation...');
    const setResult = await redis.set('test-key', 'test-value');
    console.log(`SET result: ${setResult}`);
    
    // Test GET operation
    console.log('Testing GET operation...');
    const getValue = await redis.get('test-key');
    console.log(`GET result: ${getValue}`);
    
    // Test DEL operation
    console.log('Testing DEL operation...');
    const delResult = await redis.del('test-key');
    console.log(`DEL result: ${delResult}`);
    
    // Test INFO operation to get server information
    console.log('Testing INFO operation...');
    const infoResult = await redis.info();
    console.log('Redis server information:');
    console.log(infoResult.split('\n').slice(0, 10).join('\n') + '...');
    
    console.log('\n✅ All Redis operations completed successfully!');
    
    // Close the connection
    redis.quit();
  } catch (error) {
    console.error(`❌ Error during Redis operations: ${error.message}`);
    redis.quit();
    process.exit(1);
  }
}

console.log('Starting Redis connection test...');
