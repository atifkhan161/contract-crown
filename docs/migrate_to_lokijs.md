# Migration from RxDB to LokiJS in Contract Crown Backend

## Overview
We have migrated our backend database layer from RxDB to LokiJS due to stability and persistence issues with RxDB in our deployment environment.

## Setup

- LokiJS is now the core database.
- The database is persisted to the filesystem using LokiJS's built-in persistence adapter.
- The database instance is a singleton initialized at server start.

## Usage

- Collections are created via `db.addCollection('collectionName')`.
- CRUD operations use LokiJS methods like `collection.insert()`, `collection.find()`, `collection.update()`, and `collection.remove()`.
- Queries support `.find()`, `.where()`, and chained queries.
- Data is saved automatically after changes using LokiJS persistence adapters.

## Adding New Collections

- Define new collections in `server/database/loki-db.js`.
- Implement any needed validation on the application side.

## Backup and Restore

- Use `db.saveDatabase(callback)` to trigger manual saves.
- To backup, export the serialized JSON string.
- To restore, load JSON and import using LokiJS methods.

## Testing

- Update tests to replace RxDB mocks with LokiJS instances.
- Use synchronous behavior of LokiJS for simpler test mocks.

## Known Differences

- LokiJS is schemaless; validation must be implemented in app logic.
- LokiJS operations are synchronous but persistence is asynchronous.
- No built-in replication, unlike RxDB – plan accordingly if offline sync is needed.

## Resources

- [LokiJS Official Documentation](https://github.com/techfort/LokiJS)
- [LokiJS Persistence Adapters](https://github.com/techfort/LokiJS/wiki/Adapters)

---

Please refer to the migration scripts and example implementations in `server/database/migration-scripts` for detailed guidance.

---
