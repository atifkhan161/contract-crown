import { v4 as uuidv4 } from 'uuid';
import rxdbConnection from '../../database/rxdb-connection.js';

/**
 * Base RxDB Model Class
 * Provides common CRUD operations and reactive query methods for RxDB collections
 */
class BaseRxDBModel {
  constructor(collectionName, data = {}) {
    this.collectionName = collectionName;
    this.data = { ...data };
    this._subscriptions = new Map();
  }

  /**
   * Get the RxDB collection instance
   * @returns {RxCollection} RxDB collection
   */
  getCollection() {
    if (!rxdbConnection.isReady()) {
      throw new Error('RxDB connection not ready. Ensure database is initialized.');
    }
    return rxdbConnection.getCollection(this.collectionName);
  }

  /**
   * Create a new document in the collection
   * @param {Object} data - Document data
   * @returns {Promise<Object>} Created document
   */
  async create(data) {
    try {
      const collection = this.getCollection();
      
      // Generate UUID for primary key if not provided
      const schema = collection.schema.jsonSchema;
      const primaryKey = schema.primaryKey;
      
      if (!data[primaryKey]) {
        data[primaryKey] = uuidv4();
      }

      // Add timestamps if schema supports them
      if (schema.properties.created_at) {
        data.created_at = new Date().toISOString();
      }
      if (schema.properties.updated_at) {
        data.updated_at = new Date().toISOString();
      }

      const doc = await collection.insert(data);
      console.log(`[BaseRxDBModel] Created ${this.collectionName} document:`, doc.primary);
      
      return doc.toJSON();
    } catch (error) {
      console.error(`[BaseRxDBModel] Create error in ${this.collectionName}:`, error.message);
      throw this._handleRxDBError(error);
    }
  }

  /**
   * Find document by primary key
   * @param {string} id - Primary key value
   * @returns {Promise<Object|null>} Document or null if not found
   */
  async findById(id) {
    try {
      const collection = this.getCollection();
      const doc = await collection.findOne(id).exec();
      
      if (!doc) {
        return null;
      }

      return doc.toJSON();
    } catch (error) {
      console.error(`[BaseRxDBModel] FindById error in ${this.collectionName}:`, error.message);
      throw this._handleRxDBError(error);
    }
  }

  /**
   * Find documents by query
   * @param {Object} query - RxDB query object
   * @param {Object} options - Query options (limit, sort, etc.)
   * @returns {Promise<Array>} Array of documents
   */
  async find(query = {}, options = {}) {
    try {
      const collection = this.getCollection();
      
      // Format query for RxDB - wrap in selector if not already wrapped
      const rxdbQuery = query.selector ? query : { selector: query };
      
      let rxQuery = collection.find(rxdbQuery);

      // Apply options
      if (options.sort) {
        rxQuery = rxQuery.sort(options.sort);
      }
      if (options.limit) {
        rxQuery = rxQuery.limit(options.limit);
      }
      if (options.skip) {
        rxQuery = rxQuery.skip(options.skip);
      }

      const docs = await rxQuery.exec();
      return docs.map(doc => doc.toJSON());
    } catch (error) {
      console.error(`[BaseRxDBModel] Find error in ${this.collectionName}:`, error.message);
      throw this._handleRxDBError(error);
    }
  }

  /**
   * Find one document by query
   * @param {Object} query - RxDB query object
   * @returns {Promise<Object|null>} Document or null if not found
   */
  async findOne(query) {
    try {
      const collection = this.getCollection();
      
      // Format query for RxDB - wrap in selector if not already wrapped
      const rxdbQuery = query.selector ? query : { selector: query };
      
      const doc = await collection.findOne(rxdbQuery).exec();
      
      if (!doc) {
        return null;
      }

      return doc.toJSON();
    } catch (error) {
      console.error(`[BaseRxDBModel] FindOne error in ${this.collectionName}:`, error.message);
      throw this._handleRxDBError(error);
    }
  }

