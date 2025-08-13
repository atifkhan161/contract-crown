import { v4 as uuidv4 } from 'uuid';
import lokiConnection from '../../database/loki-db.js';

/**
 * Base LokiJS Model Class
 * Provides common CRUD operations for LokiJS collections
 */
class BaseLokiModel {
    constructor(collectionName, data = {}) {
        this.collectionName = collectionName;
        this.data = { ...data };
        this._subscriptions = new Map();
    }

    /**
     * Get the LokiJS collection instance
     */
    getCollection() {
        if (!lokiConnection.isReady()) {
            throw new Error('LokiJS connection not ready. Ensure database is initialized.');
        }
        return lokiConnection.getCollection(this.collectionName);
    }

    /**
     * Create a new document in the collection
     */
    async create(data) {
        try {
            const collection = this.getCollection();
            
            // Add timestamps
            const now = new Date().toISOString();
            if (!data.created_at) data.created_at = now;
            if (!data.updated_at) data.updated_at = now;

            const doc = collection.insert(data);
            console.log(`[BaseLokiModel] Created ${this.collectionName} document:`, doc.$loki);
            
            return this._cleanDocument(doc);
        } catch (error) {
            console.error(`[BaseLokiModel] Create error in ${this.collectionName}:`, error.message);
            throw error;
        }
    }

    /**
     * Find document by primary key
     */
    async findById(id) {
        try {
            const collection = this.getCollection();
            const primaryKey = this._getPrimaryKey();
            const doc = collection.findOne({ [primaryKey]: id });
            
            return doc ? this._cleanDocument(doc) : null;
        } catch (error) {
            console.error(`[BaseLokiModel] FindById error in ${this.collectionName}:`, error.message);
            throw error;
        }
    }

    /**
     * Find documents by query
     */
    async find(query = {}, options = {}) {
        try {
            const collection = this.getCollection();
            let docs = collection.find(query);

            // Apply sorting
            if (options.sort) {
                const sortField = Object.keys(options.sort)[0];
                const sortOrder = options.sort[sortField] === -1 ? true : false;
                docs = collection.chain().find(query).simplesort(sortField, sortOrder).data();
            }

            // Apply limit and skip
            if (options.skip) {
                docs = docs.slice(options.skip);
            }
            if (options.limit) {
                docs = docs.slice(0, options.limit);
            }

            return docs.map(doc => this._cleanDocument(doc));
        } catch (error) {
            console.error(`[BaseLokiModel] Find error in ${this.collectionName}:`, error.message);
            throw error;
        }
    }

    /**
     * Find one document by query
     */
    async findOne(query) {
        try {
            const collection = this.getCollection();
            const doc = collection.findOne(query);
            
            return doc ? this._cleanDocument(doc) : null;
        } catch (error) {
            console.error(`[BaseLokiModel] FindOne error in ${this.collectionName}:`, error.message);
            throw error;
        }
    }

    /**
     * Update document by primary key
     */
    async updateById(id, updateData) {
        try {
            const collection = this.getCollection();
            const primaryKey = this._getPrimaryKey();
            const doc = collection.findOne({ [primaryKey]: id });
            
            if (!doc) {
                return null;
            }

            // Add updated timestamp
            updateData.updated_at = new Date().toISOString();

            // Update document
            Object.assign(doc, updateData);
            collection.update(doc);

            console.log(`[BaseLokiModel] Updated ${this.collectionName} document:`, id);
            return this._cleanDocument(doc);
        } catch (error) {
            console.error(`[BaseLokiModel] UpdateById error in ${this.collectionName}:`, error.message);
            throw error;
        }
    }

    /**
     * Update documents by query
     */
    async updateMany(query, updateData) {
        try {
            const collection = this.getCollection();
            const docs = collection.find(query);
            
            if (docs.length === 0) {
                return [];
            }

            // Add updated timestamp
            updateData.updated_at = new Date().toISOString();

            const updatedDocs = [];
            for (const doc of docs) {
                Object.assign(doc, updateData);
                collection.update(doc);
                updatedDocs.push(this._cleanDocument(doc));
            }

            console.log(`[BaseLokiModel] Updated ${updatedDocs.length} ${this.collectionName} documents`);
            return updatedDocs;
        } catch (error) {
            console.error(`[BaseLokiModel] UpdateMany error in ${this.collectionName}:`, error.message);
            throw error;
        }
    }

    /**
     * Delete document by primary key
     */
    async deleteById(id) {
        try {
            const collection = this.getCollection();
            const primaryKey = this._getPrimaryKey();
            const doc = collection.findOne({ [primaryKey]: id });
            
            if (!doc) {
                return false;
            }

            collection.remove(doc);
            console.log(`[BaseLokiModel] Deleted ${this.collectionName} document:`, id);
            return true;
        } catch (error) {
            console.error(`[BaseLokiModel] DeleteById error in ${this.collectionName}:`, error.message);
            throw error;
        }
    }

