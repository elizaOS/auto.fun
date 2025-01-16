import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../logger';

const execAsync = promisify(exec);

const TOKEN = 'EZwEafLcS8SXanoYWMW34t786NCn8BmEMsnKZcPFZser';
const AMOUNT = '1000000000';
const DELAY_MS = 60000;

async function executeSwap(side: number) {
  try {
    // Fix: Use the correct path and command structure
    const command = `bun run cli/command.ts swap -t ${TOKEN} -a ${AMOUNT} -s ${side}`;
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr) {
      logger.error(`Swap error: ${stderr}`);
      return;
    }
    
    logger.log(`Executed ${side === 0 ? 'buy' : 'sell'} swap: ${stdout}`);
  } catch (error) {
    logger.error('Failed to execute swap:', error);
  }
}

async function runSwapLoop() {
  while (true) {
    // Buy
    await executeSwap(0);
    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    
    // // Sell
    // await executeSwap(1); 
    // await new Promise(resolve => setTimeout(resolve, DELAY_MS));
  }
}

// Start the swap loop
runSwapLoop().catch(error => {
  logger.error('Swap loop failed:', error);
});