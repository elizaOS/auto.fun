import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
dotenv.config();
import { Connection, PublicKey, Logs } from '@solana/web3.js';
import { claimFees } from './claimFees';


const RPC_URL =
   (process.env.NETWORK === 'devnet'
      ? process.env.DEVNET_SOLANA_RPC_URL
      : process.env.MAINNET_SOLANA_RPC_URL)!;

const connection = new Connection(RPC_URL, 'confirmed');
const app = express();
app.use(express.json());


app.post('/claim-fees', async (req: Request, res: Response) => {
   try {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
         throw new Error("JWT_SECRET not defined in env");
      }

      // check if the request has a valid JWT token
      const token = req.headers['authorization']?.split(' ')[1];
      if (!token) {
         res.status(401).json({ error: 'Unauthorized' });
         return;
      }
      const { tokenMint, userAddress, nftMint, poolId } = req.body;
      if (!tokenMint || !userAddress) {
         res.status(400).json({ error: 'Missing tokenMint or userAddress' });
         return;
      }
      const claimer = new PublicKey(userAddress);

      const txSignature = await claimFees(
         new PublicKey(nftMint),
         new PublicKey(poolId),
         connection,
         claimer
      );
      if (txSignature) {
         // we notify the user that cf backend 
         // todo //

      }

      res.status(200).json({ status: 'Claim fees triggered', tokenMint });
      return;
   } catch (err: any) {
      console.error("Error in /claim-fees:", err);
      res.status(500).json({ error: err.message });
      return;
   }
});

const PORT = 3000;
app.listen(PORT, () => {
   console.log(`App listening on port: ${PORT}`);
});

export default app;