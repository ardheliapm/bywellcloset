export interface ParsedOrderItem {
  productId?: string;
  productSku: string;
  productName: string;
  price: number;
  quantity: number;
  subtotal: number;
  isMatched: boolean;
  rawText: string;
}

export interface ParseOrderResult {
  customerName: string;
  items: ParsedOrderItem[];
  totalQty: number;
  totalAmount: number;
  unmatchedCount: number;
  formattedReply: string;
}

export const DEFAULT_RESELLER_TIERS = [
  { minQty: 0, maxQty: 5, price: 42000, label: 'Eceran (0-5 PCS)' },
  { minQty: 6, maxQty: 10, price: 39000, label: 'Tier 6-10 PCS' },
  { minQty: 11, maxQty: 19, price: 36000, label: 'Tier 11-19 PCS' },
  { minQty: 20, maxQty: 49, price: 32500, label: 'Tier 20-49 PCS' },
  { minQty: 50, maxQty: 99, price: 31000, label: 'Tier 50-99 PCS' },
  { minQty: 100, maxQty: 199, price: 30000, label: 'Tier 100-199 PCS' },
  { minQty: 200, maxQty: 500, price: 28500, label: 'Tier 200-500 PCS' },
  { minQty: 501, maxQty: 999, price: 27500, label: 'Tier 501-999 PCS' },
  { minQty: 1000, maxQty: null, price: 26000, label: 'Tier >1000 PCS' },
];

export function getResellerUnitPrice(totalQty: number): number {
  const tier = DEFAULT_RESELLER_TIERS.find((t) => {
    if (t.maxQty === null) return totalQty >= t.minQty;
    return totalQty >= t.minQty && totalQty <= t.maxQty;
  });
  return tier ? tier.price : 42000;
}

interface ProductMatchable {
  id: string;
  sku: string;
  name: string;
  motif?: string | null;
  color?: string | null;
  sellingPrice: number;
  wholesalePrice?: number | null;
}

export function findBestProductMatch<T extends ProductMatchable>(query: string, products: T[]): T | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;

  // 1. Exact SKU match
  const exactSku = products.find((p) => p.sku.toLowerCase() === q);
  if (exactSku) return exactSku;

  // 2. Exact Name match
  const exactName = products.find((p) => p.name.toLowerCase() === q);
  if (exactName) return exactName;

  // 3. Exact Motif match
  const exactMotif = products.find((p) => p.motif && p.motif.toLowerCase() === q);
  if (exactMotif) return exactMotif;

  // 4. Partial substring in SKU
  const partSku = products.find((p) => p.sku.toLowerCase().includes(q) || q.includes(p.sku.toLowerCase()));
  if (partSku) return partSku;

  // 5. Partial substring in Name
  const partName = products.find((p) => p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase()));
  if (partName) return partName;

  // 6. Partial substring in Motif
  const partMotif = products.find((p) => p.motif && (p.motif.toLowerCase().includes(q) || q.includes(p.motif.toLowerCase())));
  if (partMotif) return partMotif;

  return null;
}

export function parseWhatsAppOrderText<T extends ProductMatchable>(rawText: string, products: T[]): ParseOrderResult {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      customerName: 'Customer Tanpa Nama',
      items: [],
      totalQty: 0,
      totalAmount: 0,
      unmatchedCount: 0,
      formattedReply: 'Teks order kosong atau tidak valid.',
    };
  }

  // Line 1: Customer Name
  const rawCustomer = lines[0].replace(/^[\*\"\'\:\-]+|[\*\"\'\:\-]+$/g, '').trim();
  const customerName = rawCustomer || 'Customer Tanpa Nama';

  // Remaining lines: Order Items
  const itemLines = lines.slice(1);
  let totalQty = 0;

  const rawItems: { rawText: string; matched: T | null; productName: string; qty: number }[] = [];

  itemLines.forEach((line) => {
    let itemName = line;
    let qty = 1;

    const p1 = line.match(/^(.*?)\((\d+)\)\s*$/);
    const p2 = line.match(/^(.*?)\s*[-xX:]\s*(\d+)\s*$/);
    const p3 = line.match(/^(.*?)\s+(\d+)\s*(?:pcs|pc|buah|bj)?$/i);

    if (p1) {
      itemName = p1[1].trim();
      qty = parseInt(p1[2], 10) || 1;
    } else if (p2) {
      itemName = p2[1].trim();
      qty = parseInt(p2[2], 10) || 1;
    } else if (p3) {
      itemName = p3[1].trim();
      qty = parseInt(p3[2], 10) || 1;
    }

    itemName = itemName.replace(/^[\*\"\'\:\-]+|[\*\"\'\:\-]+$/g, '').trim();
    const matched = findBestProductMatch(itemName, products);

    totalQty += qty;

    rawItems.push({
      rawText: line,
      matched,
      productName: matched ? matched.name : itemName,
      qty,
    });
  });

  const unitPrice = getResellerUnitPrice(totalQty);
  let totalAmount = 0;
  let unmatchedCount = 0;

  const items: ParsedOrderItem[] = rawItems.map((r) => {
    const isMatched = !!r.matched;
    if (!isMatched) unmatchedCount++;

    const price = unitPrice;
    const subtotal = price * r.qty;
    totalAmount += subtotal;

    return {
      productId: r.matched ? r.matched.id : undefined,
      productSku: r.matched ? r.matched.sku : r.productName.toUpperCase().replace(/\s+/g, '-'),
      productName: r.productName,
      price,
      quantity: r.qty,
      subtotal,
      isMatched,
      rawText: r.rawText,
    };
  });

  // Build Formatted WhatsApp Reply
  const itemLinesFormatted = items
    .map(
      (item) =>
        `• ${item.productName} x${item.quantity} = Rp ${item.subtotal.toLocaleString('id-ID')}`
    )
    .join('\n');

  const formattedReply = `✅ *ORDER BERHASIL DISIMPAN (STATUS: HOLD)*\n-----------------------------------\n👤 *Pelanggan*: ${customerName}\n📦 *Total Qty*: ${totalQty} pcs (Harga Tier: Rp ${unitPrice.toLocaleString('id-ID')}/pcs)\n\n*Rincian Barang*:\n${itemLinesFormatted}\n-----------------------------------\n💰 *TOTAL TAGIHAN*: Rp ${totalAmount.toLocaleString('id-ID')}\n\n*Status Stok*: Berhasil dikunci (reservedStock). Mohon segera lakukan verifikasi pembayaran.`;

  return {
    customerName,
    items,
    totalQty,
    totalAmount,
    unmatchedCount,
    formattedReply,
  };
}
