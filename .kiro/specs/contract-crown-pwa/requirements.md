# Requirements Document

## Introduction

Contract Crown PWA is a mobile-first Progressive Web Application for playing the Contract Crown card game online. The application enables four players to engage in real-time multiplayer card games with strategic trump declaration and trick-taking mechanics. The system consists of a vanilla JavaScript frontend optimized for mobile devices and a Node.js backend with WebSocket support for real-time gameplay. The application follows a structured page flow: Login → Registration → Dashboard → Waiting Lobby → Game Page, emphasizing responsive design, offline capabilities, and seamless multiplayer experience.

## Requirements

### Requirement 1

**User Story:** As a new user, I want to access separate login and registration pages, so that I can create an account or authenticate with existing credentials.

#### Acceptance Criteria

1. WHEN a user visits the application THEN the system SHALL display a login page as the first interface
2. WHEN a user clicks on registration link THEN the system SHALL navigate to a separate registration page
3. WHEN a user submits valid registration data (username, email, password) THEN the system SHALL create a new user account and redirect to login page
4. WHEN a user submits valid login credentials THEN the system SHALL authenticate the user and provide a JWT token
5. WHEN authentication is successful THEN the system SHALL redirect to the dashboard page

### Requirement 2

**User Story:** As an authenticated player, I want to access a dashboard with room creation and joining options, so that I can start or join Contract Crown games.

#### Acceptance Criteria

1. WHEN an authenticated user accesses the dashboard THEN the system SHALL display options to create new room or join room via game code
2. WHEN a user creates a new room THEN the system SHALL generate a unique game code and designate the user as host
3. WHEN a user joins a room with valid game code THEN the system SHALL add them to the waiting lobby
4. WHEN a user provides invalid game code THEN the system SHALL display an error message
5. WHEN a user logs out from dashboard THEN the system SHALL clear authentication and return to login page

### Requirement 3

**User Story:** As a player in a waiting lobby, I want to see all participants and ready status, so that we can coordinate game start with proper team formation.

#### Acceptance Criteria

1. WHEN a player enters waiting lobby THEN the system SHALL display all 4 player slots and their ready status
2. WHEN a player marks themselves as ready THEN the system SHALL update their status for all participants
3. WHEN all 4 players are ready THEN the system SHALL enable the "Start Game" button for the host only
4. WHEN the host clicks team formation button THEN the system SHALL automatically sort 4 players into 2 teams of 2 players each
5. WHEN the host starts the game THEN the system SHALL redirect all players to the game page

### Requirement 4

**User Story:** As a player in the game page, I want to see the initial card distribution and trump declaration process, so that I can understand the game setup and trump selection.

#### Acceptance Criteria

1. WHEN the game starts THEN the system SHALL distribute 4 cards to each player initially
2. WHEN initial cards are dealt THEN only the trump declarer SHALL see their 4 cards for trump selection
3. WHEN the trump declarer selects a trump suit THEN the system SHALL make the trump visible to all players
4. WHEN trump is declared THEN the system SHALL distribute the remaining 4 cards to all players (total 8 cards each)
5. WHEN final distribution is complete THEN all players SHALL see their complete hand of 8 cards from 7 to Ace

### Requirement 5

**User Story:** As a player during gameplay, I want to participate in trick-taking rounds with proper rule enforcement, so that I can play cards according to Contract Crown rules and compete for tricks.

#### Acceptance Criteria

1. WHEN it's a player's turn THEN the system SHALL highlight that player and enable card selection from valid playable cards
2. WHEN a player must follow suit THEN the system SHALL only allow cards of the lead suit to be played
3. WHEN a player cannot follow suit THEN the system SHALL allow trump cards or discards from other suits
4. WHEN a player plays a valid card THEN the system SHALL place the card on the table and advance to next player
5. WHEN all 4 players have played cards THEN the system SHALL determine the trick winner and start the next trick

### Requirement 6

**User Story:** As a player, I want to see accurate scoring based on Contract Crown rules, so that I can track team progress toward victory.

#### Acceptance Criteria