  /**
   * Update document by primary key
   * @param {string} id - Primary key value
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object|null>} Updated document or null if not found
   */
  async updateById(id, updateData) {
    try {
      const collection = this.getCollection();
      const doc = await collection.findOne(id).exec();
      
      if (!doc) {
        return null;
      }

      // Add updated timestamp if schema supports it
      const schema = collection.schema.jsonSchema;
      if (schema.properties.updated_at) {
        updateData.updated_at = new Date().toISOString();
      }

      const updatedDoc = await doc.update({
        $set: updateData
      });

      console.log(`[BaseRxDBModel] Updated ${this.collectionName} document:`, updatedDoc.primary);
      return updatedDoc.toJSON();
    } catch (error) {
      console.error(`[BaseRxDBModel] UpdateById error in ${this.collectionName}:`, error.message);
      throw this._handleRxDBError(error);
    }
  }

  /**
   * Update documents by query
   * @param {Object} query - RxDB query object
   * @param {Object} updateData - Data to update
   * @returns {Promise<Array>} Array of updated documents
   */
  async updateMany(query, updateData) {
    try {
      const collection = this.getCollection();
      
      // Format query for RxDB - wrap in selector if not already wrapped
      const rxdbQuery = query.selector ? query : { selector: query };
      
      const docs = await collection.find(rxdbQuery).exec();
      
      if (docs.length === 0) {
        return [];
      }

      // Add updated timestamp if schema supports it
      const schema = collection.schema.jsonSchema;
      if (schema.properties.updated_at) {
        updateData.updated_at = new Date().toISOString();
      }

      const updatedDocs = [];
      for (const doc of docs) {
        const updatedDoc = await doc.update({
          $set: updateData
        });
        updatedDocs.push(updatedDoc.toJSON());
      }

      console.log(`[BaseRxDBModel] Updated ${updatedDocs.length} ${this.collectionName} documents`);
      return updatedDocs;
    } catch (error) {
      console.error(`[BaseRxDBModel] UpdateMany error in ${this.collectionName}:`, error.message);
      throw this._handleRxDBError(error);
    }
  }

  /**
   * Delete document by primary key
   * @param {string} id - Primary key value
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteById(id) {
    try {
      const collection = this.getCollection();
      const doc = await collection.findOne(id).exec();
      
      if (!doc) {
        return false;
      }

      await doc.remove();
      console.log(`[BaseRxDBModel] Deleted ${this.collectionName} document:`, id);
      return true;
    } catch (error) {
      console.error(`[BaseRxDBModel] DeleteById error in ${this.collectionName}:`, error.message);
      throw this._handleRxDBError(error);
    }
  }

  /**
   * Delete documents by query
   * @param {Object} query - RxDB query object
   * @returns {Promise<number>} Number of deleted documents
   */
  async deleteMany(query) {
    try {
      const collection = this.getCollection();
      
      // Format query for RxDB - wrap in selector if not already wrapped
      const rxdbQuery = query.selector ? query : { selector: query };
      
      const docs = await collection.find(rxdbQuery).exec();
      
      let deletedCount = 0;
      for (const doc of docs) {
        await doc.remove();
        deletedCount++;
      }

      console.log(`[BaseRxDBModel] Deleted ${deletedCount} ${this.collectionName} documents`);
      return deletedCount;
    } catch (error) {
      console.error(`[BaseRxDBModel] DeleteMany error in ${this.collectionName}:`, error.message);
      throw this._handleRxDBError(error);
    }
  }

  /**
   * Count documents by query
   * @param {Object} query - RxDB query object
   * @returns {Promise<number>} Number of documents
   */
  async count(query = {}) {
    try {
      const collection = this.getCollection();
      
      // Format query for RxDB - wrap in selector if not already wrapped
      const rxdbQuery = query.selector ? query : { selector: query };
      
      const docs = await collection.find(rxdbQuery).exec();
      return docs.length;
    } catch (error) {
      console.error(`[BaseRxDBModel] Count error in ${this.collectionName}:`, error.message);
      throw this._handleRxDBError(error);
    }
  }

