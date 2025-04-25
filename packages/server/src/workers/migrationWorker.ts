import { startMigrationCron } from "../migration/resumeMigrationsOnStart";

(async () => {
   try {
      console.log(`[MigrationWorker:${process.env.NETWORK}] starting…`);
      await startMigrationCron();
      console.log(`[MigrationWorker:${process.env.NETWORK}] finished.`);
      // process.exit(0);
   } catch (err) {
      console.error("[MigrationWorker] error:", err);
      process.exit(1);
   }
})();
