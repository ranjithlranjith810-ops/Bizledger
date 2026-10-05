/**
 * Stock arithmetic for invoice creation.
 *
 * Pure helpers only — no Prisma, no I/O — so the aggregation and the
 * availability rules can be verified without touching the database. The
 * authoritative read/subtract itself lives in the invoice create transaction
 * (src/lib/invoice/invoice-service.ts), which performs the check and the
 * decrement as one conditional UPDATE.
 *
 * SCOPE: this is not a new inventory system. There is exactly one stock column
 * (`Product.stockQuantity`) and no stock/service flag, so the only distinction
 * that exists in the data model is whether a line references a Product master.
 * Lines WITH a `productId` draw down that product; lines WITHOUT one
 * (free-text/custom lines) have no stock to move. No new columns, no movement
 * ledger, and no per-document-type behaviour are introduced.
 */

/** A normalized invoice line, as far as stock is concerned. */
export interface StockLine {
  productId: string | null;
  quantity: number;
}

/**
 * Quantities can be fractional (1.5 hrs, 0.25 kg). Summing raw JS floats can
 * produce dust (0.1 + 0.2 === 0.30000000000000004), and comparing that against
 * an exact DECIMAL column would spuriously report insufficient stock. Demand
 * is therefore quantized to 6 decimal places before it reaches the database.
 */
const QUANTITY_SCALE = 6;

export function roundQuantity(quantity: number): number {
  const factor = 10 ** QUANTITY_SCALE;
  return Math.round(quantity * factor) / factor;
}

/**
 * Sum the requested quantity per product.
 *
 * Duplicate lines for the same product are aggregated into a single demand, so
 * a product with stock 5 invoiced as two lines of 2 and 1 is treated as a
 * single demand of 3 — not as two independent checks that each pass on their
 * own. Products absent from a line (productId === null) are skipped.
 *
 * @returns productId -> total requested quantity, in first-seen line order.
 */
export function aggregateStockDemand(
  lines: readonly StockLine[],
): Map<string, number> {
  const demand = new Map<string, number>();
  for (const line of lines) {
    const productId = line.productId?.trim();
    if (!productId) continue;
    const quantity = roundQuantity(line.quantity);
    if (!(quantity > 0)) continue;
    demand.set(productId, roundQuantity((demand.get(productId) ?? 0) + quantity));
  }
  return demand;
}

/**
 * Is there enough stock to satisfy `requested`?
 *
 * Equality is allowed: stock 5 with a request of 5 is available (it lands on
 * exactly 0), stock 0 with a request of 1 is not. Used for pre-flight
 * messaging and tests; the transaction's conditional UPDATE is the real gate.
 */
export function hasSufficientStock(available: number, requested: number): boolean {
  return roundQuantity(available) >= roundQuantity(requested);
}

/** End-user rejection text. Names the product and both quantities. */
export function insufficientStockMessage(
  productName: string,
  available: number,
  requested: number,
): string {
  const availableText = roundQuantity(available);
  const unit = availableText === 1 ? "unit" : "units";
  return `Not enough stock for "${productName}": ${requested} requested but only ${availableText} ${unit} available. Reduce the quantity or update the product's stock first.`;
}

/* ------------------------------------------------------------------------- */
/* Authoritative draw-down                                                    */
/* ------------------------------------------------------------------------- */

/** The minimum surface of a Prisma transaction client this needs. */
export interface StockTx {
  product: {
    updateMany(args: {
      where: {
        id: string;
        businessId: string;
        stockQuantity: { gte: number };
      };
      data: { stockQuantity: { decrement: number } };
    }): Promise<{ count: number }>;
    findFirst(args: {
      where: { id: string; businessId: string };
      select: { name: true; stockQuantity: true };
    }): Promise<{ name: string; stockQuantity: unknown } | null>;
  };
}

export type StockDrawDownResult =
  | { ok: true; drawn: Array<{ productId: string; quantity: number }> }
  | {
      ok: false;
      productId: string;
      productName: string;
      available: number;
      requested: number;
      message: string;
    };

/**
 * Draw down stock for an invoice, authoritatively, inside the caller's
 * transaction.
 *
 * Why a conditional UPDATE rather than read-then-write: the `stockQuantity:
 * { gte }` guard and the `decrement` are a single atomic statement, so two
 * concurrent invoices for the last unit cannot both observe availability. A
 * plain `findFirst` + `update` would leave a window between the read and the
 * write in which both requests see stock 1 and both commit, driving stock to
 * -1. When `count === 0` the guard failed — either the product is gone or
 * someone else took the stock first — and this returns not-ok.
 *
 * The `businessId` in the WHERE clause is a tenant-isolation guard, not a
 * lookup: a product id from another business matches zero rows and is rejected
 * rather than decremented.
 *
 * IMPORTANT: this does not roll anything back. On a not-ok result the caller
 * MUST throw so the surrounding transaction aborts and the decrements already
 * applied in this loop are undone. Partial application is expected here and
 * safe only because of that.
 */
export async function drawDownInvoiceStock(
  tx: StockTx,
  businessId: string,
  lines: readonly StockLine[],
  /** productId -> the product record (or just its name), used only to describe a
   *  rejection when the product row itself cannot be read — e.g. it was deleted
   *  between normalization and the transaction. */
  fallbackNames: Readonly<
    Record<string, { name?: string | null } | string | null | undefined>
  > = {},
): Promise<StockDrawDownResult> {
  const drawn: Array<{ productId: string; quantity: number }> = [];
  for (const [productId, requested] of aggregateStockDemand(lines)) {
    const decremented = await tx.product.updateMany({
      where: { id: productId, businessId, stockQuantity: { gte: requested } },
      data: { stockQuantity: { decrement: requested } },
    });
    if (decremented.count === 0) {
      const current = await tx.product.findFirst({
        where: { id: productId, businessId },
        select: { name: true, stockQuantity: true },
      });
      const fallback = fallbackNames[productId];
      const productName =
        current?.name ??
        (typeof fallback === "string" ? fallback : fallback?.name) ??
        "a product on this invoice";
      const available = current ? Number(current.stockQuantity) : 0;
      return {
        ok: false,
        productId,
        productName,
        available,
        requested,
        message: insufficientStockMessage(productName, available, requested),
      };
    }
    drawn.push({ productId, quantity: requested });
  }
  return { ok: true, drawn };
}