  /**
   * Create reactive subscription for document changes
   * @param {string} subscriptionId - Unique identifier for the subscription
   * @param {Object} query - RxDB query object
   * @param {Function} callback - Callback function for changes
   * @returns {Object} Subscription object
   */
  subscribe(subscriptionId, query, callback) {
    try {
      const collection = this.getCollection();
      
      // Unsubscribe existing subscription with same ID
      this.unsubscribe(subscriptionId);

      // Format query for RxDB - wrap in selector if not already wrapped
      const rxdbQuery = query.selector ? query : { selector: query };

      const subscription = collection.find(rxdbQuery).$.subscribe({
        next: (docs) => {
          const jsonDocs = docs.map(doc => doc.toJSON());
          callback(null, jsonDocs);
        },
        error: (error) => {
          console.error(`[BaseRxDBModel] Subscription error in ${this.collectionName}:`, error.message);
          callback(this._handleRxDBError(error), null);
        }
      });

      this._subscriptions.set(subscriptionId, subscription);
      console.log(`[BaseRxDBModel] Created subscription ${subscriptionId} for ${this.collectionName}`);
      
      return subscription;
    } catch (error) {
      console.error(`[BaseRxDBModel] Subscribe error in ${this.collectionName}:`, error.message);
      throw this._handleRxDBError(error);
    }
  }

  /**
   * Create reactive subscription for a single document
   * @param {string} subscriptionId - Unique identifier for the subscription
   * @param {string} id - Document primary key
   * @param {Function} callback - Callback function for changes
   * @returns {Object} Subscription object
   */
  subscribeById(subscriptionId, id, callback) {
    try {
      const collection = this.getCollection();
      
      // Unsubscribe existing subscription with same ID
      this.unsubscribe(subscriptionId);

      const subscription = collection.findOne(id).$.subscribe({
        next: (doc) => {
          const jsonDoc = doc ? doc.toJSON() : null;
          callback(null, jsonDoc);
        },
        error: (error) => {
          console.error(`[BaseRxDBModel] Subscription error in ${this.collectionName}:`, error.message);
          callback(this._handleRxDBError(error), null);
        }
      });

      this._subscriptions.set(subscriptionId, subscription);
      console.log(`[BaseRxDBModel] Created document subscription ${subscriptionId} for ${this.collectionName}`);
      
      return subscription;
    } catch (error) {
      console.error(`[BaseRxDBModel] SubscribeById error in ${this.collectionName}:`, error.message);
      throw this._handleRxDBError(error);
    }
  }

