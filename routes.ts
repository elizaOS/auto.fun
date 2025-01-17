import { Router } from 'express';
import { User, Token, createTokenSchema, TokenHolder, Swap, Fee, Message, VanityKeypair, VanityKeypairValidation, VanityKeypairRequestValidation, ChartParamsSchema, Agent, Personality, MessageLikeValidation, MessageLike } from './schemas';
import { fetchPriceChartData } from './server';
import { z } from 'zod';
import { 
  UserValidation, 
  TokenValidation, 
  SwapValidation, 
  FeeValidation, 
  MessageValidation 
} from './schemas';
import { ComputeBudgetProgram, Connection, Keypair, ParsedAccountData, PublicKey } from '@solana/web3.js';
import {
  verifySignature,
  authenticate,
  generateNonce,
  requireAuth,
  logout,
  authStatus,
  apiKeyAuth,
} from "./auth";
import { logger } from './logger';
import cookieParser from "cookie-parser";
import { Scraper } from "agent-twitter-client";
import { BN } from "@coral-xyz/anchor";
import { SEED_CONFIG } from './lib/constant';
import { program, connection } from './server';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { execTx, splitIntoLines } from './lib/util';
import { getSOLPrice } from './mcap';
import { calculateTokenMarketData } from './mcap';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import PinataClient from '@pinata/sdk';

import {
  adjustTaskCount,
  setTaskCountToActiveAgents,
  stopEcsTask,
} from "./lib/aws";
import { createCharacterDetails } from './characterCreation';
import { AgentDetailsRequest } from './characterCreation';
import { submitTokenTransaction } from './tokenCreation';
import mongoose from 'mongoose';

const router = Router();

// Add cookie parser middleware
router.use(cookieParser());
// Add authentication verification middleware
router.use(verifySignature);

// Add authentication routes
router.post('/authenticate', authenticate);
router.post('/generate-nonce', generateNonce);
router.post('/logout', logout);
router.get('/auth-status', authStatus);

// Initialize Pinata client
const pinata = new PinataClient({ 
  pinataApiKey: process.env.PINATA_API_KEY, 
  pinataSecretApiKey: process.env.PINATA_SECRET_KEY,
  pinataJWTKey: process.env.PINATA_JWT
});

async function uploadToPinata(data: Buffer | object, options: { isJson?: boolean } = {}) {
  try {
    if (options.isJson) {
      const result = await pinata.pinJSONToIPFS(data as object);
      return `${process.env.IPFS_GATEWAY}/ipfs/${result.IpfsHash}`;
    } else {
      // For base64 images, convert to buffer properly
      const base64Data = (data as Buffer).toString('base64');
      const buffer = Buffer.from(base64Data, 'base64');
      
      const stream = require('stream');
      const readableStream = new stream.Readable({
        read() {
          this.push(buffer);
          this.push(null);
        }
      });

      const result = await pinata.pinFileToIPFS(readableStream, {
        pinataMetadata: {
          name: 'token-image'
        }
      });
      return `${process.env.IPFS_GATEWAY}/ipfs/${result.IpfsHash}`;
    }
  } catch (error) {
    logger.error('Pinata upload failed:', error);
    throw new Error('Failed to upload to IPFS');
  }
}

/////////////////////////////////////
// API Endpoint Routes
/////////////////////////////////////

