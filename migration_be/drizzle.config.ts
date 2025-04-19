import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
   out: './drizzle',
   schema: './src/db.ts',
   dialect: 'sqlite',
   dbCredentials: {
      url: process.env.LOCAL_DB_PATH!,
   },
});