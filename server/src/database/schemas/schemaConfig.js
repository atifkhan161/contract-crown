/**
 * RxDB Schema Configuration
 * Combines schemas with validation hooks and migration strategies
 */

import { allSchemas } from './index.js';
import { schemaValidators } from './schemaValidation.js';

/**
 * Pre-insert hook factory
 * @param {Function} validator - Validation function
 * @returns {Function} - RxDB pre-insert hook
 */
function createPreInsertHook(validator) {
  return function(docData) {
    try {
      return validator(docData);
    } catch (error) {
      console.error('[RxDB] Pre-insert validation failed:', error.message);
      throw error;
    }
  };
}

/**
 * Pre-save hook factory
 * @param {Function} validator - Validation function
 * @returns {Function} - RxDB pre-save hook
 */
function createPreSaveHook(validator) {
  return function(docData) {
    try {
      return validator(docData);
    } catch (error) {
      console.error('[RxDB] Pre-save validation failed:', error.message);
      throw error;
    }
  };
}

/**
 * Post-create hook for logging
 * @param {string} collectionName - Name of the collection
 * @returns {Function} - RxDB post-create hook
 */
function createPostCreateHook(collectionName) {
  return function(docData, doc) {
    console.log(`[RxDB] Created ${collectionName} document:`, doc.primary);
  };
}

/**
 * Post-save hook for logging
 * @param {string} collectionName - Name of the collection
 * @returns {Function} - RxDB post-save hook
 */
function createPostSaveHook(collectionName) {
  return function(docData, doc) {
    console.log(`[RxDB] Updated ${collectionName} document:`, doc.primary);
  };
}

/**
 * Pre-remove hook for logging
 * @param {string} collectionName - Name of the collection
 * @returns {Function} - RxDB pre-remove hook
 */
function createPreRemoveHook(collectionName) {
  return function(docData, doc) {
    console.log(`[RxDB] Removing ${collectionName} document:`, doc.primary);
  };
}

// Collection configurations with schemas and hooks
export const collectionConfigs = {
  users: {
    schema: allSchemas.users,
    methods: {},
    statics: {},
    hooks: {
      preInsert: createPreInsertHook(schemaValidators.validateUserDocument),
      preSave: createPreSaveHook(schemaValidators.validateUserDocument),
      postCreate: createPostCreateHook('users'),
      postSave: createPostSaveHook('users'),
      preRemove: createPreRemoveHook('users')
    },
    migrationStrategies: {
      // Future schema migrations will be defined here
      1: function(oldDoc) {
        // Example migration from version 0 to 1
        return oldDoc;
      }
    }
  },

  games: {
    schema: allSchemas.games,
    methods: {},
    statics: {},
    hooks: {
      preInsert: createPreInsertHook(schemaValidators.validateGameDocument),
      preSave: createPreSaveHook(schemaValidators.validateGameDocument),
      postCreate: createPostCreateHook('games'),
      postSave: createPostSaveHook('games'),
      preRemove: createPreRemoveHook('games')
    },
    migrationStrategies: {
      1: function(oldDoc) {
        return oldDoc;
      }
    }
  },

  teams: {
    schema: allSchemas.teams,
    methods: {},
    statics: {},
    hooks: {
      postCreate: createPostCreateHook('teams'),
      postSave: createPostSaveHook('teams'),
      preRemove: createPreRemoveHook('teams')
    },
    migrationStrategies: {
      1: function(oldDoc) {
        return oldDoc;
      }
    }
  },

  gamePlayers: {
    schema: allSchemas.gamePlayers,
    methods: {},
    statics: {},
    hooks: {
      postCreate: createPostCreateHook('gamePlayers'),
      postSave: createPostSaveHook('gamePlayers'),
      preRemove: createPreRemoveHook('gamePlayers')
    },
    migrationStrategies: {
      1: function(oldDoc) {
        return oldDoc;
      }
    }
  },

  gameRounds: {
    schema: allSchemas.gameRounds,
    methods: {},
    statics: {},
    hooks: {
      postCreate: createPostCreateHook('gameRounds'),
      postSave: createPostSaveHook('gameRounds'),
      preRemove: createPreRemoveHook('gameRounds')
    },
    migrationStrategies: {
      1: function(oldDoc) {
        return oldDoc;
      }
    }
  },

  gameTricks: {
    schema: allSchemas.gameTricks,
    methods: {},
    statics: {},
    hooks: {
      preInsert: createPreInsertHook(schemaValidators.validateGameTrickDocument),
      preSave: createPreSaveHook(schemaValidators.validateGameTrickDocument),
      postCreate: createPostCreateHook('gameTricks'),
      postSave: createPostSaveHook('gameTricks'),
      preRemove: createPreRemoveHook('gameTricks')
    },
    migrationStrategies: {
      1: function(oldDoc) {
        return oldDoc;
      }
    }
  },

  rooms: {
    schema: allSchemas.rooms,
    methods: {},
    statics: {},
    hooks: {
      preInsert: createPreInsertHook(schemaValidators.validateRoomDocument),
      preSave: createPreSaveHook(schemaValidators.validateRoomDocument),
      postCreate: createPostCreateHook('rooms'),
      postSave: createPostSaveHook('rooms'),
      preRemove: createPreRemoveHook('rooms')
    },
    migrationStrategies: {
      1: function(oldDoc) {
        return oldDoc;
      }
    }
  },

  roomPlayers: {
    schema: allSchemas.roomPlayers,
    methods: {},
    statics: {},
    hooks: {
      postCreate: createPostCreateHook('roomPlayers'),
      postSave: createPostSaveHook('roomPlayers'),
      preRemove: createPreRemoveHook('roomPlayers')
    },
    migrationStrategies: {
      1: function(oldDoc) {
        return oldDoc;
      }
    }
  },

  userSessions: {
    schema: allSchemas.userSessions,
    methods: {},
    statics: {},
    hooks: {
      preInsert: createPreInsertHook(schemaValidators.validateUserSessionDocument),
      preSave: createPreSaveHook(schemaValidators.validateUserSessionDocument),
      postCreate: createPostCreateHook('userSessions'),
      postSave: createPostSaveHook('userSessions'),
      preRemove: createPreRemoveHook('userSessions')
    },
    migrationStrategies: {
      1: function(oldDoc) {
        return oldDoc;
      }
    }
  }
};

