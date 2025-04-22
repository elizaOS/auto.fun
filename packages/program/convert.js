const fs = require('fs');
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

// Read the keypair file
const keypairPath = process.argv[2];
if (!keypairPath) {
    console.error('Please provide the path to your keypair file');
    process.exit(1);
}

try {
    // Read the keypair file
    const keypairFile = fs.readFileSync(keypairPath, 'utf-8');
    const secretKey = JSON.parse(keypairFile);
    
    // Create a keypair from the secret key
    const keypair = Keypair.fromSecretKey(new Uint8Array(secretKey));
    
    // Get the public key
    const publicKey = keypair.publicKey.toString();
    
    // Convert the secret key to base58 private key
    const privateKey = bs58.encode(secretKey);
    
    console.log('\nYour Public Key:');
    console.log(publicKey);
    
    console.log('\nYour Phantom-compatible private key:');
    console.log(privateKey);
    console.log('\nIMPORTANT: Keep this private key secure and never share it with anyone!');
    
} catch (error) {
    console.error('Error converting keypair:', error);
    process.exit(1);
} 