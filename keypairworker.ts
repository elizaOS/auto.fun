import { Keypair } from '@solana/web3.js';

declare var self: Worker;

let isRunning = true;

self.onmessage = async (event) => {
  const { batchSize } = event.data;
  let attempts = 0;
  const maxAttempts = batchSize * 10000;
  const CHUNK_SIZE = 50;
  // const MEMORY_LIMIT = 1024 * 1024 * 512; // 512MB

  // if (process.memoryUsage().heapUsed > MEMORY_LIMIT) {
  //   await new Promise(resolve => setTimeout(resolve, 1000));
  //   global.gc && global.gc();
  // }

  try {
    let generatedCount = 0;
    const gcThreshold = 10000;
    let attemptsUntilGC = gcThreshold;

    while (generatedCount < batchSize && attempts < maxAttempts && isRunning) {
      const chunkKeypairs = [];
      
      for (let i = 0; i < CHUNK_SIZE && generatedCount < batchSize && attempts < maxAttempts && isRunning; i++) {
        const kp = Keypair.generate();
        const address = kp.publicKey.toBase58();
        
        if (address.endsWith('ser')) {
          chunkKeypairs.push({
            address,
            secretKey: Buffer.from(kp.secretKey).toString('base64')
          });
          generatedCount++;
        }
        attempts++;
        attemptsUntilGC--;

        kp.secretKey.fill(0);
      }

      if (chunkKeypairs.length > 0) {
        self.postMessage({ 
          keypairs: chunkKeypairs,
          final: false
        });
      }

      if (attemptsUntilGC <= 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
        attemptsUntilGC = gcThreshold;
      }

      await new Promise(resolve => setTimeout(resolve, 5));
    }

    self.postMessage({ keypairs: [], final: true });

  } catch (error) {
    self.postMessage({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      final: true 
    });
  }
};

// self.onerror = () => {
//   isRunning = false;
// };