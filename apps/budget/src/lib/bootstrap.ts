import { initDatabase } from "./db";
import { migrateLegacyRepayments } from "./repaymentMigration";

/** Startup and Retry must complete the same schema and data migrations. */
export async function initializeAppData(): Promise<void> {
  await initDatabase();
  await migrateLegacyRepayments();
}
