# Design Document

## Overview

This design outlines the migration of the Contract Crown application from MariaDB to RxDB with LokiJS storage adapter running on the Node.js server. The migration maintains the server-side database architecture while leveraging RxDB's reactive capabilities, real-time synchronization, and improved performance characteristics.

The current system uses MariaDB with a traditional connection pool approach. The new system will use RxDB with LokiJS storage on the server, providing reactive queries, built-in replication capabilities, and file-based persistence while maintaining the existing client-server architecture.

## Architecture

### Current Architecture
- **Database**: MariaDB with connection pooling
- **ORM/Query Layer**: Raw SQL queries through mysql2 driver
- **Models**: JavaScript classes with static methods for database operations
- **Real-time**: Socket.IO for WebSocket communication
- **Data Flow**: Client → Express API → Model → MariaDB

### Target Architecture
- **Database**: RxDB with LokiJS storage adapter
- **Query Layer**: RxDB reactive queries and collections
- **Models**: RxDB schemas and document-based operations
- **Real-time**: RxDB reactive subscriptions + Socket.IO
- **Data Flow**: Client → Express API → RxDB Collection → LokiJS file storage

### Migration Strategy
1. **Parallel Implementation**: Run both systems temporarily during migration
2. **Data Migration**: Export MariaDB data and import into RxDB collections
3. **Gradual Cutover**: Switch endpoints one by one from MariaDB to RxDB
4. **Rollback Capability**: Maintain ability to revert to MariaDB if needed

## Components and Interfaces

### 1. RxDB Database Setup

#### Database Configuration
```javascript
// server/src/database/rxdb-connection.js
class RxDBConnection {
  constructor() {
    this.database = null;
    this.collections = {};
  }

  async initialize() {
    // Create RxDB database with LokiJS adapter
    // Configure collections with schemas
    // Set up replication and sync
  }
}
```

#### Collection Schemas
- **Users Collection**: User accounts and authentication data
- **Games Collection**: Game instances and metadata
- **Rooms Collection**: Room/lobby management
- **Teams Collection**: Team assignments and scores
- **GamePlayers Collection**: Player-game relationships
- **GameRounds Collection**: Round-specific data
- **GameTricks Collection**: Individual trick records
- **UserSessions Collection**: JWT session management

### 2. Data Migration Layer

#### Migration Service
```javascript
// server/src/services/MigrationService.js
class MigrationService {
  async migrateFromMariaDB() {
    // Export data from MariaDB
    // Transform data to RxDB format
    // Import into RxDB collections
    // Validate data integrity
  }

  async rollbackToMariaDB() {
    // Export data from RxDB
    // Transform back to MariaDB format
    // Import into MariaDB tables
  }
}
```

### 3. Model Layer Refactoring

#### Base Model Class
```javascript
// server/src/models/BaseRxDBModel.js
class BaseRxDBModel {
  constructor(collection) {
    this.collection = collection;
  }

  async create(data) {
    // RxDB document creation
  }

  async findById(id) {
    // RxDB document query
  }

  async update(id, data) {
    // RxDB document update with conflict resolution
  }

  async delete(id) {
    // RxDB document deletion
  }

  subscribe(query) {
    // RxDB reactive subscription
  }
}
```

#### Updated Model Classes
- **User.js**: Refactored to use RxDB users collection
- **Game.js**: Refactored to use RxDB games collection
- **Room.js**: Refactored to use RxDB rooms collection

### 4. Real-time Synchronization

#### Reactive Query Manager
```javascript
// server/src/services/ReactiveQueryManager.js
class ReactiveQueryManager {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.subscriptions = new Map();
  }

  subscribeToRoom(roomId, socketId) {
    // Subscribe to room document changes
    // Emit updates via Socket.IO
  }

  subscribeToGame(gameId, socketId) {
    // Subscribe to game document changes
    // Emit updates via Socket.IO
  }
}
```

### 5. Conflict Resolution

#### Conflict Resolution Strategies
```javascript
// server/src/services/ConflictResolutionService.js
class ConflictResolutionService {
  resolveUserConflict(localDoc, remoteDoc) {
    // Last-write-wins for user data
  }

  resolveGameStateConflict(localDoc, remoteDoc) {
    // Custom merge strategy for game state
  }

  resolveRoomConflict(localDoc, remoteDoc) {
    // Version-based resolution for room state
  }
}
```

## Data Models

### RxDB Schema Definitions

#### Users Schema
```javascript
const usersSchema = {
  version: 0,
  primaryKey: 'user_id',
  type: 'object',
  properties: {
    user_id: { type: 'string' },
    username: { type: 'string' },
    email: { type: 'string' },
    password_hash: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    last_login: { type: 'string', format: 'date-time' },
    total_games_played: { type: 'number', default: 0 },
    total_games_won: { type: 'number', default: 0 },
    is_active: { type: 'boolean', default: true },
    is_bot: { type: 'boolean', default: false }
  },
  required: ['user_id', 'username', 'email', 'password_hash']
};
```

