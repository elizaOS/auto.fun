// Add at top of file
export class MetadataCache {
    private cache: Map<string, any>;
    private maxSize: number;
    private accessOrder: string[];
  
    constructor(maxSize = 1000) {
      this.cache = new Map();
      this.maxSize = maxSize;
      this.accessOrder = [];
    }
  
    get(key: string) {
      if (!this.cache.has(key)) return null;
      
      // Update access order
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      this.accessOrder.push(key);
      
      return this.cache.get(key);
    }
  
    set(key: string, value: any) {
      if (this.accessOrder.length >= this.maxSize) {
        // Remove least recently used
        const lru = this.accessOrder.shift();
        if (lru) this.cache.delete(lru);
      }
      
      this.cache.set(key, value);
      this.accessOrder.push(key);
    }
  }
  
  export const metadataCache = new MetadataCache(1000); // Cache last 1000 tokens