/**
 * Single source of truth for the database configuration used by API routes.
 * The app is SQL Server only; the former JSON fallback has been removed.
 */
export const dbConfig = {
  connectionString: process.env.DATABASE_URL,
};
