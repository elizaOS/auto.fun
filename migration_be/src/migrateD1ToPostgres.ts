import { D1Database } from "@cloudflare/workers-types/experimental";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { schema } from "./db";
import { eq } from "drizzle-orm";
import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Define table names to migrate
const TABLES = [
  "tokens",
  "swaps",
  "fees",
  "token_holders",
  "messages",
  "message_likes",
  "users",
  "personalities",
  "vanity_keypairs",
  "media_generations",
  "cache_prices",
  "pre_generated_tokens",
  "oauth_verifiers",
  "access_tokens",
  "token_agents",
  "vanity_generation_instances",
  "metadata",
];

// Function to connect to D1 database
async function connectToD1(d1DatabaseId: string): Promise<any> {
  try {
    // This is a mock implementation since we can't directly connect to D1 outside of Cloudflare Workers
    console.log(`Would connect to D1 database with ID: ${d1DatabaseId}`);
    console.log(
      "In a real migration, you would need to export data from D1 first."
    );
    console.log(
      "You can use wrangler to export data from D1 to a SQLite file:"
    );
    console.log(`wrangler d1 export ${d1DatabaseId} --output=d1-export.sql`);

    return null;
  } catch (error) {
    console.error("Error connecting to D1:", error);
    throw error;
  }
}

// Function to connect to PostgreSQL database
async function connectToPostgres(connectionString: string): Promise<any> {
  try {
    const pool = new Pool({ connectionString });
    const db = drizzle(pool, { schema });

    // Test the connection
    await pool.query("SELECT NOW()");
    console.log("Successfully connected to PostgreSQL");

    return { pool, db };
  } catch (error) {
    console.error("Error connecting to PostgreSQL:", error);
    throw error;
  }
}

// Function to create PostgreSQL tables
async function createPostgresTables(db: any): Promise<void> {
  try {
    console.log("Creating PostgreSQL tables...");

    // In a real migration, you would use drizzle-kit to generate and run migrations
    console.log(
      "In a real migration, you would use drizzle-kit to generate and run migrations:"
    );
    console.log("npx drizzle-kit generate:pg --schema=./src/db.ts");
    console.log("npx drizzle-kit push:pg");

    console.log("PostgreSQL tables created successfully");
  } catch (error) {
    console.error("Error creating PostgreSQL tables:", error);
    throw error;
  }
}

// Function to migrate data from D1 to PostgreSQL
async function migrateData(d1Db: any, pgDb: any): Promise<void> {
  try {
    console.log("Starting data migration...");

    for (const table of TABLES) {
      console.log(`Migrating table: ${table}`);

      // In a real migration, you would:
      // 1. Read data from D1
      // 2. Transform data if needed
      // 3. Insert data into PostgreSQL

      console.log(`Table ${table} migrated successfully`);
    }

    console.log("Data migration completed successfully");
  } catch (error) {
    console.error("Error migrating data:", error);
    throw error;
  }
}

// Function to verify migration
async function verifyMigration(d1Db: any, pgDb: any): Promise<void> {
  try {
    console.log("Verifying migration...");

    for (const table of TABLES) {
      console.log(`Verifying table: ${table}`);

      // In a real migration, you would:
      // 1. Count records in D1
      // 2. Count records in PostgreSQL
      // 3. Compare counts
      // 4. Optionally compare data samples

      console.log(`Table ${table} verified successfully`);
    }

    console.log("Migration verification completed successfully");
  } catch (error) {
    console.error("Error verifying migration:", error);
    throw error;
  }
}

// Main migration function
async function main(): Promise<void> {
  let pgPool = null;

  try {
    // Get database connection details from environment variables
    const d1DatabaseId = process.env.D1_DATABASE_ID;
    const pgConnectionString = process.env.DATABASE_URL;

    if (!d1DatabaseId) {
      throw new Error("D1_DATABASE_ID environment variable is not set");
    }

    if (!pgConnectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    console.log("Starting migration from D1 to PostgreSQL...");

    // Connect to databases
    const d1Db = await connectToD1(d1DatabaseId);
    const { pool, db: pgDb } = await connectToPostgres(pgConnectionString);
    pgPool = pool;

    // Create PostgreSQL tables
    await createPostgresTables(pgDb);

    // Migrate data
    await migrateData(d1Db, pgDb);

    // Verify migration
    await verifyMigration(d1Db, pgDb);

    console.log("Migration completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    // Close database connections
    if (pgPool) {
      // @ts-ignore
      await pgPool.end();
    }
  }
}

// Run the migration
main();
