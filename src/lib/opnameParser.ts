/**
 * Pembaca daftar hasil hitung fisik (stok opname) yang ditempel dari Excel / Google Sheets,
 * dan pencocokannya ke Master Produk. Murni (tanpa database) supaya mudah dites.
 *
 * Format yang dikenali (per baris, dipisah tab / titik koma / dua spasi / koma):
 *   Nama  <tab> Motif/Koleksi <tab> Jumlah     mis. "Sage - Pink  Monogram  2"
 *   Kode  <tab> Jumlah                         mis. "12-2  5"
 *   Kode = Jumlah                              mis. "112W = 3"
 * Jumlah kosong berarti "belum dihitung" (BUKAN nol).
 */
import {
  canonicalCode,
  detectCategory,
  extractCode,
  isCodeLike,
  matchProduct,
  suggestProducts,
  buildNewProductDraft,
  type MatchableProduct,
  type ProductSuggestion,
} from './productMatching.ts';

export interface OpnameRow {
  /** Nomor baris di teks yang ditempel (mulai 1), untuk pesan kesalahan */
  line: number;
  rawName: string;
  rawCollection: string;
  /** null = jumlah dikosongkan (belum dihitung) */
  qty: number | null;
  error?: string;
}

const HEADER_NAMES = new Set(['nama', 'name', 'sku', 'kode', 'produk', 'motif']);

