// import cron from 'node-cron';
// import { Connection, PublicKey, Keypair } from '@solana/web3.js';
// import { AnchorProvider, Program } from '@coral-xyz/anchor';
// import * as idlJson from '@autodotfun/types/idl/autofun.json';
// import * as raydiumVaultIdlJson from '@autodotfun/types/idl/raydium_vault.json';
// import { Autofun } from '@autodotfun/types/types/autofun';
// import { RaydiumVault } from '@autodotfun/types/types/raydium_vault';
// import { Wallet } from '../tokenSupplyHelpers/customWallet';
// import { TokenMigrator } from './migrateToken';
// import { getGlobalRedisCache } from '../redis';
// import { default as pLimit } from 'p-limit';

// // Parse IDLs
// const idl: Autofun = JSON.parse(JSON.stringify(idlJson));
// const raydium_vault_IDL: RaydiumVault = JSON.parse(JSON.stringify(raydiumVaultIdlJson));

// // Load environment
// const NETWORK = process.env.NETWORK || 'mainnet';
// const RPC_URL = NETWORK === 'devnet'
//    ? process.env.DEVNET_SOLANA_RPC_URL!
//    : process.env.MAINNET_SOLANA_RPC_URL!;


// async function createMigrator() {
//    const connection = new Connection(RPC_URL, 'confirmed');
//    const wallet = Keypair.fromSecretKey(
//       Uint8Array.from(JSON.parse(process.env.EXECUTOR_PRIVATE_KEY!)),
//    );
//    const provider = new AnchorProvider(connection, new Wallet(wallet), AnchorProvider.defaultOptions());

//    const program = new Program<RaydiumVault>(
//       raydium_vault_IDL as any,
//       provider,
//    );
//    const autofunProgram = new Program<Autofun>(idl as any, provider);


//    const redisCache = await getGlobalRedisCache();
//    return new TokenMigrator(
//       connection,
//       new Wallet(wallet),
//       program,
//       autofunProgram,
//       provider,
//       redisCache
//    );
// }


// const CONCURRENCY = Number(process.env.MIGRATION_CONCURRENCY ?? '5');

// async function resumeTick(migrator: TokenMigrator) {
//    const redisCache = await getGlobalRedisCache();
//    const now = new Date().toISOString();
//    console.log(`[${now}] Running migration resume tick`);
//    try {
//       const keys = await redisCache.keys('migration:*:currentStep');
//       if (!keys.length) {
//          console.log(`[${now}] No in‑flight migrations found`);
//          return;
//       }
//       const limit = pLimit(CONCURRENCY);
//       const tasks = keys.map((key) =>
//          limit(async () => {
//             const parts = key.split(':');
//             const mint = parts[2];
//             console.log({ mint })

//             try {
//                const { ranStep, nextStep } = await migrator.resumeOneStep(mint);

//                if (ranStep) {
//                   console.log(`[${now}] ${mint}: ran step '${ranStep}', next: '${nextStep ?? 'none'}'`);
//                }


//             } catch (err) {
//                console.error(`Error resuming ${mint}:`, err);
//             }
//          })
//       );
//    } catch (err) {
//       console.error('Resume tick failed:', err);
//    }
// }

// export async function startMigrationCron() {
//    const migrator = await createMigrator();
//    // 1️⃣ Immediate sweep
//    await resumeTick(migrator);
//    // 2️⃣ Schedule repeating job
//    console.log('🚀 Scheduling migration-resume cron (every 2 minutes)');
//    cron.schedule('*/2 * * * *', () => resumeTick(migrator));
// }
// if (require.main === module) {
//    startMigrationCron().catch((err) => {
//       console.error('Migration cron failed to start:', err);
//       process.exit(1);
//    });
// }
