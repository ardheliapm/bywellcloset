/**
 * Aturan pencocokan produk yang dipakai di SEMUA tempat (stok masuk, pembagian stok ke
 * Pre-Order, pembuatan PO). Fungsi-fungsi di sini murni (tanpa database) supaya mudah dites.
 *
 * Prinsip:
 * 1. Kode dicocokkan PERSIS seperti yang ditulis, termasuk tanda "-". "12", "12-2", dan "122"
 *    adalah tiga kode yang berbeda. Akhiran seperti "-2" TIDAK dianggap roll/batch dari kode lain.
 * 2. Salah ketik dan kode yang mirip hanya menjadi SARAN (suggestProducts). Tidak pernah
 *    diterapkan otomatis; manusia yang memutuskan.
 * 3. Awalan kategori (PJ-, BT-, BS-, BW-) boleh ada atau tidak: "PJ-88" sama dengan "88".
 */

export type ProductCategory = 'PARIS JAPAN' | 'BELLA SQUARE' | 'BABY TRYSPAN';

export interface MatchableProduct {
  id: string;
  sku: string;
  name: string;
  motif?: string | null;
  isActive?: boolean;
}

export interface ProductSuggestion<P extends MatchableProduct = MatchableProduct> {
  product: P;
  /** 0..1, makin besar makin mirip */
  score: number;
  /** Penjelasan singkat dalam Bahasa Indonesia untuk ditampilkan ke pengguna */
  reason: string;
}

const IGNORED_SKUS = new Set(['SKU-IN', 'BARANG', 'PRODUK', '']);