1. WHEN a round ends THEN the system SHALL calculate scores based on tricks won by each team
2. WHEN the declaring team wins 5+ tricks THEN the system SHALL award points equal to tricks won
3. WHEN the declaring team wins <5 tricks THEN the system SHALL award 0 points to declaring team
4. WHEN the challenging team wins 4+ tricks THEN the system SHALL award points equal to tricks won
5. WHEN any team reaches 52 points THEN the system SHALL end the game and declare the winner

### Requirement 7

**User Story:** As a player, I want the Crown Rule to be enforced, so that trump declaration privilege is correctly managed across rounds.

#### Acceptance Criteria

1. WHEN the declaring team wins 5+ tricks THEN the same player SHALL declare trump in the next round
2. WHEN the declaring team wins <5 tricks THEN trump declaration SHALL pass to the dealer's left
3. WHEN a new round starts THEN the system SHALL rotate the dealer position clockwise
4. WHEN trump declaration privilege changes THEN the system SHALL notify all players
5. WHEN the game continues THEN the system SHALL maintain correct turn order and dealer rotation

### Requirement 8

**User Story:** As a mobile user, I want a responsive and installable PWA, so that I can play the game seamlessly on my mobile device.

#### Acceptance Criteria

1. WHEN a user accesses the application on mobile THEN the system SHALL display a mobile-optimized interface
2. WHEN a user visits the PWA THEN the system SHALL offer "Add to Home Screen" functionality
3. WHEN the user is offline THEN the system SHALL display cached content and offline capabilities
4. WHEN the user has poor connectivity THEN the system SHALL handle reconnection gracefully
5. WHEN the application loads THEN the system SHALL use service workers for fast loading and caching

### Requirement 9

**User Story:** As a player, I want real-time communication during gameplay, so that I can receive immediate updates about game events.

#### Acceptance Criteria

1. WHEN game events occur THEN the system SHALL broadcast updates via WebSocket to all players
2. WHEN a player disconnects THEN the system SHALL notify other players and handle reconnection
3. WHEN network issues occur THEN the system SHALL attempt automatic reconnection
4. WHEN game state changes THEN the system SHALL synchronize all client interfaces
5. WHEN errors occur THEN the system SHALL display appropriate error messages to affected players

### Requirement 10

**User Story:** As a mobile user, I want a modern, responsive, and mobile-friendly interface, so that I can have an optimal gaming experience on any device.

#### Acceptance Criteria

1. WHEN accessing the application on any device THEN the system SHALL display a modern, responsive UI that adapts to screen size
2. WHEN using the application on mobile THEN the system SHALL prioritize mobile-first design with touch-friendly interactions
3. WHEN interacting with UI elements THEN the system SHALL provide smooth animations and modern visual feedback
4. WHEN the screen orientation changes THEN the system SHALL adapt the layout appropriately
5. WHEN using the application THEN the system SHALL maintain consistent modern design patterns across all pages

### Requirement 11

**User Story:** As a player, I want to see the WebSocket connection status, so that I can understand my connectivity state during real-time gameplay.

#### Acceptance Criteria

1. WHEN the application loads THEN the system SHALL display a connection status widget showing WebSocket state
2. WHEN WebSocket connection is established THEN the widget SHALL show "Connected" status with green indicator
3. WHEN WebSocket connection is lost THEN the widget SHALL show "Disconnected" status with red indicator
4. WHEN WebSocket is reconnecting THEN the widget SHALL show "Reconnecting" status with yellow indicator
5. WHEN connection status changes THEN the widget SHALL update in real-time with appropriate visual feedback

### Requirement 12

**User Story:** As a developer, I want modular and maintainable code structure, so that the application can be easily extended and themed.

#### Acceptance Criteria

1. WHEN implementing frontend features THEN each HTML page SHALL have dedicated JS and CSS files
2. WHEN writing JavaScript modules THEN each file SHALL not exceed 300-400 lines
3. WHEN styling the application THEN the system SHALL use a theme.css file for consistent theming
4. WHEN testing features THEN each subtask SHALL have corresponding Cypress tests
5. WHEN the application is deployed THEN the system SHALL use MariaDB for data persistence