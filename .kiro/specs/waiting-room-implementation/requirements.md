# Requirements Document

## Introduction

The Waiting Room is a simplified replacement for the existing lobby functionality in the Contract Crown PWA. This feature provides a clean, real-time multiplayer coordination system where players can join game rooms, mark their ready status, and start games once all participants are prepared. The waiting room serves as the intermediate step between room creation on the dashboard and actual gameplay, focusing on simplicity and reliability to avoid the bugs present in the current lobby implementation.

## Requirements

### Requirement 1

**User Story:** As a room creator, I want to be redirected to a waiting room after creating a room, so that I can coordinate with other players before starting the game.

#### Acceptance Criteria

1. WHEN a user creates a room on the dashboard THEN the system SHALL redirect them to the waiting room page instead of lobby.html
2. WHEN the room creator enters the waiting room THEN the system SHALL display them as the host with special privileges
3. WHEN the waiting room loads THEN the system SHALL show the room code prominently for sharing with other players
4. WHEN the room creator is in the waiting room THEN the system SHALL enable host-specific controls (start game button when conditions are met)
5. WHEN the room is created THEN the system SHALL store the room entry in the database with proper room metadata

### Requirement 2

**User Story:** As a player, I want to join a waiting room using a room code, so that I can participate in a multiplayer game session.

#### Acceptance Criteria

1. WHEN a player enters a valid room code on the dashboard THEN the system SHALL redirect them to the waiting room for that specific room
2. WHEN a player joins the waiting room THEN the system SHALL assign them to one of the 4 available player slots
3. WHEN a player joins THEN the system SHALL broadcast their presence to all other players in real-time via WebSocket
4. WHEN the room is full (4 players) THEN the system SHALL prevent additional players from joining
5. WHEN a player joins THEN the system SHALL display their username and initial ready status as "not ready"

### Requirement 3

**User Story:** As a player in the waiting room, I want to see all 4 player slots and their current status, so that I can understand who is participating and their readiness.

#### Acceptance Criteria

1. WHEN the waiting room loads THEN the system SHALL display exactly 4 player slots with clear visual indicators
2. WHEN a slot is occupied THEN the system SHALL show the player's username and ready status
3. WHEN a slot is empty THEN the system SHALL display "Waiting for player..." or similar placeholder
4. WHEN player status changes THEN the system SHALL update all connected clients in real-time
5. WHEN players join or leave THEN the system SHALL immediately reflect these changes across all clients

### Requirement 4

**User Story:** As a player, I want to mark myself as ready, so that other players know I'm prepared to start the game.

#### Acceptance Criteria

1. WHEN a player clicks the ready button THEN the system SHALL toggle their ready status
2. WHEN a player marks ready THEN the system SHALL broadcast this status change to all other players via WebSocket
3. WHEN a player's ready status changes THEN the system SHALL update the visual indicator (color, text, or icon) for all players
4. WHEN a player is ready THEN the ready button SHALL change to "Not Ready" to allow status reversal
5. WHEN ready status changes THEN the system SHALL not persist this to the database (in-memory only)

### Requirement 5

**User Story:** As the host, I want to start the game when all players are ready, so that we can begin playing Contract Crown.

#### Acceptance Criteria

1. WHEN all 4 players are marked as ready THEN the system SHALL enable the "Start Game" button for the host only
2. WHEN fewer than 4 players are ready THEN the "Start Game" button SHALL remain disabled
3. WHEN the host clicks "Start Game" THEN the system SHALL create team entries in the database
4. WHEN teams are formed THEN the system SHALL automatically assign players to 2 teams of 2 players each
5. WHEN the game starts THEN the system SHALL redirect all players to game.html

### Requirement 6

**User Story:** As a player, I want real-time updates about room status, so that I can see changes immediately without refreshing.

#### Acceptance Criteria

1. WHEN any player joins the room THEN the system SHALL broadcast the update via WebSocket to all connected clients
2. WHEN any player changes ready status THEN the system SHALL send real-time updates to all other players
3. WHEN a player disconnects THEN the system SHALL update their slot status and notify other players
4. WHEN the host starts the game THEN the system SHALL send navigation commands to all players simultaneously
5. WHEN WebSocket connection issues occur THEN the system SHALL handle reconnection gracefully

### Requirement 7

**User Story:** As a developer, I want modular and maintainable code structure, so that the waiting room is easy to debug and extend.

#### Acceptance Criteria

1. WHEN implementing the waiting room THEN the system SHALL use separate HTML, CSS, and JavaScript files
2. WHEN handling WebSocket communication THEN the system SHALL use a dedicated socket manager module
3. WHEN implementing server-side logic THEN the system SHALL create separate API endpoints for room management
4. WHEN writing JavaScript THEN each module SHALL be focused and not exceed 300-400 lines
5. WHEN styling the interface THEN the system SHALL reuse existing CSS themes for consistency

### Requirement 8

**User Story:** As a player, I want clear visual feedback about connection status, so that I understand the real-time communication state.

#### Acceptance Criteria

1. WHEN the waiting room loads THEN the system SHALL display WebSocket connection status
2. WHEN connection is established THEN the system SHALL show "Connected" with green indicator
3. WHEN connection is lost THEN the system SHALL show "Disconnected" with red indicator and attempt reconnection
4. WHEN reconnecting THEN the system SHALL show "Reconnecting..." with yellow indicator
5. WHEN connection status changes THEN the system SHALL provide immediate visual feedback

### Requirement 9

**User Story:** As a player, I want to leave the waiting room, so that I can return to the dashboard if needed.

#### Acceptance Criteria

1. WHEN a player clicks "Leave Room" THEN the system SHALL remove them from the room and return them to dashboard
2. WHEN a player leaves THEN the system SHALL broadcast their departure to remaining players
3. WHEN the host leaves THEN the system SHALL either transfer host privileges or close the room
4. WHEN a player leaves THEN their slot SHALL become available for new players
5. WHEN leaving the room THEN the system SHALL clean up WebSocket connections properly

### Requirement 10

**User Story:** As a mobile user, I want the waiting room to be responsive and touch-friendly, so that I can use it effectively on my mobile device.

#### Acceptance Criteria

1. WHEN accessing on mobile THEN the system SHALL display a mobile-optimized layout
2. WHEN interacting with buttons THEN the system SHALL provide touch-friendly targets and feedback
3. WHEN the screen orientation changes THEN the system SHALL adapt the layout appropriately
4. WHEN using on different screen sizes THEN the system SHALL maintain readability and usability
5. WHEN displaying player slots THEN the system SHALL arrange them optimally for the screen size