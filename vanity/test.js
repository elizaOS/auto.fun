// Configuration
const WORKER_URL = 'http://localhost:8888'; // Update with your worker URL when deployed

async function testVanityGenerator() {
  console.log('Testing Solana Vanity Address Generator Worker');
  
  try {
    // Test the root endpoint
    const rootResponse = await fetch(`${WORKER_URL}/`);
    const rootText = await rootResponse.text();
    console.log(`Root response: ${rootText}`);
    
    // Test the auto endpoint (generates a key ending with "auto")
    console.log('\nTesting /test-auto endpoint...');
    console.log('This may take some time depending on the complexity of the target...');
    
    const autoResponse = await fetch(`${WORKER_URL}/test-auto`);
    
    if (!autoResponse.ok) {
      throw new Error(`Error from server: ${autoResponse.status} ${autoResponse.statusText}`);
    }
    
    const autoResult = await autoResponse.json();
    console.log('Success! Found vanity address:');
    console.log(`Public Key: ${autoResult.pubkey}`);
    console.log(`Private Key: ${autoResult.private_key}`);
    console.log(`Attempts: ${autoResult.attempts.toLocaleString()}`);
    console.log(`Time: ${autoResult.time_secs.toFixed(2)} seconds`);
    
    // Test the grind endpoint with custom parameters - prefix
    console.log('\nTesting /grind endpoint with prefix search...');
    
    const prefixRequest = {
      target: "auto",
      case_insensitive: false,
      position: "suffix"
    };
    
    console.log(`Searching for address starting with: ${prefixRequest.target}`);
    console.log('This may take some time depending on the complexity of the target...');
    
    const prefixResponse = await fetch(`${WORKER_URL}/grind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(prefixRequest)
    });
    
    if (!prefixResponse.ok) {
      throw new Error(`Error from server: ${prefixResponse.status} ${prefixResponse.statusText}`);
    }
    
    const prefixResult = await prefixResponse.json();
    console.log('Success! Found vanity address:');
    console.log(`Public Key: ${prefixResult.pubkey}`);
    console.log(`Private Key: ${prefixResult.private_key}`);
    console.log(`Attempts: ${prefixResult.attempts.toLocaleString()}`);
    console.log(`Time: ${prefixResult.time_secs.toFixed(2)} seconds`);
    
    // Test the grind endpoint with custom parameters - anywhere
    console.log('\nTesting /grind endpoint with anywhere search...');
    
    const anywhereRequest = {
      target: "auto",
      case_insensitive: false,
      position: "anywhere"
    };
    
    console.log(`Searching for address containing: ${anywhereRequest.target}`);
    console.log('This may take some time depending on the complexity of the target...');
    
    const anywhereResponse = await fetch(`${WORKER_URL}/grind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(anywhereRequest)
    });
    
    if (!anywhereResponse.ok) {
      throw new Error(`Error from server: ${anywhereResponse.status} ${anywhereResponse.statusText}`);
    }
    
    const anywhereResult = await anywhereResponse.json();
    console.log('Success! Found vanity address:');
    console.log(`Public Key: ${anywhereResult.pubkey}`);
    console.log(`Private Key: ${anywhereResult.private_key}`);
    console.log(`Attempts: ${anywhereResult.attempts.toLocaleString()}`);
    console.log(`Time: ${anywhereResult.time_secs.toFixed(2)} seconds`);
    
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