// Health / Check Endpoint
router.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Get all tokens
// GET paginated tokens
router.get('/tokens', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string;
    
    // Enhanced filtering options
    const {
      status,
      secondaryStatus, 
      search,
      creator,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    let query: any = {};
    
    if (cursor) {
      // Use $lt for desc order, $gt for asc order
      const operator = sortOrder === 'desc' ? '$lt' : '$gt';
      query._id = { [operator]: cursor };
    }

    if (status || secondaryStatus) {
      if (status && secondaryStatus) {
        // If both statuses provided, use $or to match either
        query.$or = [
          { status },
          { status: secondaryStatus }
        ];
      } else {
        // If only one status provided, use that one
        query.status = status || secondaryStatus;
      }
    }

    // do not show tokens that have a status of 'pending'
    query.status = { $ne: 'pending' };

    if (creator) {
      query.creator = creator;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { ticker: { $regex: search, $options: 'i' } },
        { mint: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    const tokens = await Token
      .find(query)
      .sort({ 
        [sortBy === 'marketCapUSD' ? 'marketCapUSD' : sortBy]: 
        sortOrder === 'desc' ? -1 : 1 
      })
      .limit(limit + 1)
      .select('-__v');

    const hasMore = tokens.length > limit;
    const results = tokens.slice(0, limit);
    const nextCursor = hasMore ? tokens[limit]._id : null;
      
    res.json({
      tokens: results,
      nextCursor: nextCursor,
      hasMore: hasMore,
      total: await Token.countDocuments(query)
    });

  } catch (error) {
    logger.error('Error fetching tokens:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get specific token via mint id
router.get('/tokens/:mint', async (req, res) => {
  try {
    const mintValidation = z.string().min(32).max(44);
    const mint = mintValidation.parse(req.params.mint);
    
    const token = await Token.findOne({ mint });
    if (!token) {
      return res.status(404).json({ error: 'Token not found' });
    }

    // Get SOL price and calculate market data
    const solPrice = await getSOLPrice();
    const tokenWithMarketData = await calculateTokenMarketData(token, solPrice);

    res.json(tokenWithMarketData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

router.get('/tokens/:mint/holders', async (req, res) => {
  try {
    const mintValidation = z.string().min(32).max(44);
    const mint = mintValidation.parse(req.params.mint);
    
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string;
    const sortBy = req.query.sortBy as string || 'amount';
    const sortOrder = req.query.sortOrder as string || 'desc';
    const search = req.query.search as string;

    // Build query
    let query: any = { mint };
    
    if (cursor) {
      const operator = sortOrder === 'desc' ? '$lt' : '$gt';
      query._id = { [operator]: cursor };
    }

    if (search) {
      query.address = { $regex: search, $options: 'i' };
    }

    // Check if we need to update cached data
    const lastUpdate = await TokenHolder.findOne({ mint })
      .sort({ lastUpdated: -1 })
      .select('lastUpdated');
      
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    
    if (!lastUpdate || Date.now() - lastUpdate.lastUpdated.getTime() > CACHE_DURATION) {
      await updateHoldersCache(mint);
    }

    const holders = await TokenHolder
      .find(query)
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .limit(limit + 1)
      .select('-__v');

    const hasMore = holders.length > limit;
    const results = holders.slice(0, limit);
    const nextCursor = hasMore ? holders[limit]._id : null;

    res.json({
      holders: results,
      nextCursor,
      hasMore,
      total: await TokenHolder.countDocuments(query)
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      logger.error('Error fetching token holders:', error);
      res.status(500).json({ error: error.message });
    }
  }
});

async function updateHoldersCache(mint: string) {
  const connection = new Connection(process.env.SOLANA_RPC_URL!);
  
  try {
    await TokenHolder.deleteMany({ mint });
    // Get all token accounts for this mint using getTokenLargestAccounts
    const largestAccounts = await connection.getTokenLargestAccounts(new PublicKey(mint));
    
    if (!largestAccounts.value || largestAccounts.value.length === 0) {
      logger.error(`No accounts found for token ${mint}`);
      return;
    }

    // Get the token to check if it's migrated
    const token = await Token.findOne({ mint });
    const isMigrated = token?.status === 'migrated' || token?.status === 'locked';

    // Calculate total supply from all accounts, excluding bonding curve if migrated
    const totalSupply = await largestAccounts.value.reduce(async (promisedSum, account) => {
      const sum = await promisedSum;
      // Skip bonding curve account if token is migrated
      if (isMigrated) {
        const accountInfo = await connection.getParsedAccountInfo(account.address);
        const owner = (accountInfo.value?.data as ParsedAccountData).parsed.info.owner;
        if (owner === '4FRxv5k1iCrE4kdjtywUzAakCaxfDQmpdVLx48kUXQQC') {
          return sum;
        }
      }
      return sum + Number(account.amount);
    }, Promise.resolve(0));

    // Get detailed account info for each holder
    const accountPromises = largestAccounts.value
      .filter(account => Number(account.amount) > 0)
      .map(async account => {
        const accountInfo = await connection.getParsedAccountInfo(account.address);
        const owner = (accountInfo.value?.data as ParsedAccountData).parsed.info.owner;
        
        // Skip bonding curve account if token is migrated
        if (isMigrated && owner === '4FRxv5k1iCrE4kdjtywUzAakCaxfDQmpdVLx48kUXQQC') {
          return null;
        }

        return {
          address: owner,
          amount: account.amount
        };
      });

    const accountDetails = (await Promise.all(accountPromises)).filter(account => account !== null);

    // Prepare bulk operation
    const bulkOps = accountDetails.map(account => ({
      updateOne: {
        filter: { 
          mint: mint,
          address: account.address
        },
        update: {
          $set: {
            amount: account.amount,
            percentage: (Number(account.amount) / totalSupply) * 100,
            lastUpdated: new Date()
          }
        },
        upsert: true
      }
    }));

    if (bulkOps.length > 0) {
      await TokenHolder.bulkWrite(bulkOps);
      logger.log(`Updated ${bulkOps.length} holder records for token ${mint}`);
    }

  } catch (error) {
    logger.error(`Error updating holders for token ${mint}:`, error);
    throw error;
  }
}

// Solana USD Price Endpoint
// router.get('/solana-price', async (req, res) => {
//   const solPrice = await getSOLPrice();
//   res.json({ solanaUSD: solPrice });
// });

// Internal token creation endpoint
router.post('/new_token', apiKeyAuth, async (req, res) => {
  try {
    const validatedData = createTokenSchema.parse(req.body);
    
    // Convert base64 to buffer
    const imageBuffer = Buffer.from(validatedData.image.split(',')[1], 'base64');
    
    // Upload image to IPFS
    const imageUrl = await uploadToPinata(imageBuffer);
    
    // Create and upload metadata
    const metadata = {
      name: validatedData.name,
      symbol: validatedData.symbol,
      description: validatedData.description,
      image: imageUrl,
      showName: true,
      createdOn: "https://x.com/serlaunchalot",
      twitter: validatedData.twitter,
      telegram: validatedData.telegram,
      website: validatedData.website
    };
    
    // Upload metadata to IPFS
    const metadataUrl = await uploadToPinata(metadata, { isJson: true });

    // Get pre-generated keypair from server
    const keypair = await VanityKeypair.findOneAndUpdate(
      { used: false },
      { used: true },
      { new: true }
    );

    if (!keypair) {
      return res.status(404).json({ error: 'No unused vanity keypairs available' });
    }

    const secretKey = Buffer.from(keypair.secretKey, 'base64');
    const solanaKeypair = Keypair.fromSecretKey(secretKey);
    const finalKey = Array.from(solanaKeypair.secretKey);
    const tokenKp = Keypair.fromSecretKey(new Uint8Array(finalKey));

    const walletKeypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(process.env.WALLET_PRIVATE_KEY)),
      { skipValidation: true }
    );
    const payer = new NodeWallet(walletKeypair);

    const creatorPubkey = new PublicKey(payer.publicKey);

    // Get program config
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_CONFIG)],
      program.programId
    );
    
    const configAccount = await program.account.config.fetch(configPda);

    // Create compute budget instructions
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
      units: 300000 // Increase compute units
    });
    
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 50000 // Add priority fee
    });

    // Create launch transaction
    const tx = await program.methods
      .launch(
        Number(process.env.DECIMALS),
        new BN(Number(process.env.TOKEN_SUPPLY)),
        new BN(Number(process.env.VIRTUAL_RESERVES)),
        validatedData.name,
        validatedData.symbol,
        metadataUrl
      )
      .accounts({
        creator: creatorPubkey,
        token: keypair.address,
        teamWallet: configAccount.teamWallet
      })
      .transaction();

    tx.instructions = [
      modifyComputeUnits,
      addPriorityFee,
      ...tx.instructions
    ];

    tx.feePayer = creatorPubkey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.sign(tokenKp);

    logger.log("New token created, sending tx...");

    // If this fails, the token should not be created
    try {
      const signature = await execTx(tx, connection, payer);
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        logger.error('Transaction failed:', confirmation.value.err);
        return res.status(500).json({ error: 'Transaction failed' });
      }

      // Only proceed with token creation if transaction is confirmed
      try {
        const token = await Token.findOneAndUpdate(
          { mint: keypair.address },
          {
          name: validatedData.name,
          ticker: validatedData.symbol,
          url: metadataUrl,
          image: imageUrl,
          twitter: metadata.twitter,
          telegram: metadata.telegram,
          website: metadata.website,
          description: metadata.description,
          mint: keypair.address,
          creator: creatorPubkey.toBase58(),
          status: 'pending',
          createdAt: new Date(),
          lastUpdated: new Date(),
          marketCapUSD: 0,
          solPriceUSD: await getSOLPrice(),
          liquidity: 0,
          reserveLamport: 0,
          reserveToken: 0,
          curveLimit: process.env.CURVE_LIMIT,
          curveProgress: 0,
          tokenPriceUSD: 0,
          price24hAgo: 0,
          priceChange24h: 0,
          volume24h: 0,
          inferenceCount: 0,
          virutalReserves: process.env.VIRTUAL_RESERVES,
          xusername: validatedData.xusername,
          xurl: validatedData.xurl,
          xavatarurl: validatedData.xavatarurl,
          xname: validatedData.xname,
          xtext: validatedData.xtext
        },
        { 
          upsert: true,
          new: true 
        }
      );

      // return token but dont save it to db
      // const token = {
      //   name: validatedData.name,
      //   ticker: validatedData.symbol,
      //   url: metadataUrl,
      //   image: imageUrl,
      //   mint: keypair.address,
      //   creator: creatorPubkey.toBase58(),
      //   status: 'pending',
      //   xusername: validatedData.xusername,
      //   xurl: validatedData.xurl,
      //   xavatarurl: validatedData.xavatarurl,
      //   xname: validatedData.xname,
      //   xtext: validatedData.xtext,
      //   createdAt: new Date(),
      //   lastUpdated: new Date()
      // };

      return res.json({ token });
    } catch (error) {
      logger.error('Error creating token record:', error);
      return res.status(500).json({ error: 'Failed to create token record' });
    }

  } catch (error) {
    logger.error('Error sending or confirming tx:', error);
    return res.status(500).json({ error: 'Failed to send or confirm transaction' });
  }

  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      logger.error('Error creating token:', error);
      res.status(500).json({ error: error.message });
    }
  }
});