function cleanCell(c: string): string {
  return c.replace(/^[\s"'`]+|[\s"'`]+$/g, '').trim();
}

function splitCells(line: string): string[] {
  let cells: string[];
  if (line.includes('\t')) cells = line.split('\t');
  else if (line.includes(';')) cells = line.split(';');
  else if (/\s{2,}/.test(line.trim())) cells = line.trim().split(/\s{2,}/);
  else if (line.includes(',')) cells = line.split(',');
  else {
    // "12-2 = 5" / "BLUSH PEONY: 3" / "112W 3"
    const m = line.trim().match(/^(.*?)[\s:=]+(\d+)$/);
    cells = m ? [m[1], m[2]] : [line];
  }
  return cells.map(cleanCell);
}

function parseQty(cell: string | undefined): { qty: number | null; error?: string } {
  const c = (cell ?? '').trim();
  if (c === '' || c === '-') return { qty: null };
  if (/^\d+$/.test(c)) return { qty: parseInt(c, 10) };
  if (/^\d+[.,]0+$/.test(c)) return { qty: parseInt(c, 10) };
  return { qty: null, error: `Jumlah "${c}" tidak terbaca` };
}

export function parseOpnameText(text: string): OpnameRow[] {
  const rows: OpnameRow[] = [];
  const lines = (text || '').split(/\r?\n/);
  lines.forEach((rawLine, idx) => {
    if (!rawLine.trim()) return;
    const cells = splitCells(rawLine);
    if (cells.length === 0 || !cells[0]) return;

    // Baris judul kolom ("Nama  Motif  Sisa stok")
    const last = cells[cells.length - 1];
    if (HEADER_NAMES.has(cells[0].toLowerCase()) && !/^\d+$/.test(last)) return;

    const line = idx + 1;
    if (cells.length >= 3) {
      const q = parseQty(cells[2]);
      rows.push({ line, rawName: cells[0], rawCollection: cells[1], qty: q.qty, error: q.error });
    } else if (cells.length === 2) {
      const second = cells[1];
      if (second === '' || /^[\d.,-]+$/.test(second)) {
        const q = parseQty(second);
        rows.push({ line, rawName: cells[0], rawCollection: '', qty: q.qty, error: q.error });
      } else {
        // "Navy<tab>Monogram" (jumlah kosong dan tab di ujung ikut terpotong)
        rows.push({ line, rawName: cells[0], rawCollection: second, qty: null });
      }
    } else {
      rows.push({ line, rawName: cells[0], rawCollection: '', qty: null });
    }
  });
  return rows;
}

// --- Pencocokan ke Master -------------------------------------------------------------

/** Koleksi yang namanya di Master tidak diberi awalan koleksi ("BLUSH PEONY", "IRISH TULLIP"). */
const NO_PREFIX_COLLECTIONS = new Set(['OWN', 'FLORAL ABSTRACT', '-', '']);
/** Singkatan koleksi di daftar -> awalan di Master. */
const COLLECTION_ALIAS: Record<string, string> = { GRA: 'GRADIENT' };

function normText(s: string): string {
  return (s || '')
    .toUpperCase()
    .replace(/\s+[-–]\s+/g, ' ') // "Sage - Pink" -> "Sage Pink" ("12-2" tidak disentuh)
    .replace(/[“”"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function collectionPrefix(rawCollection: string): string {
  const c = normText(rawCollection);
  if (NO_PREFIX_COLLECTIONS.has(c)) return '';
  return COLLECTION_ALIAS[c] ?? c;
}

/** Kemungkinan SKU di Master untuk satu baris, dari yang paling spesifik. */
export function opnameCandidates(row: Pick<OpnameRow, 'rawName' | 'rawCollection'>): string[] {
  const name = normText(row.rawName);
  const prefix = collectionPrefix(row.rawCollection);
  const out: string[] = [];
  if (prefix) out.push(`${prefix} ${name}`);
  out.push(name);
  return Array.from(new Set(out.filter(Boolean)));
}

export interface OpnameMatch<P extends MatchableProduct> {
  product: P | null;
  /** Dipakai untuk menampilkan saran saat tidak ada yang cocok */
  suggestions: ProductSuggestion<P>[];
}

export function resolveOpnameRow<P extends MatchableProduct>(products: P[], row: OpnameRow): OpnameMatch<P> {
  const candidates = opnameCandidates(row);
  const pickActive = (list: P[]) => list.find((p) => p.isActive !== false) ?? list[0] ?? null;

  // 1. SKU persis (semua kemungkinan penulisan)
  for (const cand of candidates) {
    const key = canonicalCode(cand);
    const hit = pickActive(products.filter((p) => canonicalCode(p.sku) === key));
    if (hit) return { product: hit, suggestions: [] };
  }

  // 2. Kode saja tanpa koleksi (Paris Japan "12-2", "PJ-88", atau "BW83")
  const name = normText(row.rawName);
  if (!normText(row.rawCollection) && isCodeLike(extractCode(name, ''))) {
    const label = /^BW/i.test(name) ? name : `PARIS JAPAN - ${name}`;
    const m = matchProduct(products, name, label);
    if (m) return { product: m.product, suggestions: [] };
  }

  // 3. Tidak ketemu: berikan saran (hanya saran)
  const probe = candidates[0] || name;
  const category = detectCategory(row.rawName, '');
  const rawName = category === 'PARIS JAPAN' ? row.rawName : '';
  return { product: null, suggestions: suggestProducts(products, probe, rawName, 3) };
}

export interface OpnameDraft {
  sku: string;
  name: string;
  motif: string | null;
  color: string | null;
  costPrice: number;
  sellingPrice: number;
  wholesalePrice: number;
}

/** Rancangan produk baru untuk baris yang belum ada di Master, mengikuti kebiasaan Master. */
export function buildOpnameDraft(row: Pick<OpnameRow, 'rawName' | 'rawCollection'>): OpnameDraft | null {
  const name = normText(row.rawName);
  if (!name) return null;
  const prefix = collectionPrefix(row.rawCollection);

  if (prefix) {
    // Motif berkoleksi: SKU "POLKA RED", Motif "POLKA", Warna "RED" (sama seperti produk MONOGRAM)
    return {
      sku: `${prefix} ${name}`,
      name: 'BABY TRYSPAN',
      motif: prefix,
      color: name,
      costPrice: 25000,
      sellingPrice: 42000,
      wholesalePrice: 39000,
    };
  }

  const category = isCodeLike(extractCode(name, '')) && !/^BW/i.test(name) ? 'PARIS JAPAN' : 'BABY TRYSPAN';
  const draft = buildNewProductDraft(name, category === 'PARIS JAPAN' ? 'PARIS JAPAN' : 'BABY TRYSPAN');
  if (!draft) return null;
  return {
    sku: draft.sku,
    name: draft.name,
    motif: draft.motif,
    color: null,
    costPrice: draft.costPrice,
    sellingPrice: draft.sellingPrice,
    wholesalePrice: draft.wholesalePrice,
  };
}