#### Games Schema
```javascript
const gamesSchema = {
  version: 0,
  primaryKey: 'game_id',
  type: 'object',
  properties: {
    game_id: { type: 'string' },
    game_code: { type: 'string' },
    status: { 
      type: 'string', 
      enum: ['waiting', 'in_progress', 'completed', 'cancelled'],
      default: 'waiting'
    },
    host_id: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    started_at: { type: 'string', format: 'date-time' },
    completed_at: { type: 'string', format: 'date-time' },
    winning_team_id: { type: 'string' },
    target_score: { type: 'number', default: 52 },
    is_demo_mode: { type: 'boolean', default: false }
  },
  required: ['game_id', 'game_code', 'host_id']
};
```

#### Rooms Schema
```javascript
const roomsSchema = {
  version: 0,
  primaryKey: 'room_id',
  type: 'object',
  properties: {
    room_id: { type: 'string' },
    name: { type: 'string' },
    max_players: { type: 'number', default: 4 },
    owner_id: { type: 'string' },
    status: { 
      type: 'string', 
      enum: ['waiting', 'playing', 'finished'],
      default: 'waiting'
    },
    is_private: { type: 'boolean', default: false },
    invite_code: { type: 'string' },
    game_state: { type: 'object' },
    settings: { type: 'object' },
    version: { type: 'number', default: 1 },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' }
  },
  required: ['room_id', 'name', 'owner_id']
};
```

### Data Transformation

#### MariaDB to RxDB Mapping
- **Primary Keys**: UUID strings remain the same
- **Timestamps**: Convert MySQL TIMESTAMP to ISO 8601 strings
- **JSON Fields**: Direct mapping (game_state, settings)
- **Enums**: Convert to string constraints in RxDB schema
- **Foreign Keys**: Maintain as string references
- **Indexes**: Define in RxDB collection configuration

## Error Handling

### Migration Error Handling
```javascript
class MigrationErrorHandler {
  async handleDataIntegrityError(error, tableName) {
    // Log detailed error information
    // Attempt data repair if possible
    // Provide rollback options
  }

  async handleSchemaConflict(error, collectionName) {
    // Handle schema version conflicts
    // Provide migration path options
  }

  async handleConnectionError(error) {
    // Handle RxDB/LokiJS connection issues
    // Provide fallback mechanisms
  }
}
```

### Runtime Error Handling
```javascript
class RxDBErrorHandler {
  async handleConflictError(error, documentId) {
    // Apply conflict resolution strategy
    // Retry operation with resolved data
  }

  async handleValidationError(error, document) {
    // Validate document against schema
    // Provide detailed validation feedback
  }

  async handleStorageError(error) {
    // Handle LokiJS file system errors
    // Attempt recovery or backup restoration
  }
}
```

## Testing Strategy

### Unit Testing
- **Model Tests**: Test RxDB document operations
- **Schema Tests**: Validate RxDB schema definitions
- **Migration Tests**: Test data transformation accuracy
- **Conflict Resolution Tests**: Test merge strategies

### Integration Testing
- **Database Integration**: Test RxDB with LokiJS adapter
- **API Integration**: Test endpoints with RxDB backend
- **Real-time Integration**: Test reactive subscriptions
- **Migration Integration**: Test full migration process

### Performance Testing
- **Query Performance**: Compare RxDB vs MariaDB query times
- **Memory Usage**: Monitor RxDB memory consumption
- **File I/O Performance**: Test LokiJS persistence performance
- **Concurrent Access**: Test multi-user scenarios

### Data Integrity Testing
- **Migration Validation**: Verify data accuracy after migration
- **Backup/Restore**: Test backup and recovery procedures
- **Conflict Resolution**: Test concurrent update scenarios
- **Schema Evolution**: Test schema migration capabilities

## Performance Considerations

### Optimization Strategies
1. **Indexing**: Define appropriate indexes for frequent queries
2. **Caching**: Implement in-memory caching for hot data
3. **Batch Operations**: Use bulk operations for large data sets
4. **Connection Pooling**: Optimize RxDB connection management
5. **File Compression**: Enable LokiJS compression for storage efficiency

### Monitoring and Metrics
- **Query Performance**: Track query execution times
- **Memory Usage**: Monitor RxDB memory consumption
- **Storage Growth**: Track LokiJS file size growth
- **Error Rates**: Monitor migration and runtime errors
- **User Experience**: Track response times for critical operations

## Security Considerations

### Data Security
- **Encryption**: Implement encryption for sensitive data at rest
- **Access Control**: Maintain existing authentication mechanisms
- **Audit Logging**: Log all data access and modifications
- **Backup Security**: Secure backup files and migration data

### Migration Security
- **Data Validation**: Validate all migrated data integrity
- **Rollback Security**: Secure rollback procedures and data
- **Access Logging**: Log all migration operations
- **Error Handling**: Prevent information leakage in error messages