// Get all swaps history
// router.get('/swaps', async (req, res) => {
//   try {
//     const swaps = await Swap.find();
//     res.json(swaps);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// Get specific token swaps (for token detail charting)
router.get('/swaps/:mint', async (req, res) => {
  try {
    const mintValidation = z.string().min(32).max(44);
    const mint = mintValidation.parse(req.params.mint);
    
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string;
    const startTime = req.query.startTime ? new Date(req.query.startTime as string) : undefined;
    const endTime = req.query.endTime ? new Date(req.query.endTime as string) : undefined;
    
    // Build query
    let query: any = { tokenMint: mint };
    
    if (cursor) {
      query._id = { $gt: cursor };
    }
    
    if (startTime || endTime) {
      query.timestamp = {};
      if (startTime) query.timestamp.$gte = startTime;
      if (endTime) query.timestamp.$lte = endTime;
    }

    const swaps = await Swap
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit + 1)
      .select('-__v');

    const hasMore = swaps.length > limit;
    const results = swaps.slice(0, limit);
    const nextCursor = hasMore ? results[results.length - 1]._id : null;

    res.json({
      swaps: results,
      nextCursor,
      hasMore
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Get chart data
router.get('/chart/:pairIndex/:start/:end/:range/:token', async (req, res) => {
  try {
    const params = ChartParamsSchema.parse(req.params);
    const data = await fetchPriceChartData(
      params.pairIndex,
      params.start * 1000,
      params.end * 1000,
      params.range,
      params.token
    );
    return res.status(200).send({ table: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      logger.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Get all fees history endpoint
router.get('/fees', async (req, res) => {
  try {
    const fees = await Fee.find();
    res.json(fees);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all messages
router.get('/messages', async (req, res) => {
  try {
    const messages = await Message.find();
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all root messages (no parentId) for a token
router.get('/messages/:mint', async (req, res) => {
  try {
    const mintValidation = z.string().min(32).max(44);
    const mint = mintValidation.parse(req.params.mint);
    
    const messages = await Message.find({ 
      tokenMint: mint,
      parentId: null // Only get root messages
    }).sort({ timestamp: -1 });
    
    res.json(messages);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Get replies for a specific message
router.get('/messages/:messageId/replies', async (req, res) => {
  try {
    const replies = await Message.find({
      parentId: req.params.messageId
    }).sort({ timestamp: 1 });
    
    res.json(replies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new message or reply
router.post('/new-msg', requireAuth, async (req, res) => {
  try {
    const validatedData = MessageValidation.parse(req.body);
    const message = new Message(validatedData);

    // If this is a reply, increment the parent's replyCount
    if (validatedData.parentId) {
      await Message.findByIdAndUpdate(
        validatedData.parentId,
        { $inc: { replyCount: 1 } }
      );
    }

    await message.save();
    res.json(message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Get message thread (parent + all replies)
router.get('/messages/:messageId/thread', async (req, res) => {
  try {
    const messageId = req.params.messageId;
    
    // Get the parent message
    const parentMessage = await Message.findById(messageId);
    if (!parentMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Get all replies
    const replies = await Message.find({
      parentId: messageId
    }).sort({ timestamp: 1 });

    res.json({
      parent: parentMessage,
      replies: replies
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Message Likes
router.post('/message-likes/:messageId', requireAuth, async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const userAddress = req.user.publicKey;

    // Find the message
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if user already liked this message
    const existingLike = await MessageLike.findOne({
      messageId,
      userAddress
    });

    if (existingLike) {
      return res.status(400).json({ error: 'Already liked this message' });
    }

    // Create like record and increment message likes atomically
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Create like record
      await MessageLike.create([{
        messageId,
        userAddress,
        timestamp: new Date()
      }], { session });

      // Increment message likes
      const updatedMessage = await Message.findByIdAndUpdate(
        messageId,
        { $inc: { likes: 1 } },
        { new: true, session }
      );

      await session.commitTransaction();
      res.json(updatedMessage);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

  } catch (error) {
    logger.error('Error liking message:', error);
    res.status(500).json({ error: 'Failed to like message' });
  }
});

// POST Create a new user
router.post('/register', async (req, res) => {
  try {
      // Add signing
      const validatedData = UserValidation.parse(req.body);
      
      // Check if user already exists
      let user = await User.findOne({ address: validatedData.address });
      
      if (!user) {
      // Only create new user if they don't exist
      user = new User(validatedData);
      await user.save();
      logger.log(`New user registered: ${user.address}`);
      } else {
      logger.log(`Existing user logged in: ${user.address}`);
      }

      // Generate JWT token for both new and existing users
      // const token = createJWT(user.address);



      res.json({ user });
  } catch (error) {
      if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      } else {
      res.status(500).json({ error: error.message });
      }
  }
});

// Get User Avatar
router.get('/avatar/:address', async (req, res) => {
  try {
    const addressValidation = z.string().min(32).max(44);
    const address = addressValidation.parse(req.params.address);
    
    const user = await User.findOne({ address });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ avatar: user.avatar });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// POST to get an unused vanity keypair
router.post('/vanity-keypair', requireAuth, async (req, res) => {
    try {
      const validatedData = VanityKeypairRequestValidation.parse(req.body);
      const address = validatedData.address;

      // check if address is from valid user
      const user = await User.findOne({ address });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Find and mark a keypair as used atomically
      const keypair = await VanityKeypair.findOneAndUpdate(
        { used: false },
        { used: true },
        { new: true }
      );
  
      if (!keypair) {
        return res.status(404).json({ error: 'No unused keypairs available' });
      }
  
      // Decode secret key and return keypair
      const secretKey = Buffer.from(keypair.secretKey, 'base64');
      const solanaKeypair = Keypair.fromSecretKey(secretKey);
  
      res.json({
        address: keypair.address,
        secretKey: Array.from(solanaKeypair.secretKey)
      });
  
    } catch (error) {
      res.status(500).json({ error: 'Failed to get keypair' });
    }
  });

////////////////////////////////////////////
//
// Agent Routes
//
////////////////////////////////////////////

// Add this constant for allowed outputs
const ALLOWED_OUTPUTS = [
  "systemPrompt",
  "bio",
  "lore",
  "postExamples",
  "adjectives",
  "style",
  "topics",
] as const;

type AllowedOutput = (typeof ALLOWED_OUTPUTS)[number];

// Get agent details
router.post("/agent-details", async (req, res) => {
  try {
    const { inputs, requestedOutputs } = req.body as AgentDetailsRequest;

    // Validate required fields
    if (!inputs.name || !inputs.description) {
      return res.status(400).json({
        error: "Name and description are required fields",
      });
    }

    // Validate requestedOutputs array
    if (!Array.isArray(requestedOutputs) || requestedOutputs.length === 0) {
      return res.status(400).json({
        error: "requestedOutputs must be a non-empty array",
      });
    }

    // Validate that all requested outputs are allowed
    const invalidOutputs = requestedOutputs.filter(
      (output): output is string =>
        !ALLOWED_OUTPUTS.includes(output as AllowedOutput)
    );
    if (invalidOutputs.length > 0) {
      return res.status(400).json({
        error: `Invalid outputs requested: ${invalidOutputs.join(", ")}`,
        allowedOutputs: ALLOWED_OUTPUTS,
      });
    }

    // Create response with dummy values for requested outputs
    const response = await createCharacterDetails(req.body);
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: "Failed to generate agent details" });
  }
});

// Get all personalities
router.get('/agent-personalities', async (req, res) => {
  try {
    const personalities = await Personality.find().select('-__v');
    res.json(personalities);
  } catch (error) {
    logger.error('Failed to fetch personalities:', error);
    res.status(500).json({ error: 'Failed to fetch personalities' });
  }
});

// Get all agents for authenticated user
router.get('/agents', requireAuth, async (req, res) => {
  try {
    const ownerAddress = req.user?.publicKey;
    
    const query = {
      deletedAt: null,
      ...(ownerAddress ? { ownerAddress } : {})
    };

    const agents = await Agent.find(query)
      .select('id ownerAddress contractAddress name symbol description')
      .sort({ createdAt: -1 });

    res.json(agents);
  } catch (error) {
    logger.error('Failed to fetch agents:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// Get agent by ID
router.get('/agents/:id', requireAuth, async (req, res) => {
  try {
    const ownerAddress = req.user?.publicKey;
    
    const agent = await Agent.findOne({
      _id: req.params.id,
      ownerAddress,
      deletedAt: null
    }).select([
      'ownerAddress',
      'contractAddress',
      'txId',
      'symbol',
      'name',
      'twitterUsername',
      'description',
      'systemPrompt',
      'modelProvider',
      'bio',
      'lore',
      'messageExamples',
      'postExamples',
      'adjectives',
      'people',
      'topics',
      'styleAll',
      'styleChat',
      'stylePost',
      'createdAt',
      'updatedAt'
    ]).lean();

    if (!agent) {
      logger.log("Agent not found or unauthorized", {
        id: req.params.id,
      });
      return res.status(404).json({ error: "Agent not found" });
    }

    logger.log("Agent fetched successfully", {
      agentId: agent._id,
    });

    res.json(agent);
  } catch (error) {
    logger.error("Failed to fetch agent", error);
    res.status(400).json({ error: "Failed to fetch agent" });
  }
});

router.post('/upload-pinata', requireAuth, async (req, res) => {
  try {
    const { image, metadata } = req.body;

    if (!image || !metadata) {
      return res.status(400).json({ error: 'Image and metadata are required' });
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(image.split(',')[1], 'base64');
    
    // Upload image to IPFS
    const imageUrl = await uploadToPinata(imageBuffer);
    
    // Create and upload metadata
    const metadataObj = {
      name: metadata.name,
      symbol: metadata.symbol,
      description: metadata.description,
      image: imageUrl,
      showName: true,
      createdOn: "https://x.com/autofun", // TODO: change this
      twitter: metadata.twitter,
      telegram: metadata.telegram,
      website: metadata.website
    };
    
    // Upload metadata to IPFS
    const metadataUrl = await uploadToPinata(metadataObj, { isJson: true });

    res.json({
      success: true,
      imageUrl,
      metadataUrl
    });

  } catch (error) {
    logger.error('Failed to upload to Pinata:', error);
    res.status(500).json({ error: 'Failed to upload to Pinata' });
  }
});

// Create new agent
router.post('/agents', requireAuth, async (req, res) => {
  try {
    const {
      signed_transaction,
      token_metadata,
      public_key,
      mint_keypair_public,
      twitter_credentials,
      agent_metadata,
    } = req.body;

     // First create the token
     let tokenResult;
     try {
       logger.log("Creating token", { mint_keypair_public });
       tokenResult = await submitTokenTransaction({
         signed_transaction,
         token_metadata,
         public_key,
         mint_keypair_public,
       });

       logger.log("Token created successfully", {
         signature: tokenResult.signature,
       });
     } catch (error) {
       logger.error("Token creation failed", error);
       return res.status(400).json({ error: "Failed to create token" });
     }

    // Verify Twitter credentials if provided
    let twitterCookie;
    if (twitter_credentials) {
      try {
        logger.log("Attempting Twitter login", { twitterUsername: twitter_credentials.username });
        const scraper = new Scraper();
        await scraper.login(
          twitter_credentials.username,
          twitter_credentials.password,
          twitter_credentials.email
        );
        twitterCookie = (await scraper.getCookies()).toString();
        logger.log("Twitter authentication successful", {
          twitterUsername: twitter_credentials.username,
        });
      } catch (error) {
        logger.error("Twitter authentication failed", error);
        return res.status(401).json({
          error: "Authentication failed - invalid Twitter credentials",
        });
      }
    }

    const agentData = {
      ownerAddress: public_key,
      txId: tokenResult?.signature,
      name: agent_metadata.name,
      description: agent_metadata.description,
      systemPrompt: agent_metadata.systemPrompt,
      bio: splitIntoLines(agent_metadata.bio),
      lore: splitIntoLines(agent_metadata.lore),
      postExamples: splitIntoLines(agent_metadata.postExamples),
      topics: splitIntoLines(agent_metadata.topics),
      personalities: agent_metadata.personalities,
      styleAll: splitIntoLines(agent_metadata.style),
      adjectives: splitIntoLines(agent_metadata.adjectives),
      contractAddress: mint_keypair_public,
      symbol: token_metadata.symbol,
      twitterUsername: twitter_credentials?.username,
      twitterPassword: twitter_credentials?.password,
      twitterEmail: twitter_credentials?.email,
      twitterCookie,
    };

    const agent = await Agent.create(agentData);
    await adjustTaskCount(1);

    logger.log("Increased ECS task count by 1 for agentId: ", {
      agentId: agent.id,
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to create agent:', error);
    res.status(400).json({ error: 'Failed to create agent' });
  }
});

// Update agent
router.put('/agents/:id', requireAuth, async (req, res) => {
  try {
    const ownerAddress = req.user?.publicKey;
    const agent = await Agent.findOne({ 
      _id: req.params.id,
      ownerAddress,
      deletedAt: null
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found or unauthorized' });
    }

    if (agent.ecsTaskId) {
      await stopEcsTask(agent.ecsTaskId);
    }

    const updateData = { ...req.body, ecsTaskId: null };
    const updatedAgent = await Agent.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    res.json(updatedAgent);
  } catch (error) {
    logger.error('Failed to update agent:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// Claim a pending agent
router.post("/agents/claim", async (req, res) => {
    const { ecsTaskId } = req.body;

    if (!ecsTaskId) {
      logger.error("Missing ECS task ID", null);
      return res.status(400).json({ error: "ECS task ID is required" });
    }

    try {
      logger.log("Attempting to claim agent", {
        ecsTaskId,
      });
      const claimedAgent = await Agent.findOneAndUpdate(
        {
          ecsTaskId: null,
          deletedAt: null
        },
        {
          $set: {
            ecsTaskId: ecsTaskId,
            updatedAt: new Date()
          }
        },
        {
          new: true, // Return the updated document
          sort: { createdAt: 1 } // Claim oldest pending agent first
        }
      );

      if (!claimedAgent) {
        logger.log("No pending agents available");
        // Set task count to match active agents when no pending agents are found
        // await setTaskCountToActiveAgents();
        return res.status(404).json({ error: "No pending agents available" });
      }

      logger.log("Agent claimed successfully", {
        agentId: claimedAgent.id,
        ecsTaskId,
      });

      res.json(claimedAgent);
    } catch (error) {
      logger.error("Failed to claim agent", error);
      res.status(500).json({ error: "Failed to claim agent" });
    }
  }
);

// Add a safety cleanup endpoint that can be run periodically
// This handles cases where a task died without properly releasing
router.post("/agents/cleanup-stale", async (req, res) => {
    const STALE_THRESHOLD_MINUTES = 5; // Configure as needed

    try {
      logger.log("Cleaning up stale agents");
      const result = await Agent.updateMany({
        ecsTaskId: { $ne: null },
        updatedAt: { $lt: new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000) }
      }, {
        ecsTaskId: null,
        updatedAt: new Date()
      });
      logger.log("Stale agents cleaned up");
      res.json({ clearedStaleAgents: result });
    } catch (error) {
      logger.error("Failed to clean up stale agents", error);
      res.status(500).json({ error: "Failed to cleanup stale agents" });
    }
  }
);

// Add the ability to forcibly release a task (for admin/debugging purposes)
router.post("/agents/:id/force-release", async (req, res) => {
    const { id } = req.params;
    const { adminKey } = req.body;

    // Simple admin verification - you'd want something more robust in production
    if (adminKey !== process.env.ADMIN_KEY) {
      logger.error("Unauthorized", null);
      return res.status(403).json({ error: "Unauthorized" });
    }

    try {
      logger.log("Force releasing agent");
      const agent = await Agent.findByIdAndUpdate(id, {
        ecsTaskId: null,
        updatedAt: new Date(),
      });
      logger.log("Agent force released successfully", {
        agentId: agent.id,
      });
      res.json(agent);
    } catch (error) {
      logger.error("Failed to force release agent", error);
      res.status(500).json({ error: "Failed to force release agent" });
    }
  }
);

// Get token and agent data combined
router.get('/token-agent/:mint', async (req, res) => {
  try {
    const mintValidation = z.string().min(32).max(44);
    const mint = mintValidation.parse(req.params.mint);
    
    // Get token data
    const token = await Token.findOne({ mint });
    if (!token) {
      return res.status(404).json({ error: 'Token not found' });
    }

    // Get SOL price and calculate market data
    const solPrice = await getSOLPrice();
    const tokenWithMarketData = await calculateTokenMarketData(token, solPrice);

    // Get associated agent data
    const agent = await Agent.findOne({ 
      contractAddress: mint,
      deletedAt: null 
    }).select([
      'ownerAddress',
      'contractAddress',
      'txId',
      'symbol',
      'name',
      'twitterUsername',
      'description',
      'systemPrompt',
      'modelProvider',
      'bio',
      'lore',
      'messageExamples',
      'postExamples',
      'adjectives',
      'people',
      'topics',
      'styleAll',
      'styleChat',
      'stylePost',
      'createdAt',
      'updatedAt'
    ]).lean();

    res.json({
      token: tokenWithMarketData,
      agent: agent || null // Return null if no agent exists
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      logger.error('Error fetching token and agent data:', error);
      res.status(500).json({ error: error.message });
    }
  }
});

router.post('/verify', async (req, res) => {
  const { twitterUsername, twitterPassword, twitterEmail } = req.body;

  if (!twitterUsername || !twitterPassword || !twitterEmail) {
    logger.error('Missing Twitter credentials', null);
    return res.status(400).json({
      error: 'Twitter username, email and password are required',
    });
  }

  try {
    logger.log('Verifying Twitter credentials', {
      twitterUsername,
    });
    const scraper = new Scraper();
    await scraper.login(twitterUsername, twitterPassword, twitterEmail);
    logger.log('Twitter credentials verified successfully');
    res.json({ verified: true });
  } catch (error) {
    logger.error('Failed to verify Twitter credentials', error);
    res.status(400).json({
      verified: false,
      error: 'Failed to verify Twitter credentials',
    });
  }
});

export default router;