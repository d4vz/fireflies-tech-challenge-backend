import { z } from "zod";

export type PageQuery = {
  page: number;
  limit: number;
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export const pageToolSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(50).default(10),
});

export function skipOf(query: PageQuery): number {
  return (query.page - 1) * query.limit;
}

export function fromBeforeTo(query: { from?: Date | string; to?: Date | string }): boolean {
  return query.from === undefined || query.to === undefined || query.from < query.to;
}