/** Hapus pembungkus yang sering ikut tertempel dari chat: tanda kutip, bintang, titik dua di ujung. */
function trimDecoration(s: string): string {
  return s.replace(/^[\s*"'`:]+|[\s*"'`:]+$/g, '');
}

/**
 * Bentuk baku sebuah kode: huruf besar, spasi/underscore menjadi "-", tanda "-" berurutan
 * dirapikan. Tanda "-" di tengah TETAP ADA (inilah yang membedakan "12-2" dari "122").
 */
export function canonicalCode(raw: string | null | undefined): string {
  return trimDecoration(raw || '')
    .toUpperCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Hapus awalan kategori: "PJ-88" -> "88", "BW76" -> "76". Tidak menyentuh kata seperti "BTS". */
export function stripCategoryPrefix(code: string): string {
  const stripped = code.replace(/^(PJ|BT|BS|BW)(?:-|(?=\d))/i, '');
  return stripped || code;
}

/** Kunci teks untuk membandingkan nama motif: huruf dan angka saja, huruf kecil. */
export function textKey(raw: string | null | undefined): string {
  return (raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function detectCategory(name: string, sku: string): ProductCategory {
  const n = (name || '').toUpperCase();
  const s = (sku || '').toUpperCase();
  if (n.includes('PARIS') || n.includes('JEPANG') || n.includes('JAPAN') || /^PJ[-_\s]/.test(s)) {
    return 'PARIS JAPAN';
  }
  if (n.includes('BELLA') || /^BS[-_\s]/.test(s)) return 'BELLA SQUARE';
  return 'BABY TRYSPAN';
}

export function productInCategory(p: MatchableProduct, cat: ProductCategory): boolean {
  const n = p.name.toUpperCase();
  if (cat === 'PARIS JAPAN') return n.includes('PARIS') || n.includes('JEPANG') || n.includes('JAPAN');
  if (cat === 'BELLA SQUARE') return n.includes('BELLA');
  return n.includes('TRYSPAN') || (!n.includes('PARIS') && !n.includes('BELLA'));
}

const CATEGORY_LABEL_RE =
  /^(PARIS\s+JAPAN|PARIS\s+JEPANG|PARIS|JEPANG|JAPAN|BELLA\s+SQUARE|BELLA|BABY\s+TRYSPAN|TRYSPAN)\s*[-:]?\s*/i;

/** Ambil kode/motif inti dari SKU mentah, atau dari nama kalau SKU kosong. */
export function extractCode(rawSku: string, rawName: string): string {
  const sku = canonicalCode(rawSku);
  if (sku && !IGNORED_SKUS.has(sku)) {
    return stripCategoryPrefix(sku);
  }
  const name = trimDecoration(rawName || '');
  const withoutLabel = name.replace(CATEGORY_LABEL_RE, '');
  const core = withoutLabel || name;
  return stripCategoryPrefix(canonicalCode(core));
}

function hasLetter(s: string): boolean {
  return /[A-Za-z]/.test(s);
}

/** Buang label kategori di depan teks: "BABY TRYSPAN - IRISH TULIP" -> "IRISH TULIP" */
function stripCategoryLabel(text: string): string {
  return trimDecoration(text).replace(CATEGORY_LABEL_RE, '').trim();
}

/**
 * Kunci nama motif sebuah produk. Nama motif bisa tersimpan di kolom Motif, atau di kolom Nama
 * (mis. Nama "IRISH TULIP" atau "BABY TRYSPAN - IRISH TULIP" dengan Motif kosong). Dua-duanya dipakai.
 * Nama yang hanya berisi nama kategori ("BABY TRYSPAN") tidak dihitung.
 */
function labelKeys(p: MatchableProduct): string[] {
  const keys = new Set<string>();
  const fromMotif = textKey(p.motif);
  if (fromMotif) keys.add(fromMotif);
  const fromName = textKey(stripCategoryLabel(p.name));
  if (fromName) keys.add(fromName);
  return Array.from(keys);
}

function preferActive<P extends MatchableProduct>(list: P[]): P | null {
  return list.find((p) => p.isActive !== false) || list[0] || null;
}

export type MatchKind = 'sku' | 'code' | 'motif' | 'name';

export interface ProductMatch<P extends MatchableProduct = MatchableProduct> {
  product: P;
  kind: MatchKind;
}

/**
 * Cari produk yang PERSIS cocok. Mengembalikan null kalau tidak ada yang yakin cocok;
 * pemanggil boleh menampilkan suggestProducts() tetapi tidak boleh menebak sendiri.
 */
export function matchProduct<P extends MatchableProduct>(
  products: P[],
  rawSku: string,
  rawName: string,
): ProductMatch<P> | null {
  const cat = detectCategory(rawName, rawSku);

  // 1. SKU lengkap persis (di kategori mana pun), mis. "BW76" atau "12-2"
  const fullSku = canonicalCode(rawSku);
  if (fullSku && !IGNORED_SKUS.has(fullSku)) {
    const exact = products.filter((p) => canonicalCode(p.sku) === fullSku);
    const hit = preferActive(exact);
    if (hit) return { product: hit, kind: 'sku' };
  }

  const code = extractCode(rawSku, rawName);
  if (!code) return null;

  const sameCat = products.filter((p) => productInCategory(p, cat));

  // 2. Dalam kategori yang sama: kode tanpa awalan sama persis ("PJ-88" = "88", tetapi "12-2" != "122")
  const byCode = sameCat.filter((p) => stripCategoryPrefix(canonicalCode(p.sku)) === code);
  const codeHit = preferActive(byCode);
  if (codeHit) return { product: codeHit, kind: 'code' };

  // 3. Nama motif sama persis (mis. "IRISH TULIP"). Hanya untuk kode yang mengandung huruf,
  //    supaya angka seperti "12-2" tidak pernah dicocokkan lewat nama motif.
  if (hasLetter(code)) {
    const key = textKey(code);
    const byMotif = sameCat.filter((p) => labelKeys(p).includes(key));
    const motifHit = preferActive(byMotif);
    if (motifHit) return { product: motifHit, kind: 'motif' };
  }

  // 4. Nama lengkap "NAMA - MOTIF" sama persis dengan teks mentah
  const nameKey = textKey(rawName);
  if (nameKey) {
    const byName = sameCat.filter((p) => textKey(`${p.name}${p.motif || ''}`) === nameKey);
    const nameHit = preferActive(byName);
    if (nameHit) return { product: nameHit, kind: 'name' };
  }

  return null;
}

/** Jarak edit (Levenshtein) antar dua teks pendek. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** "12-2" -> { base: "12", suffix: "2" }; kode tanpa akhiran angka -> null */
function splitSuffix(code: string): { base: string; suffix: string } | null {
  const m = code.match(/^(.+?)-(\d+)$/);
  return m ? { base: m[1], suffix: m[2] } : null;
}

/**
 * Saran produk yang MIRIP untuk kode yang tidak cocok persis. Hanya untuk ditampilkan ke
 * manusia sebagai pilihan; hasilnya tidak pernah dipakai otomatis.
 */
export function suggestProducts<P extends MatchableProduct>(
  products: P[],
  rawSku: string,
  rawName: string,
  limit = 3,
): ProductSuggestion<P>[] {
  const cat = detectCategory(rawName, rawSku);
  const code = extractCode(rawSku, rawName);
  if (!code) return [];

  const pool = products.filter((p) => productInCategory(p, cat));
  const codeKey = textKey(code);
  const codeSuffix = splitSuffix(code);
  const found = new Map<string, ProductSuggestion<P>>();

  const offer = (p: P, score: number, reason: string) => {
    const existing = found.get(p.id);
    if (!existing || existing.score < score) found.set(p.id, { product: p, score, reason });
  };

  for (const p of pool) {
    const pCode = stripCategoryPrefix(canonicalCode(p.sku));
    const pKey = textKey(pCode);
    const pSuffix = splitSuffix(pCode);

    // Kode yang sama kalau tanda "-" diabaikan: "12-2" <-> "122"
    if (pCode !== code && pKey && pKey === codeKey) {
      offer(p, 0.95, `kode mirip: ${p.sku} (sama kalau tanda "-" diabaikan)`);
      continue;
    }

    // Kode dasar dan turunannya: "12" <-> "12-2"
    if (pCode !== code && ((codeSuffix && codeSuffix.base === pCode) || (pSuffix && pSuffix.base === code))) {
      offer(p, 0.9, `kode berkaitan: ${p.sku}`);
      continue;
    }

    // Nama motif yang mirip: salah ketik satu atau dua huruf (dicek ke kolom Motif dan kolom Nama)
    if (hasLetter(code)) {
      let bestScore = 0;
      for (const mKey of labelKeys(p)) {
        if (!mKey || !codeKey || mKey === codeKey) continue;
        const dist = editDistance(codeKey, mKey);
        const longest = Math.max(codeKey.length, mKey.length);
        const sim = 1 - dist / longest;
        if (longest >= 5 && dist <= 2 && sim >= 0.8) {
          bestScore = Math.max(bestScore, sim);
        } else if (
          Math.min(codeKey.length, mKey.length) >= 5 &&
          (mKey.includes(codeKey) || codeKey.includes(mKey))
        ) {
          bestScore = Math.max(bestScore, 0.75);
        }
      }
      if (bestScore > 0) {
        offer(p, bestScore, `nama motif mirip: ${p.motif || stripCategoryLabel(p.name) || p.sku}`);
        continue;
      }
    }

    // Kode angka yang selisih satu karakter (salah ketik): hanya untuk kode cukup panjang
    if (!hasLetter(code) && !hasLetter(pCode) && code.length >= 3 && pCode.length >= 3) {
      if (editDistance(code, pCode) === 1) {
        offer(p, 0.7, `kode mirip: ${p.sku}`);
      }
    }
  }

  return Array.from(found.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export interface NewProductDraft {
  sku: string;
  name: string;
  motif: string | null;
  category: ProductCategory;
  costPrice: number;
  sellingPrice: number;
  wholesalePrice: number;
}

/**
 * Rancangan produk baru untuk kode yang belum ada di Master. Mengikuti kebiasaan Master Data:
 * SKU Paris Japan adalah kode polos ("12-2"); kategori lain diberi awalan.
 */
export function buildNewProductDraft(rawSku: string, rawName: string): NewProductDraft | null {
  const cat = detectCategory(rawName, rawSku);
  const code = extractCode(rawSku, rawName);
  if (!code) return null;

  if (cat === 'PARIS JAPAN') {
    return {
      sku: code,
      name: 'PARIS JAPAN',
      motif: null,
      category: cat,
      costPrice: 20000,
      sellingPrice: 25000,
      wholesalePrice: 24000,
    };
  }
  if (cat === 'BELLA SQUARE') {
    return {
      sku: /^BS-/i.test(code) ? code : `BS-${code}`,
      name: 'BELLA SQUARE',
      motif: null,
      category: cat,
      costPrice: 20000,
      sellingPrice: 35000,
      wholesalePrice: 35000,
    };
  }
  // BABY TRYSPAN: kode seperti "152", "118W", "BW83" = SKU; teks lain (mis. "IRISH TULIP") = nama motif
  const codeLike = !hasLetter(code) || /^[A-Z]{0,2}-?\d+[A-Z]?(-\d+)?$/.test(code);
  const rawSkuKey = canonicalCode(rawSku);
  const skuFromRaw = rawSkuKey && !IGNORED_SKUS.has(rawSkuKey) ? rawSkuKey : '';
  return {
    sku: skuFromRaw || code,
    name: 'BABY TRYSPAN',
    motif: codeLike ? null : code.replace(/-/g, ' '),
    category: cat,
    costPrice: 25000,
    sellingPrice: 42000,
    wholesalePrice: 39000,
  };
}