    /**
     * Delete documents by query
     */
    async deleteMany(query) {
        try {
            const collection = this.getCollection();
            const docs = collection.find(query);
            
            let deletedCount = 0;
            for (const doc of docs) {
                collection.remove(doc);
                deletedCount++;
            }

            console.log(`[BaseLokiModel] Deleted ${deletedCount} ${this.collectionName} documents`);
            return deletedCount;
        } catch (error) {
            console.error(`[BaseLokiModel] DeleteMany error in ${this.collectionName}:`, error.message);
            throw error;
        }
    }

    /**
     * Count documents by query
     */
    async count(query = {}) {
        try {
            const collection = this.getCollection();
            return collection.count(query);
        } catch (error) {
            console.error(`[BaseLokiModel] Count error in ${this.collectionName}:`, error.message);
            throw error;
        }
    }

    /**
     * Bulk insert documents
     */
    async bulkInsert(documents) {
        try {
            const collection = this.getCollection();
            const now = new Date().toISOString();
            
            // Prepare documents with timestamps
            const preparedDocs = documents.map(doc => ({
                ...doc,
                created_at: doc.created_at || now,
                updated_at: doc.updated_at || now
            }));

            const insertedDocs = collection.insert(preparedDocs);
            console.log(`[BaseLokiModel] Bulk inserted ${insertedDocs.length} ${this.collectionName} documents`);
            
            return insertedDocs.map(doc => this._cleanDocument(doc));
        } catch (error) {
            console.error(`[BaseLokiModel] BulkInsert error in ${this.collectionName}:`, error.message);
            throw error;
        }
    }

    /**
     * Simple subscription simulation (not reactive like LokiJS)
     * For compatibility with existing code
     */
    subscribe(subscriptionId, query, callback) {
        console.log(`[BaseLokiModel] Subscription ${subscriptionId} created for ${this.collectionName} (non-reactive)`);
        
        // Immediately call with current data
        this.find(query).then(docs => {
            callback(null, docs);
        }).catch(error => {
            callback(error, null);
        });

        // Store subscription for cleanup
        this._subscriptions.set(subscriptionId, { query, callback });
        
        return { unsubscribe: () => this.unsubscribe(subscriptionId) };
    }

    /**
     * Simple document subscription simulation
     */
    subscribeById(subscriptionId, id, callback) {
        console.log(`[BaseLokiModel] Document subscription ${subscriptionId} created for ${this.collectionName} (non-reactive)`);
        
        // Immediately call with current data
        this.findById(id).then(doc => {
            callback(null, doc);
        }).catch(error => {
            callback(error, null);
        });

        // Store subscription for cleanup
        this._subscriptions.set(subscriptionId, { id, callback });
        
        return { unsubscribe: () => this.unsubscribe(subscriptionId) };
    }

    /**
     * Unsubscribe from query
     */
    unsubscribe(subscriptionId) {
        const removed = this._subscriptions.delete(subscriptionId);
        if (removed) {
            console.log(`[BaseLokiModel] Unsubscribed ${subscriptionId} from ${this.collectionName}`);
        }
        return removed;
    }

    /**
     * Unsubscribe from all queries
     */
    unsubscribeAll() {
        this._subscriptions.clear();
        console.log(`[BaseLokiModel] Unsubscribed all from ${this.collectionName}`);
    }

    /**
     * Get collection statistics
     */
    async getStats() {
        try {
            const collection = this.getCollection();
            const totalDocs = await this.count();
            
            return {
                collectionName: this.collectionName,
                totalDocuments: totalDocs,
                activeSubscriptions: this._subscriptions.size
            };
        } catch (error) {
            console.error(`[BaseLokiModel] GetStats error in ${this.collectionName}:`, error.message);
            throw error;
        }
    }

    /**
     * Get primary key field name based on collection
     */
    _getPrimaryKey() {
        const primaryKeys = {
            users: 'user_id',
            games: 'game_id',
            teams: 'team_id',
            gamePlayers: 'game_player_id',
            gameRounds: 'round_id',
            gameTricks: 'trick_id',
            rooms: 'room_id',
            roomPlayers: 'id',
            userSessions: 'session_id'
        };
        
        return primaryKeys[this.collectionName] || 'id';
    }

    /**
     * Clean LokiJS internal fields from document
     */
    _cleanDocument(doc) {
        if (!doc) return null;
        
        const cleaned = { ...doc };
        delete cleaned.$loki;
        delete cleaned.meta;
        
        return cleaned;
    }
}

export default BaseLokiModel;
