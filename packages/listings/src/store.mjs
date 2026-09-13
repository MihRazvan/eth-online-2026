import {DatabaseSync} from 'node:sqlite';
import {validateScope} from './shared.mjs';

/** Single persistent local writer. A production service must mount durable storage. */
export class ListingStore {
  constructor(path,scope,{maxListings=10000,maxUnpublishedCancellations=10000,maxSellerListings=100}={}) {
    validateScope(scope);
    for(const limit of [maxListings,maxUnpublishedCancellations,maxSellerListings])if(!Number.isSafeInteger(limit)||limit<1)throw new Error('INVALID_STORE_LIMIT');
    this.limits={maxListings,maxUnpublishedCancellations,maxSellerListings};
    this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=2000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS scope (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS listings (id TEXT PRIMARY KEY, seller TEXT NOT NULL, nonce TEXT NOT NULL, token TEXT NOT NULL, payload TEXT NOT NULL, created INTEGER NOT NULL, UNIQUE(seller,nonce));
      CREATE INDEX IF NOT EXISTS listings_seller ON listings(seller,id);
      CREATE INDEX IF NOT EXISTS listings_token ON listings(token,id);
      CREATE TABLE IF NOT EXISTS cancellations (id TEXT NOT NULL, seller TEXT NOT NULL, payload TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(id,seller));`);
    const value=JSON.stringify([scope.chainId,...['feeStrip','positionManager','usdc'].map(k=>scope[k].toLowerCase())]);
    this.db.prepare('INSERT OR IGNORE INTO scope VALUES (1,?)').run(value);
    if(this.db.prepare('SELECT value FROM scope WHERE id=1').get().value!==value){this.db.close();throw new Error('STORE_SCOPE_MISMATCH');}
  }
  publish(listing) {
    const id=listing.listingId.toLowerCase(),seller=listing.terms.seller.toLowerCase();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if(this.cancelled(id,seller))throw new Error('LISTING_CANCELLED');
      const existing=this.get(id);
      if(!existing){
        if(this.db.prepare('SELECT id FROM listings WHERE seller=? AND nonce=?').get(seller,listing.terms.nonce.toLowerCase()))throw new Error('NONCE_ALREADY_USED');
        if(this.db.prepare('SELECT count(*) AS n FROM listings').get().n>=this.limits.maxListings||this.db.prepare('SELECT count(*) AS n FROM listings WHERE seller=?').get(seller).n>=this.limits.maxSellerListings)throw new Error('LISTING_CAPACITY_REACHED');
        this.db.prepare('INSERT INTO listings VALUES (?,?,?,?,?,?)').run(id,seller,listing.terms.nonce.toLowerCase(),listing.terms.tokenId,JSON.stringify(listing),Date.now());
      }
      this.db.exec('COMMIT');return existing??listing;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  cancel(value) {
    // Seller key prevents unrelated signers from poisoning an unpublished listing ID.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if(!this.cancelled(value.listingId,value.seller)&&!this.get(value.listingId)&&this.db.prepare('SELECT count(*) AS n FROM cancellations c WHERE NOT EXISTS (SELECT 1 FROM listings l WHERE l.id=c.id AND l.seller=c.seller)').get().n>=this.limits.maxUnpublishedCancellations)throw new Error('LISTING_CAPACITY_REACHED');
      this.db.prepare('INSERT OR IGNORE INTO cancellations VALUES (?,?,?,?)').run(value.listingId.toLowerCase(),value.seller.toLowerCase(),JSON.stringify(value),Date.now());
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  cancelled(id,seller) {return !!this.db.prepare('SELECT id FROM cancellations WHERE id=? AND seller=?').get(id.toLowerCase(),seller.toLowerCase());}
  get(id) {const row=this.db.prepare('SELECT payload FROM listings WHERE id=?').get(id.toLowerCase());return row?JSON.parse(row.payload):null;}
  list({cursor='',limit=10,seller,tokenId}={}) {
    const where=['id>?'],args=[cursor.toLowerCase()];
    if(seller){where.push('seller=?');args.push(seller.toLowerCase());}
    if(tokenId){where.push('token=?');args.push(tokenId);}
    return this.db.prepare(`SELECT id,payload FROM listings WHERE ${where.join(' AND ')} ORDER BY id LIMIT ?`).all(...args,limit+1).map(row=>JSON.parse(row.payload));
  }
  close(){this.db.close();}
}
