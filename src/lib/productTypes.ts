'use client';

export interface ProductMasterType {
  id: string;
  name: string;
  isResellerEligible: boolean;
  defaultPrice?: number;
  description?: string;
}

export const DEFAULT_PRODUCT_TYPES: ProductMasterType[] = [
  {
    id: 'type-baby-tryspan',
    name: 'BABY TRYSPAN',
    isResellerEligible: true,
    defaultPrice: 42000,
    description: 'Berlaku Diskon Reseller Bertingkat (Mix Motif)',
  },
  {
    id: 'type-paris-japan',
    name: 'PARIS JAPAN',
    isResellerEligible: false,
    defaultPrice: 85000,
    description: 'Harga Normal (Tidak Berlaku Diskon Reseller)',
  },
  {
    id: 'type-bella-square',
    name: 'BELLA SQUARE',
    isResellerEligible: false,
    defaultPrice: 35000,
    description: 'Harga Normal (Tidak Berlaku Diskon Reseller)',
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
 * Helper to check if a product name is eligible for reseller discount.
 * Checks against custom master types, defaults, and common keyword matching (e.g. BABY TRYSPAN).
 */
export function checkIsResellerEligible(
  productName: string | undefined | null,
  typesList: ProductMasterType[] = DEFAULT_PRODUCT_TYPES
): boolean {
  if (!productName) return false;
  const clean = productName.trim().toUpperCase();

  // 1. Exact match against stored types
  const matchedType = typesList.find((t) => t.name.toUpperCase() === clean);
  if (matchedType !== undefined) {
    return matchedType.isResellerEligible;
  }

  // 2. Keyword check: Contains "BABY TRYSPAN" or "TRYSPAN"
  if (clean.includes('BABY TRYSPAN') || clean.includes('TRYSPAN')) {
    return true;
  }

  // 3. Keyword check: Contains "PARIS JAPAN" or "PARIS" -> false
  if (clean.includes('PARIS JAPAN')) {
    return false;
  }

  return false;
}
