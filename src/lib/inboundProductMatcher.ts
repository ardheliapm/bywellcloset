import type { Prisma, Product } from '@prisma/client';

/**
 * Shared helper to resolve which Master Data product an inbound (Surat Jalan) item belongs to.
 * Handles SKU prefix variations like "PJ-88" vs "88", motif codes, and auto-creates the product
 * in Master Data if it truly does not exist yet (so received stock is never silently dropped).
 */

const PREFIX_RE = /^(PJ|BT|BS|BW)[-_\s]*/i;
const IGNORED_SKUS = ['SKU-IN', 'BARANG', 'PRODUK', ''];

const norm = (s: string | null | undefined) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

type Category = 'PARIS JAPAN' | 'BELLA SQUARE' | 'BABY TRYSPAN';

function detectCategory(name: string, sku: string): Category {
  const n = name.toUpperCase();
  const s = sku.toUpperCase();
  if (n.includes('PARIS') || n.includes('JEPANG') || n.includes('JAPAN') || /^PJ[-_\s]/.test(s)) return 'PARIS JAPAN';
  if (n.includes('BELLA') || /^BS[-_\s]/.test(s)) return 'BELLA SQUARE';
  return 'BABY TRYSPAN';
}

function productInCategory(p: Product, cat: Category): boolean {
  const n = p.name.toUpperCase();
  if (cat === 'PARIS JAPAN') return n.includes('PARIS') || n.includes('JEPANG') || n.includes('JAPAN');
  if (cat === 'BELLA SQUARE') return n.includes('BELLA');
  return n.includes('TRYSPAN') || (!n.includes('PARIS') && !n.includes('BELLA'));
}

/** Extract the core motif/code: "PJ-88" -> "88", "PARIS JAPAN - 155" -> "155" */
function extractCode(rawSku: string, rawName: string): string {
  const sku = rawSku.trim();
  if (sku && !IGNORED_SKUS.includes(sku.toUpperCase())) {
    return sku.replace(PREFIX_RE, '').trim();
  }
  if (rawName.includes('-')) {
    return rawName.split('-').slice(1).join('-').trim();
  }
  return rawName.trim();
}

export function findInboundProductMatch(
  products: Product[],
  rawSku: string,
  rawName: string
): Product | null {
  const cat = detectCategory(rawName, rawSku);
  const code = extractCode(rawSku, rawName);
  const nSku = norm(rawSku);
  const nCode = norm(code);

  const sameCat = products.filter((p) => productInCategory(p, cat));
  const prefer = (list: Product[]) =>
    list.find((p) => p.isActive) || list[0] || null;

  // 1. Exact full SKU anywhere (e.g. "BW76")
  const exactFull = products.filter((p) => nSku && norm(p.sku) === nSku);
  if (exactFull.length) return prefer(exactFull);

  if (!nCode) return null;

  // 2. Within same category: SKU (with or without prefix) or motif equals the code
  const byCode = sameCat.filter(
    (p) =>
      norm(p.sku) === nCode ||
      norm(p.sku.replace(PREFIX_RE, '')) === nCode ||
      (p.motif && norm(p.motif) === nCode)
  );
  if (byCode.length) return prefer(byCode);

  // 3. Within same category: full name "NAME - MOTIF" equals the raw name
  const nName = norm(rawName);
  const byName = sameCat.filter((p) => nName && norm(`${p.name}${p.motif || ''}`) === nName);
  if (byName.length) return prefer(byName);

  return null;
}

export async function resolveOrCreateInboundProduct(
  tx: Prisma.TransactionClient,
  products: Product[],
  rawSku: string,
  rawName: string
): Promise<{ product: Product; created: boolean }> {
  const found = findInboundProductMatch(products, rawSku, rawName);
  if (found) {
    if (!found.isActive) {
      const reactivated = await tx.product.update({ where: { id: found.id }, data: { isActive: true } });
      return { product: reactivated, created: false };
    }
    return { product: found, created: false };
  }

  const cat = detectCategory(rawName, rawSku);
  const code = extractCode(rawSku, rawName).toUpperCase() || `${Math.floor(100 + Math.random() * 900)}`;

  // Follow existing Master Data convention: Paris Japan SKU is the plain motif number (e.g. "88")
  const candidates =
    cat === 'PARIS JAPAN'
      ? [code, `PJ-${code}`]
      : cat === 'BELLA SQUARE'
      ? [`BS-${code}`, code]
      : [rawSku.trim().toUpperCase() || code, `BW-${code}`];

  const taken = new Set(products.map((p) => p.sku.toUpperCase()));
  let sku = candidates.find((c) => c && !taken.has(c.toUpperCase())) || `${candidates[0]}-${Date.now() % 1000}`;

  const pricing =
    cat === 'PARIS JAPAN'
      ? { costPrice: 20000, sellingPrice: 25000, wholesalePrice: 24000 }
      : cat === 'BELLA SQUARE'
      ? { costPrice: 20000, sellingPrice: 35000, wholesalePrice: 35000 }
      : { costPrice: 25000, sellingPrice: 42000, wholesalePrice: 39000 };

  const created = await tx.product.create({
    data: {
      sku,
      name: cat,
      motif: null,
      color: null,
      ...pricing,
      physicalStock: 0,
      reservedStock: 0,
      isActive: true,
    },
  });
  products.push(created);
  return { product: created, created: true };
}