  /**
   * Unsubscribe from reactive query
   * @param {string} subscriptionId - Subscription identifier
   * @returns {boolean} True if unsubscribed, false if not found
   */
  unsubscribe(subscriptionId) {
    try {
      const subscription = this._subscriptions.get(subscriptionId);
      if (subscription) {
        subscription.unsubscribe();
        this._subscriptions.delete(subscriptionId);
        console.log(`[BaseRxDBModel] Unsubscribed ${subscriptionId} from ${this.collectionName}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`[BaseRxDBModel] Unsubscribe error in ${this.collectionName}:`, error.message);
      return false;
    }
  }

  /**
   * Unsubscribe from all reactive queries
   */
  unsubscribeAll() {
    try {
      for (const [subscriptionId, subscription] of this._subscriptions) {
        subscription.unsubscribe();
        console.log(`[BaseRxDBModel] Unsubscribed ${subscriptionId} from ${this.collectionName}`);
      }
      this._subscriptions.clear();
    } catch (error) {
      console.error(`[BaseRxDBModel] UnsubscribeAll error in ${this.collectionName}:`, error.message);
    }
  }

  /**
   * Implement conflict resolution strategies
   * @param {Object} localDoc - Local document version
   * @param {Object} remoteDoc - Remote document version
   * @param {string} strategy - Conflict resolution strategy
   * @returns {Object} Resolved document
   */
  resolveConflict(localDoc, remoteDoc, strategy = 'last-write-wins') {
    try {
      switch (strategy) {
        case 'last-write-wins':
          return this._lastWriteWinsStrategy(localDoc, remoteDoc);
        
        case 'merge-fields':
          return this._mergeFieldsStrategy(localDoc, remoteDoc);
        
        case 'version-based':
          return this._versionBasedStrategy(localDoc, remoteDoc);
        
        default:
          console.warn(`[BaseRxDBModel] Unknown conflict resolution strategy: ${strategy}, using last-write-wins`);
          return this._lastWriteWinsStrategy(localDoc, remoteDoc);
      }
    } catch (error) {
      console.error(`[BaseRxDBModel] Conflict resolution error in ${this.collectionName}:`, error.message);
      // Fallback to remote document in case of resolution error
      return remoteDoc;
    }
  }

  /**
   * Last-write-wins conflict resolution strategy
   * @private
   */
  _lastWriteWinsStrategy(localDoc, remoteDoc) {
    const localTime = new Date(localDoc.updated_at || localDoc.created_at);
    const remoteTime = new Date(remoteDoc.updated_at || remoteDoc.created_at);
    
    return localTime > remoteTime ? localDoc : remoteDoc;
  }

  /**
   * Merge fields conflict resolution strategy
   * @private
   */
  _mergeFieldsStrategy(localDoc, remoteDoc) {
    const merged = { ...localDoc };
    
    // Merge non-conflicting fields from remote
    for (const [key, value] of Object.entries(remoteDoc)) {
      if (key !== 'updated_at' && key !== 'version') {
        if (!localDoc.hasOwnProperty(key) || localDoc[key] === null || localDoc[key] === undefined) {
          merged[key] = value;
        }
      }
    }
    
    // Use latest timestamp
    merged.updated_at = new Date().toISOString();
    
    return merged;
  }

  /**
   * Version-based conflict resolution strategy
   * @private
   */
  _versionBasedStrategy(localDoc, remoteDoc) {
    const localVersion = localDoc.version || 1;
    const remoteVersion = remoteDoc.version || 1;
    
    if (remoteVersion > localVersion) {
      return remoteDoc;
    } else if (localVersion > remoteVersion) {
      return localDoc;
    } else {
      // Same version, use last-write-wins as fallback
      return this._lastWriteWinsStrategy(localDoc, remoteDoc);
    }
  }

  /**
   * Handle RxDB-specific errors and convert to application errors
   * @private
   */
  _handleRxDBError(error) {
    if (error.code === 'RxError') {
      switch (error.type) {
        case 'RxValidationError':
          return new Error(`Validation error: ${error.message}`);
        case 'RxSchemaError':
          return new Error(`Schema error: ${error.message}`);
        case 'RxDatabaseError':
          return new Error(`Database error: ${error.message}`);
        default:
          return new Error(`RxDB error: ${error.message}`);
      }
    }
    
    return error;
  }

  /**
   * Bulk insert documents
   * @param {Array} documents - Array of documents to insert
   * @returns {Promise<Array>} Array of created documents
   */
  async bulkInsert(documents) {
    try {
      const collection = this.getCollection();
      const schema = collection.schema.jsonSchema;
      const primaryKey = schema.primaryKey;
      
      // Prepare documents with UUIDs and timestamps
      const preparedDocs = documents.map(doc => {
        const prepared = { ...doc };
        
        if (!prepared[primaryKey]) {
          prepared[primaryKey] = uuidv4();
        }
        
        if (schema.properties.created_at && !prepared.created_at) {
          prepared.created_at = new Date().toISOString();
        }
        
        if (schema.properties.updated_at && !prepared.updated_at) {
          prepared.updated_at = new Date().toISOString();
        }
        
        return prepared;
      });

      const result = await collection.bulkInsert(preparedDocs);
      console.log(`[BaseRxDBModel] Bulk inserted ${result.success.length} ${this.collectionName} documents`);
      
      if (result.error.length > 0) {
        console.warn(`[BaseRxDBModel] ${result.error.length} documents failed to insert`);
      }
      
      return result.success.map(doc => doc.toJSON());
    } catch (error) {
      console.error(`[BaseRxDBModel] BulkInsert error in ${this.collectionName}:`, error.message);
      throw this._handleRxDBError(error);
    }
  }

  /**
   * Get collection statistics
   * @returns {Promise<Object>} Collection statistics
   */
  async getStats() {
    try {
      const collection = this.getCollection();
      const totalDocs = await this.count();
      
      return {
        collectionName: this.collectionName,
        totalDocuments: totalDocs,
        activeSubscriptions: this._subscriptions.size,
        schema: {
          version: collection.schema.version,
          primaryKey: collection.schema.primaryKey
        }
      };
    } catch (error) {
      console.error(`[BaseRxDBModel] GetStats error in ${this.collectionName}:`, error.message);
      throw this._handleRxDBError(error);
    }
  }
}

export default BaseRxDBModel;