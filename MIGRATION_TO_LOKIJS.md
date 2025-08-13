# Migration from RxDB to LokiJS

This guide will help you migrate your Trump Crown application from RxDB to LokiJS without losing any functionality.

## Why Migrate to LokiJS?

- **Simplicity**: LokiJS is much simpler than RxDB with fewer dependencies
- **Stability**: More stable in production environments
- **Performance**: Better performance for our use case
- **Maintenance**: Easier to maintain and debug

## Migration Steps

### 1. Backup Your Current Data

Before starting the migration, create a backup of your current RxDB data:

```bash
cd server
npm run backup:create
```

### 2. Run the Migration Script

The migration script will automatically:
- Backup your RxDB data
- Initialize LokiJS
- Migrate existing data (if any)

```bash
cd server
node scripts/migrate-to-lokijs.js
```

### 3. Update Environment Variables

Update your `.env` file to include LokiJS configuration:

```env
# LokiJS Configuration
LOKIJS_PATH=./data/lokijs
LOKIJS_NAME=trump_crown_db.json
```

### 4. Test the Migration

Start the server and verify everything works:

```bash
npm run dev
```

### 5. Verify Data Migration

Check that your data has been migrated correctly:

```bash
npm run db:status
```

## New Commands

The following npm scripts are now available:

```bash
# Database management
npm run db:init          # Initialize LokiJS database
npm run db:reset         # Reset LokiJS database
npm run db:status        # Show database status

# Legacy commands (still work)
npm run lokijs:init      # Same as db:init
npm run lokijs:reset     # Same as db:reset
npm run lokijs:status    # Same as db:status

# Backup
npm run backup:create    # Create database backup
```

## What Changed

### Database Layer
- **RxDB** → **LokiJS**: Simpler, more stable database
- **Reactive queries** → **Simple queries**: Non-reactive but more reliable
- **Complex schemas** → **Schemaless**: Validation moved to application layer

### File Structure
- `database/rxdb-connection.js` → `database/loki-db.js`
- `database/rxdb-init.js` → `database/loki-init.js`
- `models/BaseRxDBModel.js` → `models/BaseLokiModel.js`

### API Changes
- All model methods remain the same
- Subscription methods are now non-reactive (for compatibility)
- Database operations are now synchronous (except initialization)

## Functionality Preserved

✅ **All existing functionality is preserved:**
- User authentication and sessions
- Room creation and management
- Game state management
- Real-time WebSocket communication
- Player ready status and team formation
- All API endpoints work exactly the same

## Rollback Plan

If you need to rollback to RxDB:

1. Stop the server
2. Restore your RxDB backup from `data/migration-backup/`
3. Revert the code changes
4. Restart the server

## Troubleshooting

### Migration Issues

**Problem**: Migration script fails
**Solution**: Check that you have write permissions to the data directory

**Problem**: Data not migrated
**Solution**: Check if RxDB export file exists in `data/rxdb/trump_crown_rxdb.json`

### Runtime Issues

**Problem**: "Collection not found" errors
**Solution**: Run `npm run db:init` to initialize collections

**Problem**: Database file not found
**Solution**: Check that `LOKIJS_PATH` and `LOKIJS_NAME` are set correctly in `.env`

## Performance Improvements

After migration, you should notice:
- Faster server startup time
- Reduced memory usage
- More stable database operations
- Simpler debugging and maintenance

## Support

If you encounter any issues during migration:

1. Check the migration logs for specific error messages
2. Verify your environment variables are set correctly
3. Ensure you have proper file permissions
4. Check that all dependencies are installed

The migration preserves all functionality while providing a more stable and maintainable database layer.