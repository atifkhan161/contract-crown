# Default Users

The system automatically creates 4 default users during database initialization. These users are always available for testing and development purposes.

## Default User Accounts

| Username | Email | Password |
|----------|-------|----------|
| aasim | aasim@contractcrown.com | asdwasdw |
| atif | atif@contractcrown.com | asdwasdw |
| sohail | sohail@contractcrown.com | asdwasdw |
| usama | usama@contractcrown.com | asdwasdw |

## Features

- **Automatic Creation**: Users are created automatically when the database initializes
- **Persistent**: Users persist across database restarts
- **Skip Duplicates**: If users already exist, they won't be recreated
- **Full Functionality**: These users have all the same capabilities as regular users

## API Endpoints

### Check Default Users Status
```
GET /api/seed/users/status
```

Returns the current status of all default users.

### Manually Seed Users
```
POST /api/seed/users/seed
```

Manually trigger the seeding process (useful for development).

### Reset Default Users
```
POST /api/seed/users/reset
```

Ensure all default users exist (recreates them if missing).

## Usage

You can use these accounts to:
- Test authentication functionality
- Create test rooms and games
- Simulate multiplayer scenarios
- Development and debugging

## Login Example

```bash
curl -X POST http://localhost:3030/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"aasim","password":"asdwasdw"}'
```

## Implementation

The default users are managed by the `SeedDataService` class and are automatically seeded during database initialization in the `RxDBConnection` class.