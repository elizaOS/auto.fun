import { Router } from 'express';
import { User, Token, createTokenSchema, TokenHolder, Swap, Fee, Message, VanityKeypair, VanityKeypairValidation, VanityKeypairRequestValidation, ChartParamsSchema, Agent, Personality, MessageLikeValidation, MessageLike, NewMessageValidation, TokenType } from './schemas';
import { fetchPriceChartData } from './server';
import { z } from 'zod';
import { 
  UserValidation, 
  TokenValidation, 
  SwapValidation, 
  FeeValidation, 
  MessageValidation 
} from './schemas';
import { ComputeBudgetProgram, Connection, Keypair, ParsedAccountData, PublicKey, SystemProgram, Transaction, VersionedTransaction, TransactionInstruction, MessageCompiledInstruction, TransactionMessage } from '@solana/web3.js';
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
import { execTx, getRpcUrl, splitIntoLines } from './lib/util';
import { getSOLPrice } from './mcap';
import { calculateTokenMarketData } from './mcap';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccount, createAssociatedTokenAccountInstruction, createTransferInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
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
import { initSdk, txVersion } from './lib/raydium-config';
import { ApiV3PoolInfoStandardItemCpmm, CpmmKeys, CREATE_CPMM_POOL_PROGRAM, DEV_CREATE_CPMM_POOL_AUTH, DEV_CREATE_CPMM_POOL_PROGRAM, DEV_LOCK_CPMM_AUTH, DEV_LOCK_CPMM_PROGRAM } from '@raydium-io/raydium-sdk-v2';
import { bulkUpdatePartialTokens } from './lib/tokenUtils';
import { statsManager } from './lib/statsManager';

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

