import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const DB_PATH = process.env.LOCAL_DB_PATH || '/data/dev.sqlite';

export default defineConfig({
   out: './drizzle',
   schema: './src/db.ts',
   dialect: 'sqlite',
   dbCredentials: {
      url: `file:${DB_PATH}`,
   },
});