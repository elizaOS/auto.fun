import { VanityKeypair } from './schemas';
import { logger } from './logger';
import path from 'path';

export class VanityKeypairGenerator {
  private isRunning: boolean = false;
  private readonly numWorkers: number;
  private workerBatchSize: number = 100;
  private workers: Worker[] = [];
  private readonly minBuffer: number;
  private readonly targetBuffer: number;

  constructor() {
    this.numWorkers = parseInt(process.env.NUM_WORKERS) ? parseInt(process.env.NUM_WORKERS) : 4;
    this.minBuffer = parseInt(process.env.MIN_BUFFER) ? parseInt(process.env.MIN_BUFFER) : 5000;
    this.targetBuffer = parseInt(process.env.TARGET_BUFFER) ? parseInt(process.env.TARGET_BUFFER) : 15000;
  }

  async startGenerating() {
    if (this.isRunning) return;
    this.isRunning = true;

    while (this.isRunning) {
      try {
        const count = await VanityKeypair.countDocuments({ used: false });
        logger.log("Available keypairs:", count);

        if (count <= this.minBuffer || count === 0) {
          logger.log(`Buffer under minimum threshold (${count}/${this.minBuffer})`);
          const neededKeypairs = this.targetBuffer - count;
          const batchSize = Math.min(
            this.workerBatchSize,
            Math.ceil(neededKeypairs / this.numWorkers)
          );          
          await this.generateKeypairs(batchSize);
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          await new Promise(resolve => setTimeout(resolve, 15000));
        }
      } catch (err) {
        logger.error('Generation loop error:', err);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  private async generateKeypairs(batchSize: number) {
    const workers: Worker[] = [];
    let savedCount = 0;

    try {
      const currentCount = await VanityKeypair.countDocuments({ used: false });
      const neededKeypairs = this.targetBuffer - currentCount;

      if (neededKeypairs <= 0) return;

      const keypairsPerWorker = Math.ceil(Math.min(this.workerBatchSize, neededKeypairs) / this.numWorkers);

      const workerPromises = Array.from({ length: this.numWorkers }, () => {
        return new Promise((resolve, reject) => {
          const worker = new Worker(path.join(__dirname, 'keypairworker.ts'));
          workers.push(worker);

          const cleanup = () => {
            worker.terminate();
            const index = workers.indexOf(worker);
            if (index > -1) {
              workers.splice(index, 1);
            }
          };

          worker.onmessage = async (event) => {
            const { keypairs, final, error } = event.data;

            if (error) {
              cleanup();
              reject(new Error(error));
              return;
            }

            if (keypairs && keypairs.length > 0) {
              const updatePromises = keypairs.map(kp => 
                VanityKeypair.findOneAndUpdate(
                  { address: kp.address },
                  {
                    $setOnInsert: {
                      address: kp.address,
                      secretKey: kp.secretKey,
                      used: false
                    }
                  },
                  { upsert: true, new: true }
                ).catch(error => {
                  if (error.code !== 11000) throw error;
                })
              );

              await Promise.all(updatePromises);
              savedCount += keypairs.length;
            }

            if (final) {
              cleanup();
              resolve(true);
            }
          };

          worker.onerror = (error) => {
            cleanup();
            reject(error);
          };

          worker.postMessage({ batchSize: keypairsPerWorker });
        });
      });

      await Promise.all(workerPromises);
      logger.log(`Generated and saved ${savedCount} new keypairs. Current buffer: ${currentCount + savedCount}`);

    } catch (error) {
      logger.error('Generation error:', error);
      throw error;
    } finally {
      workers.forEach(worker => worker.terminate());
    }
  }

  async stop() {
    this.isRunning = false;
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}