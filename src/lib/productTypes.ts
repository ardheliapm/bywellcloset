'use client';

export interface ResellerTierItem {
  id: string;
  minQty: number;
  maxQty: number | null; // null jika > minQty (tanpa batas atas)
  price: number;
  label?: string;
}

export interface ProductMasterType {
  id: string;
  name: string;
  isResellerEligible: boolean;
  defaultPrice?: number;
  description?: string;
  tiers?: ResellerTierItem[];
}

export const DEFAULT_BABY_TRYSPAN_TIERS: ResellerTierItem[] = [
  { id: 't1', minQty: 0, maxQty: 5, price: 42000, label: '0 - 5 PCS (Eceran)' },
  { id: 't2', minQty: 6, maxQty: 10, price: 39000, label: '6 - 10 PCS' },
  { id: 't3', minQty: 11, maxQty: 19, price: 36000, label: '11 - 19 PCS' },
  { id: 't4', minQty: 20, maxQty: 49, price: 32500, label: '20 - 49 PCS' },
  { id: 't5', minQty: 50, maxQty: 99, price: 31000, label: '50 - 99 PCS' },
  { id: 't6', minQty: 100, maxQty: 199, price: 30000, label: '100 - 199 PCS' },
  { id: 't7', minQty: 200, maxQty: 500, price: 28500, label: '200 - 500 PCS' },
  { id: 't8', minQty: 501, maxQty: 999, price: 27500, label: '501 - 999 PCS' },
  { id: 't9', minQty: 1000, maxQty: null, price: 26000, label: '> 1000 PCS' },
];

export const DEFAULT_PRODUCT_TYPES: ProductMasterType[] = [
  {
    id: 'type-baby-tryspan',
    name: 'BABY TRYSPAN',
    isResellerEligible: true,
    defaultPrice: 42000,
    description: 'Berlaku Diskon Reseller Bertingkat (Mix Motif)',
    tiers: DEFAULT_BABY_TRYSPAN_TIERS,
  },
  {
    id: 'type-paris-japan',
    name: 'PARIS JAPAN',
    isResellerEligible: false,
    defaultPrice: 85000,
    description: 'Harga Normal (Atau bisa diatur tier khusus)',
    tiers: [
      { id: 'pj-1', minQty: 50, maxQty: null, price: 24000, label: '>= 50 PCS' },
    ],
  },
  {
    id: 'type-bella-square',
    name: 'BELLA SQUARE',
    isResellerEligible: false,
    defaultPrice: 35000,
    description: 'Harga Normal',
    tiers: [],
  },
];

const STORAGE_KEY = 'bywell_product_types';
export const PRODUCT_TYPES_UPDATED_EVENT = 'bywell_product_types_updated';

/**
 * Get product master types from localStorage or fallback to default
 */
export function getStoredProductTypes(): ProductMasterType[] {
  if (typeof window === 'undefined') {
    return DEFAULT_PRODUCT_TYPES;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PRODUCT_TYPES));
      return DEFAULT_PRODUCT_TYPES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Merge with default rules to ensure PARIS JAPAN and BELLA are not accidentally marked as reseller-eligible
      return parsed.map((p) => {
        const isParis = p.id === 'type-paris-japan' || p.name?.toUpperCase().includes('PARIS') || p.name?.toUpperCase().includes('JEPANG');
        const isBella = p.id === 'type-bella-square' || p.name?.toUpperCase().includes('BELLA');
        const isBaby = p.id === 'type-baby-tryspan' || p.name?.toUpperCase().includes('TRYSPAN') || p.name?.toUpperCase().includes('BABY');

        let eligible = false;
        if (isBaby) eligible = true;
        else if (isParis || isBella) eligible = false;
        else eligible = Boolean(p.isResellerEligible);

        let defaultPrice = Number(p.defaultPrice);
        if (!defaultPrice || isNaN(defaultPrice)) {
          if (isParis) defaultPrice = 85000;
          else if (isBella) defaultPrice = 35000;
          else defaultPrice = 42000;
        }

        const defaultObj = DEFAULT_PRODUCT_TYPES.find((d) => d.id === p.id);
        const tiers = Array.isArray(p.tiers) && p.tiers.length > 0 ? p.tiers : defaultObj?.tiers || [];

        return {
          ...p,
          isResellerEligible: eligible,
          defaultPrice,
          tiers,
        };
      });
    }
    return DEFAULT_PRODUCT_TYPES;
  } catch (e) {
    console.error('Error loading product types:', e);
    return DEFAULT_PRODUCT_TYPES;
  }
}

/**
 * Save product master types to localStorage and dispatch update event
 */
export function saveStoredProductTypes(types: ProductMasterType[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(types));
    window.dispatchEvent(new Event(PRODUCT_TYPES_UPDATED_EVENT));
  } catch (e) {
    console.error('Error saving product types:', e);
  }
}