/**
 * Get collection configuration by name
 * @param {string} collectionName - Name of the collection
 * @returns {Object} - Collection configuration
 */
export function getCollectionConfig(collectionName) {
  const config = collectionConfigs[collectionName];
  if (!config) {
    throw new Error(`Collection configuration not found for: ${collectionName}`);
  }
  return config;
}

/**
 * Get all collection names
 * @returns {Array<string>} - Array of collection names
 */
export function getCollectionNames() {
  return Object.keys(collectionConfigs);
}

/**
 * Validate collection configuration
 * @param {string} collectionName - Name of the collection
 * @returns {boolean} - True if configuration is valid
 */
export function validateCollectionConfig(collectionName) {
  try {
    const config = getCollectionConfig(collectionName);
    
    // Check required properties
    if (!config.schema) {
      throw new Error(`Schema missing for collection: ${collectionName}`);
    }

    if (!config.schema.primaryKey) {
      throw new Error(`Primary key missing for collection: ${collectionName}`);
    }

    if (!config.schema.properties) {
      throw new Error(`Properties missing for collection: ${collectionName}`);
    }

    // Validate primary key exists in properties
    if (!config.schema.properties[config.schema.primaryKey]) {
      throw new Error(`Primary key property not found in schema for collection: ${collectionName}`);
    }

    console.log(`[RxDB] Collection configuration valid for: ${collectionName}`);
    return true;
  } catch (error) {
    console.error(`[RxDB] Collection configuration invalid for ${collectionName}:`, error.message);
    return false;
  }
}

/**
 * Validate all collection configurations
 * @returns {boolean} - True if all configurations are valid
 */
export function validateAllCollectionConfigs() {
  const collectionNames = getCollectionNames();
  let allValid = true;

  for (const collectionName of collectionNames) {
    if (!validateCollectionConfig(collectionName)) {
      allValid = false;
    }
  }

  if (allValid) {
    console.log('[RxDB] All collection configurations are valid');
  } else {
    console.error('[RxDB] Some collection configurations are invalid');
  }

  return allValid;
}

export default collectionConfigs;