async function getTokensWithPagination({
  page = 1,
  limit = 50,
  sortBy = 'featured',
  sortOrder = 'desc',
  query = { status: { $ne: 'pending' } }
} = {}) {
  const skip = (page - 1) * limit;
  
  // Get total count first
  const total = await Token.countDocuments(query);
  
  // Define the pipeline steps
  let aggregationPipeline: any[] = [
    { $match: query },
    {
      $lookup: {
        from: 'messages',
        localField: 'mint',
        foreignField: 'tokenMint',
        pipeline: [
          { $match: { parentId: null } }
        ],
        as: 'messages'
      }
    },
    {
      $addFields: {
        numComments: { $size: '$messages' }
      }
    },
    {
      $project: {
        messages: 0,
        __v: 0
      }
    }
  ];

  // Apply special weighted sorting if "Featured" sort is specified
  if (sortBy === 'featured') {
    const { maxVolume24h, maxHolderCount } = statsManager.getMaxStats();

    // Add a weighted score field
    aggregationPipeline.push({
      $addFields: {
        featuredScore: {
          $add: [
            { $multiply: [{ $divide: [{ $ifNull: ['$volume24h', 0] }, maxVolume24h] }, Number(process.env.FEATURED_SCORE_VOLUME_WEIGHT)] },
            { $multiply: [{ $divide: [{ $ifNull: ['$holderCount', 0] }, maxHolderCount] }, Number(process.env.FEATURED_SCORE_HOLDER_WEIGHT)] }
          ]
        }
      }
    });
    
    // Sort by the featured score
    aggregationPipeline.push({
      $sort: {
        featuredScore: sortOrder === 'desc' ? -1 : 1
      }
    });
  } else {
    // Use the standard sorting
    aggregationPipeline.push({
      $sort: {
        [sortBy === 'marketCapUSD' ? 'marketCapUSD' : sortBy]: 
        sortOrder === 'desc' ? -1 : 1
      }
    });
  }
  
  // Add pagination
  aggregationPipeline.push({ $skip: skip });
  aggregationPipeline.push({ $limit: limit });
  
  const tokens = await Token.aggregate(aggregationPipeline);

  // When the homepage is fetched we want to make sure we don't have any missing data/partial Tokens
  const filledTokens = await bulkUpdatePartialTokens(tokens);

  const totalPages = Math.ceil(total / limit);

  return {
    tokens: filledTokens,
    page,
    totalPages,
    total,
    hasMore: page < totalPages
  };
}

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
    const page = parseInt(req.query.page as string) || 1;
    const {
      status,
      secondaryStatus, 
      search,
      creator,
      sortBy = 'featured',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    let query: any = {};

    if (status || secondaryStatus) {
      if (status && secondaryStatus) {
        query.$or = [
          { status },
          { status: secondaryStatus }
        ];
      } else {
        query.status = status || secondaryStatus;
      }
    }

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

    const result = await getTokensWithPagination({
      page,
      limit,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
      query
    });

    res.json(result);
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

    const agent = await Agent.findOne({ txId: token.txId })

    // Get SOL price and calculate market data
    const solPrice = await getSOLPrice();
    const tokenWithMarketData = await calculateTokenMarketData(token, solPrice);

    res.json({ ...tokenWithMarketData, hasAgent: !!agent });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Get token holders endpoint
router.get('/tokens/:mint/holders', async (req, res) => {
  try {
    const mintValidation = z.string().min(32).max(44);
    const mint = mintValidation.parse(req.params.mint);
    
    const limit = parseInt(req.query.limit as string) || 50;
    const page = parseInt(req.query.page as string) || 1;
    const skip = (page - 1) * limit;
    const sortBy = req.query.sortBy as string || 'amount';
    const sortOrder = req.query.sortOrder as string || 'desc';
    const search = req.query.search as string;

    // Build query
    let query: any = { mint };
    
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

    // Get total count
    const total = await TokenHolder.countDocuments(query);

    const holders = await TokenHolder
      .find(query)
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(limit)
      .select('-__v');

    const totalPages = Math.ceil(total / limit);

    res.json({
      holders,
      page,
      totalPages,
      total,
      hasMore: page < totalPages
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

const VALID_PROGRAM_ID = new Set(
  [
    CREATE_CPMM_POOL_PROGRAM.toBase58(), 
    DEV_CREATE_CPMM_POOL_PROGRAM.toBase58()
  ])
const isValidCpmm = (id: string) => VALID_PROGRAM_ID.has(id)

// Transaction to harvest LP fees
router.get('/tokens/:mint/harvest-tx', async (req, res) => {
  try {
    // Validate mint parameter and extract owner from query
    const mintValidation = z.string().min(32).max(44);
    const mint = mintValidation.parse(req.params.mint);
    const owner = req.query.owner as string;

    // Find the token by its mint address
    const token = await Token.findOne({ mint });
    if (!token) {
      return res.status(404).json({ error: 'Token not found' });
    }

    // Make sure the request owner is actually the token creator
    if (owner !== token.creator) {
      return res.status(403).json({ error: 'Only the token creator can harvest' });
    }

    // Confirm token status is "locked" and that an NFT was minted
    if (token.status !== 'locked') {
      return res.status(400).json({ error: 'Token is not locked' });
    }
    if (!token.nftMinted) {
      return res.status(400).json({ error: 'Token has no NFT minted' });
    }

    // Extract the NFT mint address (assumed to be the first in a comma‐separated list)
    const nftMint = token.nftMinted.split(',')[0];
    const ownerPubKey = new PublicKey(owner);
    const nftMintPubKey = new PublicKey(nftMint);

    // Check whether the owner wallet already holds the NFT by querying the associated token account balance
    const destinationAta = getAssociatedTokenAddressSync(nftMintPubKey, ownerPubKey);
    let ownerHasNFT = false;
    try {
      const tokenAccountBalance = await connection.getTokenAccountBalance(destinationAta);
      if (tokenAccountBalance.value.uiAmount && tokenAccountBalance.value.uiAmount > 0) {
        ownerHasNFT = true;
      }
    } catch (e) {
      // If the account doesn't exist or any error occurs, assume the NFT is not held
      ownerHasNFT = false;
    }

    // Prepare an array for additional instructions and signers
    let instructions: TransactionInstruction[] = [];
    let signers: Keypair[] = [];

    // If the owner does not have the NFT, add instructions to transfer it from the team wallet
    if (!ownerHasNFT) {
      const teamWalletKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(process.env.WALLET_PRIVATE_KEY)),
        { skipValidation: true }
      );

      // Create the associated token account if it doesn't exist
      const destinationAccountInfo = await connection.getAccountInfo(destinationAta);
      if (!destinationAccountInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            ownerPubKey,
            destinationAta,
            ownerPubKey,
            nftMintPubKey
          )
        );
      }

      // Get the team wallet's associated token account for the NFT
      const sourceAta = getAssociatedTokenAddressSync(nftMintPubKey, teamWalletKeypair.publicKey);

      // Transfer the NFT (amount = 1) from the team wallet to the owner
      instructions.push(
        createTransferInstruction(
          sourceAta,
          destinationAta,
          teamWalletKeypair.publicKey,
          1
        )
      );

      signers.push(teamWalletKeypair);
    }

    // Initialize the Raydium SDK using the owner's public key as fee payer
    const raydium = await initSdk({ loadToken: true, owner: ownerPubKey });
    let poolInfo: ApiV3PoolInfoStandardItemCpmm;
    let poolKeys: CpmmKeys | undefined;
    if (raydium.cluster === 'devnet') {
      const data = await raydium.cpmm.getPoolInfoFromRpc(token.marketId);
      poolInfo = data.poolInfo;
      poolKeys = data.poolKeys;
    } else {
      const data = await raydium.api.fetchPoolById({ ids: token.marketId });
      if (!data || data.length === 0) {
        logger.error('Pool info not found');
        return res.status(400).json({ error: 'Pool info not found' });
      }
      poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm;
    }

    // Create the harvest instruction using Raydium's SDK method.
    // Note: harvestTx is a VersionedTransaction.
    const { transaction: harvestTx } = await raydium.cpmm.harvestLockLp({
      poolInfo,
      poolKeys,
      feePayer: ownerPubKey,
      nftMint: nftMintPubKey,
      lpFeeAmount: new BN(99999999),
      txVersion,
      programId: DEV_LOCK_CPMM_PROGRAM,
      authProgram: DEV_LOCK_CPMM_AUTH,
      clmmProgram: DEV_CREATE_CPMM_POOL_PROGRAM,
      cpmmProgram: {
        authProgram: DEV_CREATE_CPMM_POOL_AUTH,
        programId: DEV_CREATE_CPMM_POOL_PROGRAM,
      },
    });

    // Convert the harvest transaction to an array of legacy TransactionInstruction objects.
    // If harvestTx is already a legacy Transaction, its instructions are available directly;
    // otherwise (if it is a VersionedTransaction) we decompile it.
    let harvestLegacyInstructions: TransactionInstruction[] = [];
    if (harvestTx instanceof VersionedTransaction) {
      // Decompile the VersionedTransaction's message to get a TransactionMessage
      const decompiledMessage: TransactionMessage = TransactionMessage.decompile(
        harvestTx.message
      );
      harvestLegacyInstructions = decompiledMessage.instructions;
    } else {
      harvestLegacyInstructions = harvestTx.instructions;
    }

    // Now combine your additional NFT transfer instructions with the harvest instructions.
    // This approach always builds a new legacy Transaction.
    const newTx = new Transaction();
    if (instructions.length > 0) {
      newTx.add(...instructions);
    }
    newTx.add(...harvestLegacyInstructions);
    const finalTx: Transaction = newTx;

    // Next, set the blockhash and fee payer, then partially sign if needed:
    const { blockhash } = await connection.getLatestBlockhash();
    finalTx.recentBlockhash = blockhash;
    finalTx.feePayer = ownerPubKey;

    if (signers.length > 0) {
      finalTx.partialSign(...signers);
    }

    // Finally, simulate, serialize, and send the transaction.
    const simulation = await connection.simulateTransaction(finalTx);
    console.log(simulation);

    const txBytes = finalTx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const serializedTransaction = Buffer.from(txBytes).toString("base64");

    res.json({ token, transaction: serializedTransaction });
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

export async function updateHoldersCache(mint: string) {
  const connection = new Connection(getRpcUrl());
  
  try {
    // Clear existing holder data for this token
    await TokenHolder.deleteMany({ mint });

    // Get all token accounts for this mint
    const largestAccounts = await connection.getTokenLargestAccounts(new PublicKey(mint));
    
    if (!largestAccounts.value || largestAccounts.value.length === 0) {
      logger.error(`No accounts found for token ${mint}`);
      // Update token with zero holders
      await Token.findOneAndUpdate(
        { mint },
        { 
          holderCount: 0,
          lastUpdated: new Date()
        }
      );
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

    let validHolders = 0;
    
    // Get detailed account info for each holder
    const accountPromises = largestAccounts.value
      .filter(account => Number(account.amount) > 0)
      .map(async account => {
        try {
          const accountInfo = await connection.getParsedAccountInfo(account.address);
          const owner = (accountInfo.value?.data as ParsedAccountData).parsed.info.owner;
          
          // Skip bonding curve account if token is migrated
          if (isMigrated && owner === '4FRxv5k1iCrE4kdjtywUzAakCaxfDQmpdVLx48kUXQQC') {
            return null;
          }

          // Skip accounts with zero balance
          if (Number(account.amount) === 0) {
            return null;
          }

          validHolders++;
          return {
            address: owner,
            amount: account.amount,
            percentage: (Number(account.amount) / totalSupply) * 100
          };
        } catch (error) {
          logger.error(`Error processing account ${account.address}:`, error);
          return null;
        }
      });

    // Wait for all account processing to complete and filter out nulls
    const accountDetails = (await Promise.all(accountPromises))
      .filter(account => account !== null);

    // Update token holder count
    await Token.findOneAndUpdate(
      { mint },
      { 
        holderCount: validHolders,
        lastUpdated: new Date()
      }
    );
    
    // Update max holder count in stats manager
    statsManager.updateMaxHolderCount(validHolders);

    // Prepare bulk operation for holder records
    const bulkOps = accountDetails.map(account => ({
      updateOne: {
        filter: { 
          mint: mint,
          address: account.address
        },
        update: {
          $set: {
            amount: account.amount,
            percentage: account.percentage,
            lastUpdated: new Date()
          }
        },
        upsert: true
      }
    }));

    // Execute bulk write if we have operations
    if (bulkOps.length > 0) {
      await TokenHolder.bulkWrite(bulkOps);
      // logger.log(`Updated ${bulkOps.length} holder records for token ${mint}`);
    }

    // Return holder count for convenience
    return validHolders;

  } catch (error) {
    logger.error(`Error updating holders for token ${mint}:`, error);
    // Update token with error status
    await Token.findOneAndUpdate(
      { mint },
      { 
        lastUpdated: new Date(),
        $set: { 
          holderCount: 0 // Reset to 0 on error
        }
      }
    );
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

// Get specific token swaps endpoint
router.get('/swaps/:mint', async (req, res) => {
  try {
    const mintValidation = z.string().min(32).max(44);
    const mint = mintValidation.parse(req.params.mint);
    
    const limit = parseInt(req.query.limit as string) || 50;
    const page = parseInt(req.query.page as string) || 1;
    const skip = (page - 1) * limit;
    const startTime = req.query.startTime ? new Date(req.query.startTime as string) : undefined;
    const endTime = req.query.endTime ? new Date(req.query.endTime as string) : undefined;
    const userAddress = req.query.userAddress ? req.query.userAddress as string : undefined;
    
    // Build query
    let query: any = { tokenMint: mint };
    
    if (startTime || endTime) {
      query.timestamp = {};
      if (startTime) query.timestamp.$gte = startTime;
      if (endTime) query.timestamp.$lte = endTime;
    }

    if (userAddress) {
      query.user = userAddress;
    }

    // Get total count
    const total = await Swap.countDocuments(query);

    const swaps = await Swap
      .find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v');

    const totalPages = Math.ceil(total / limit);

    res.json({
      swaps,
      page,
      totalPages,
      total,
      hasMore: page < totalPages
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

const addHasLikedToMessages = async (messages: any[], userAddress?: string) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages;
  }

  if (!userAddress) {
    return messages.map(message => ({ ...message, hasLiked: false }));
  }

  const messageLikes = await MessageLike.find({
    messageId: { $in: messages.map(m => m._id) },
    userAddress
  });

  const likedMessageIds = new Set(messageLikes.map(like => 
    like.messageId.toString()
  ));

  return messages.map(message => ({
    ...message,
    hasLiked: likedMessageIds.has(message._id.toString())
  }));
};

// Get all root messages (no parentId) for a token
router.get('/messages/:mint', async (req, res) => {
  try {
    const mintValidation = z.string().min(32).max(44);
    const mint = mintValidation.parse(req.params.mint);
    const userAddress = req.user?.publicKey;
    
    const messages = await Message.find({ 
      tokenMint: mint,
      parentId: null
    })
    .lean()
    .sort({ timestamp: -1 });

    const messagesWithLikes = await addHasLikedToMessages(messages, userAddress);
    
    res.json(messagesWithLikes);
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
    const userAddress = req.user?.publicKey;
    
    const replies = await Message.find({
      parentId: req.params.messageId
    })
    .lean()
    .sort({ timestamp: -1 });

    const repliesWithLikes = await addHasLikedToMessages(replies, userAddress);
    
    res.json(repliesWithLikes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// get message thread (parent and replies)
router.get('/messages/:messageId/thread', requireAuth, async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const userAddress = req.user?.publicKey;
    
    const parentMessage = await Message.findById(messageId).lean();
    if (!parentMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const replies = await Message.find({
      parentId: messageId
    })
    .lean()
    .sort({ timestamp: -1 });

    const [parentWithLikes, repliesWithLikes] = await Promise.all([
      addHasLikedToMessages([parentMessage], userAddress),
      addHasLikedToMessages(replies, userAddress)
    ]);

    res.json({
      parent: parentWithLikes[0], // Since we wrapped single message in array
      replies: repliesWithLikes
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new message or reply
router.post('/messages/:mint', requireAuth, async (req, res) => {
  try {
    const validatedData = NewMessageValidation.parse(req.body);
    const message = new Message({
      message: validatedData.message,
      parentId: validatedData.parentId ? new mongoose.Types.ObjectId(validatedData.parentId) : undefined,
      tokenMint: req.params.mint,
      author: req.user.publicKey
    });

    // If this is a reply, increment the parent's replyCount
    if (validatedData.parentId) {
      await Message.findByIdAndUpdate(
        validatedData.parentId,
        { $inc: { replyCount: 1 } }
      );
    }

    await message.save();
    res.json({ ...message.toJSON(), hasLiked: false });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Message Likes
router.post('/message-likes/:messageId', requireAuth, async (req, res) => {
  try {
    const messageId = req.params.messageId as string;
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

    // Create like record
    await MessageLike.create([{
      messageId: new mongoose.Types.ObjectId(messageId),
      userAddress,
      timestamp: new Date()
    }]);

    // Increment message likes
    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      { $inc: { likes: 1 } }
    ).lean();

    res.json({ ...updatedMessage, hasLiked: true });
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

router.get('/agents/mint/:contractAddress', requireAuth, async (req, res) => {
  try {
    const ownerAddress = req.user?.publicKey;
    
    const agent = await Agent.findOne({
      contractAddress: req.params.contractAddress,
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
    
    if (imageBuffer.length >= 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image size must be less than 5MB' });
    }
    
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
      website: metadata.website,
      discord: metadata.discord,
      agentLink: metadata.agentLink
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

// Create new agent
router.post('/agents/:tokenId', requireAuth, async (req, res) => {
  try {
    const {
      twitter_credentials,
      agent_metadata,
    } = req.body;
    const tokenId = req.params.tokenId
    const ownerAddress = req.user?.publicKey;

    const { creator, mint, ticker, txId } = await Token.findOne({ mint: tokenId });

    if (req.user?.publicKey !== creator) {
      return res.status(401).json({error: 'only the token creator can add an agent to the token'})
    }

    // Verify Twitter credentials if provided
    let twitterCookie;
    if (twitter_credentials.email && twitter_credentials.username && twitter_credentials.password) {
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
      ownerAddress,
      txId,
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
      contractAddress: mint,
      symbol: ticker,
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