export const PRODUCT_TYPE_ALIASES: Record<string, string[]> = {
  'type-baby-tryspan': ['BABY TRYSPAN', 'TRYSPAN', 'BABYTRYSPAN', 'BT', 'TRY SPAN', 'BABY-TRYSPAN'],
  'type-paris-japan': ['PARIS JAPAN', 'PARIS JEPANG', 'PARIS JPN', 'PARIS', 'PJ', 'PARIS-JAPAN', 'PARIS-JEPANG'],
  'type-bella-square': ['BELLA SQUARE', 'BELLA', 'BELLASQUARE', 'BS', 'BELLA-SQUARE'],
};

/**
 * Find master product type definition with aliases and smart keyword matching
 */
export function findProductMasterType(
  productName: string | undefined | null,
  typesList: ProductMasterType[] = DEFAULT_PRODUCT_TYPES
): ProductMasterType | null {
  if (!productName) return null;
  const clean = productName.trim().toUpperCase().replace(/[\*\[\]\(\)\:\-]/g, ' ').trim();
  const tokens = clean.split(/\s+/).filter(Boolean);

  // 1. Exact or alias match
  for (const t of typesList) {
    if (t.name.toUpperCase() === clean) return t;

    const aliases = PRODUCT_TYPE_ALIASES[t.id] || [];
    if (aliases.some((al) => al === clean)) return t;
  }

  // 2. Explicit keywords check
  if (clean.includes('PARIS') || clean.includes('JEPANG') || clean.includes('JAPAN') || clean.startsWith('PJ ') || clean === 'PJ') {
    const pj = typesList.find((t) => t.id === 'type-paris-japan' || t.name.toUpperCase().includes('PARIS'));
    if (pj) return pj;
  }

  if (clean.includes('TRYSPAN') || clean.includes('BABY TRYSPAN') || clean.startsWith('BT ') || clean === 'BT') {
    const bt = typesList.find((t) => t.id === 'type-baby-tryspan' || t.name.toUpperCase().includes('TRYSPAN'));
    if (bt) return bt;
  }

  if (clean.includes('BELLA')) {
    const bs = typesList.find((t) => t.id === 'type-bella-square' || t.name.toUpperCase().includes('BELLA'));
    if (bs) return bs;
  }

  // 3. Token / prefix / partial matches
  for (const t of typesList) {
    const aliases = [t.name.toUpperCase(), ...(PRODUCT_TYPE_ALIASES[t.id] || [])];
    for (const al of aliases) {
      if (clean === al || clean.startsWith(`${al} `) || clean.endsWith(` ${al}`) || clean.includes(` ${al} `)) {
        return t;
      }
      if (tokens.includes(al)) {
        return t;
      }
    }
  }

  return null;
}

/**
 * Check if a product name or category is eligible for reseller discount
 */
export function checkIsResellerEligible(
  productName: string | undefined | null,
  typesList: ProductMasterType[] = DEFAULT_PRODUCT_TYPES
): boolean {
  if (!productName) return false;
  const clean = productName.trim().toUpperCase();

  // Paris / Bella are NEVER eligible for baby tryspan reseller pool
  if (clean.includes('PARIS') || clean.includes('JEPANG') || clean.includes('JAPAN') || clean.startsWith('PJ ') || clean === 'PJ') {
    return false;
  }
  if (clean.includes('BELLA') || clean.startsWith('BS ') || clean === 'BS') {
    return false;
  }

  const matched = findProductMasterType(productName, typesList);
  if (matched) return Boolean(matched.isResellerEligible);

  if (clean.includes('BABY TRYSPAN') || clean.includes('TRYSPAN')) return true;

  return false;
}

/**
 * Calculate the unit price for a given product and its group quantity
 */
export function calculateProductPrice(
  productName: string,
  groupQty: number,
  basePrice: number,
  typesList: ProductMasterType[] = DEFAULT_PRODUCT_TYPES
): { price: number; isDiscounted: boolean; tierLabel?: string } {
  const master = findProductMasterType(productName, typesList);

  if (!master || !master.isResellerEligible || !master.tiers || master.tiers.length === 0) {
    return { price: basePrice, isDiscounted: false };
  }

  // Sort tiers descending by minQty to find the highest threshold matched
  const sortedTiers = [...master.tiers].sort((a, b) => b.minQty - a.minQty);

  for (const tier of sortedTiers) {
    const isMinMatched = groupQty >= tier.minQty;
    const isMaxMatched = tier.maxQty === null || tier.maxQty === undefined || groupQty <= tier.maxQty;

    if (isMinMatched && isMaxMatched) {
      const isDiscounted = tier.price < basePrice;
      const label = tier.label || (tier.maxQty ? `${tier.minQty} - ${tier.maxQty} PCS` : `>= ${tier.minQty} PCS`);
      return { price: tier.price, isDiscounted, tierLabel: label };
    }
  }

  // Default fallback if below the lowest tier
  return { price: basePrice, isDiscounted: false };
}
