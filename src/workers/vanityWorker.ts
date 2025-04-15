globalThis.global = globalThis
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import * as bs58 from "bs58";

  console.log("Worker: Importing dependencies...");

  console.log("Worker: Dependencies imported.");

  // Required setup for noble libraries
  console.log("Worker: Configuring noble/ed25519...");
  ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
  console.log("Worker: noble/ed25519 configured.");

  const REPORT_INTERVAL = 10000; // Report progress every N attempts

  // --- Validation Function ---
  function validateKeypair(
    privateKey: Uint8Array,
    publicKey: Uint8Array,
    secretKey: Uint8Array,
  ): boolean {
    // ... (validation logic remains the same)
    try {
      if (!privateKey || privateKey.length !== 32) return false;
      if (!publicKey || publicKey.length !== 32) return false;
      if (!secretKey || secretKey.length !== 64) return false;

      // Check if secretKey = privateKey + publicKey
      for (let i = 0; i < 32; i++) if (secretKey[i] !== privateKey[i]) return false;
      for (let i = 0; i < 32; i++)
        if (secretKey[i + 32] !== publicKey[i]) return false;

      // Re-derive public key from private key and check if it matches
      const derivedPublicKey = ed.getPublicKey(privateKey);
      if (!derivedPublicKey || derivedPublicKey.length !== 32) return false;
      for (let i = 0; i < 32; i++)
        if (derivedPublicKey[i] !== publicKey[i]) return false;

      return true;
    } catch (e) {
      console.error("Validation internal error:", e);
      return false;
    }
  }

  // --- Worker Message Handler ---
  console.log("Worker: Setting up message handler...");
  self.onmessage = (event: MessageEvent<{ suffix: string; workerId: number } | string>) => {
     // Handle potential 'stop' string message
     if (event.data === 'stop') {
       console.log(`Worker: Received stop command.`);
       running = false;
       return;
     }

     // Handle the object message for starting generation
     if (typeof event.data === 'object' && event.data.suffix !== undefined) {
         const { suffix, workerId } = event.data;
         console.log(`Worker ${workerId}: Received start command for suffix "${suffix}"`);
         let count = 0;
         running = true; // Ensure running is true when starting

         try {
           console.log(`Worker ${workerId} starting generation loop.`);
           while (running) {
             const privateKey = ed.utils.randomPrivateKey(); // 32 bytes
             const publicKey = ed.getPublicKey(privateKey); // 32 bytes
             const publicKeyBs58 = bs58.default.encode(publicKey);

             if (publicKeyBs58.endsWith(suffix)) {
               const secretKey = new Uint8Array(64);
               secretKey.set(privateKey, 0);
               secretKey.set(publicKey, 32);

               if (validateKeypair(privateKey, publicKey, secretKey)) {
                 const secretKeyBs58 = bs58.default.encode(secretKey);
                 console.log(`Worker ${workerId}: Found valid match!`);
                 self.postMessage({
                   type: "found",
                   workerId,
                   publicKey: publicKeyBs58,
                   secretKey: secretKeyBs58,
                   validated: true,
                 });
                 running = false;
               } else {
                 console.error(
                   `Worker ${workerId} generated invalid keypair for suffix "${suffix}". PK: ${publicKeyBs58}`,
                 );
               }
             }

             count++;
             if (!running) break; // Check running flag again after potentially lengthy crypto ops

             if (count % REPORT_INTERVAL === 0) {
               self.postMessage({ type: "progress", workerId, count });
               count = 0; // Reset count after reporting
             }
           }
         } catch (error) {
           console.error(`Worker ${workerId} loop error:`, error);
           self.postMessage({
             type: "error",
             workerId,
             error: error instanceof Error ? error.message : String(error),
           });
         } finally {
           console.log(`Worker ${workerId} finished loop (running=${running}).`);
           // Optionally post 'stopped' message
           // self.postMessage({ type: 'stopped', workerId });
         }
     } else {
         console.warn("Worker: Received unexpected message format:", event.data);
     }
  };
   console.log("Worker: Message handler set up.");



// Add a variable to control the loop and a way to receive stop messages
let running = false;

// Add a default export to satisfy TypeScript modules if needed
export default {};