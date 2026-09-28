import { Pool, types } from "pg";

// numeric → number (valores em reais cabem com folga em double para exibição)
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // bigint

const global_ = globalThis as unknown as { __pool?: Pool };

export const pool =
  global_.__pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgresql://hasta:hasta@localhost:5432/hasta",
    max: 5,
  });
if (process.env.NODE_ENV !== "production") global_.__pool = pool;

export async function consulta<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(sql, params);
  return r.rows as T[];
}
