/**
 * Pembaca teks daftar barang (copas chat / surat jalan) untuk layar Stok Masuk.
 * Fungsi murni supaya bisa dites.
 *
 * Perbaikan penting dibanding versi lama: tanda "-" di dalam kode ("12-2", "37-1") TIDAK
 * lagi dianggap nomor urut maupun pemisah jumlah. Versi lama membaca "paris japan 12-2" sebagai
 * kode "12" dengan jumlah 2, dan "12-2(50)" sebagai kode "2".
 */

export interface ParsedInboundLine {
  /** Teks barang apa adanya setelah dibersihkan, mis. "paris japan 12-2" */
  name: string;
  qty: number;
  /** false kalau jumlah tidak tertulis di baris itu dan dipakai nilai bawaan 1 */
  qtyGiven: boolean;
  /** Baris asli, untuk ditampilkan kalau perlu */
  raw: string;
}

export interface ParsedInboundText {
  invoiceNumber: string | null;
  supplierName: string | null;
  items: ParsedInboundLine[];
}

const UNIT = '(?:pcs|pc|buah|bj|lembar)?';

function stripEdges(s: string): string {
  return s.replace(/^[*"'`:\-\s]+|[*"'`:\-\s]+$/g, '').trim();
}

/** Buang nomor urut ("1. ", "2) ") dan penanda butir ("• ", "- ", "* ") di awal baris. */
function stripListMarker(line: string): string {
  return line
    .replace(/^\d+[.)]\s+/, '') // "1. 12-2(50)" -> "12-2(50)"; "12-2" tidak tersentuh
    .replace(/^[*•>"]+\s*/, '') // butir/kutip tanpa spasi wajib
    .replace(/^-\s+/, '') // butir strip HARUS diikuti spasi ("- 12-2"), bukan bagian dari kode
    .replace(/\s*[*"]+$/, '')
    .trim();
}

export function parseInboundLine(line: string): ParsedInboundLine | null {
  const raw = line;
  const cleanLine = stripListMarker(line.trim());
  if (!cleanLine) return null;

  let name = cleanLine;
  let qty = 1;
  let qtyGiven = false;

  // 1. nama(jumlah) -> "12-2(50)", "SPARK FLOWER (40)"
  const p1 = cleanLine.match(/^(.+?)\s*\((\d+)\)\s*$/);
  // 2. nama <pemisah> jumlah. Pemisah: ":" "=" tab, " x ", "12x50", atau " - " DENGAN spasi di kiri.
  //    Tanda "-" yang menempel di kode ("12-2") bukan pemisah.
  const p2 = cleanLine.match(
    new RegExp(`^(.+?)(?:\\s*[:=\\t]|\\s+[xX]\\s*|(?<=\\d)[xX]\\s*|\\s+-\\s*)\\s*(\\d+)\\s*${UNIT}$`, 'i'),
  );
  // 3. nama jumlah -> "152 50", "SPARK FLOWER 40 pcs", "paris japan 12-2 50"
  const p3 = cleanLine.match(new RegExp(`^(.+?)\\s+(\\d+)\\s*${UNIT}$`, 'i'));

  const hit = p1 || p2 || p3;
  if (hit) {
    name = hit[1].trim();
    qty = parseInt(hit[2], 10) || 1;
    qtyGiven = true;
  }

  name = stripEdges(name);
  if (!name) return null;
  if (/^(total|jumlah|grand total|subtotal|page|halaman|tanggal|no|invoice)\b/i.test(name)) return null;

  return { name, qty, qtyGiven, raw };
}

const QTY_HINT = /\(\d+\)|\s+[:=x]\s*\d+|\s+-\s*\d+|\s+\d+\s*(?:pcs|pc)?$/i;

export function parseInboundText(text: string): ParsedInboundText {
  const result: ParsedInboundText = { invoiceNumber: null, supplierName: null, items: [] };
  if (!text || !text.trim()) return result;

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return result;

  let start = 0;

  // Baris pertama = nomor surat jalan HANYA kalau diawali SJ atau INV dan tidak berisi jumlah.
  // (Versi lama menganggap baris apa pun yang mengandung "-" sebagai nomor invoice.)
  const first = stripEdges(lines[0]);
  if (/^(SJ|INV)/i.test(first) && first.length >= 4 && !/\(\d+\)/.test(first)) {
    result.invoiceNumber = first;
    start = 1;
  }

  // Baris berikutnya tanpa angka sama sekali = nama pemasok
  const next = lines[start];
  if (next && !/\d/.test(next) && !QTY_HINT.test(next)) {
    const supplier = stripEdges(next);
    if (supplier.length > 2) {
      result.supplierName = supplier;
      start += 1;
    }
  }

  for (const line of lines.slice(start)) {
    const parsed = parseInboundLine(line);
    if (parsed) result.items.push(parsed);
  }
  return result;
}
