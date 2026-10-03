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
      return parsed;
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

/**
 * Find master product type definition
 */
export function findProductMasterType(
  productName: string | undefined | null,
  typesList: ProductMasterType[] = DEFAULT_PRODUCT_TYPES
): ProductMasterType | null {
  if (!productName) return null;
  const clean = productName.trim().toUpperCase();

  // 1. Exact match
  const exact = typesList.find((t) => t.name.toUpperCase() === clean);
  if (exact) return exact;

  // 2. Partial match
  const partial = typesList.find(
    (t) => clean.includes(t.name.toUpperCase()) || t.name.toUpperCase().includes(clean)
  );
  if (partial) return partial;

  return null;
}

/**
 * Check if a product name is eligible for reseller discount
 */
export function checkIsResellerEligible(
  productName: string | undefined | null,
  typesList: ProductMasterType[] = DEFAULT_PRODUCT_TYPES
): boolean {
  const matched = findProductMasterType(productName, typesList);
  if (matched) return matched.isResellerEligible;

  if (!productName) return false;
  const clean = productName.trim().toUpperCase();
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
