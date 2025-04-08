const fetch = require('node-fetch');

// Configuration
const WORKER_URL = 'https://vanity.autofun.workers.dev'; // Update with your worker URL when deployed

async function testVanityGenerator() {
  console.log('Testing Solana Vanity Address Generator Worker');
  
  try {
    // Test the root endpoint
    // const rootResponse = await fetch(`${WORKER_URL}/`);
    // const rootText = await rootResponse.text();
    // console.log(`Root response: ${rootText}`);
    
    // Test the auto endpoint (generates a key ending with "auto")
    // console.log('\nTesting /test-auto endpoint...');
    // console.log('This may take some time depending on the complexity of the target...');
    
    // const autoResponse = await fetch(`${WORKER_URL}/test-auto`);
    
    // if (!autoResponse.ok) {
    //   throw new Error(`Error from server: ${autoResponse.status} ${autoResponse.statusText}`);
    // }
    
    // const autoResult = await autoResponse.json();
    // console.log('Success! Found vanity address:');
    // console.log(`Public Key: ${autoResult.pubkey}`);
    // console.log(`Seed: ${autoResult.seed}`);
    // console.log(`Attempts: ${autoResult.attempts.toLocaleString()}`);
    // console.log(`Time: ${autoResult.time_secs.toFixed(2)} seconds`);
    
    // // Test the grind endpoint with custom parameters
    // console.log('\nTesting /grind endpoint with custom parameters...');
    
    const customRequest = {
      base: "11111111111111111111111111111111",
      owner: "BPFLoaderUpgradeab1e11111111111111111111111",
      target: "auto",
      case_insensitive: false
    };
    
    console.log(`Searching for address ending with: ${customRequest.target}`);
    console.log('This may take some time depending on the complexity of the target...');
    
    const grindResponse = await fetch(`${WORKER_URL}/grind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(customRequest)
    });
    
    if (!grindResponse.ok) {
      throw new Error(`Error from server: ${grindResponse.status} ${grindResponse.statusText}`);
    }
    
    const grindResult = await grindResponse.json();
    console.log('Success! Found vanity address:');
    console.log(`Public Key: ${grindResult.pubkey}`);
    console.log(`Seed: ${grindResult.seed}`);
    console.log(`Attempts: ${grindResult.attempts.toLocaleString()}`);
    console.log(`Time: ${grindResult.time_secs.toFixed(2)} seconds`);
    
  } catch (error) {
    console.error('Error testing vanity generator:', error);
  }
}

// Run the test
testVanityGenerator();

/* 
  Usage instructions:
  
  1. Install dependencies:
     npm install node-fetch
  
  2. Start your worker locally with 'wrangler dev'
     
  3. Run this test:
     node test.js
     
  4. For production testing, change WORKER_URL to your deployed worker URL
*/ 