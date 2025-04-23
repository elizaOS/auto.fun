import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

export default defineConfig({
   out: './drizzle',
   schema: './src/db.ts',
   dialect: 'postgresql',
   migrations: {
      schema: 'public',
   },
   dbCredentials: {
      url: process.env.DATABASE_URL || '',
   },
});
