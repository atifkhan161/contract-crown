# Product Requirements Document (PRD) - Contract Crown PWA Web App

This document outlines the requirements and specifications for the Contract Crown Progressive Web Application (PWA) and its supporting backend system.

---

## 1. Game Overview and Rules

Contract Crown is a trick-taking card game for four players in fixed partnerships, emphasizing strategic trump declaration and achieving specific trick counts.

### 1.1. Objective

The primary objective is for a team to be the first to reach a predetermined score of **52 points**. Points are earned by successfully winning a specified number of tricks. A unique "Crown Rule" allows the team whose player declared trump to retain that privilege in the subsequent round by meeting a specific trick target.

### 1.2. Players and Deck

* **Players:** Four players in two fixed partnerships. Partners sit opposite each other.
* **Deck:** A stripped standard 52-card deck consisting only of cards from **7 through Ace** in all four suits. This results in a **32-card deck** (8 cards per suit).
* **Card Ranks (Highest to Lowest):** Ace, King, Queen, Jack, 10, 9, 8, 7.

### 1.3. The Deal

1.  **First Dealer:** To determine the first dealer, players can draw cards; the player with the highest card deals. In subsequent rounds, the deal rotates clockwise to the player on the current dealer's left.
2.  The dealer shuffles the 32-card deck thoroughly.
3.  The player to the dealer's right cuts the deck.
4.  The dealer deals out **4 cards** to each player, one card at a time, clockwise. Players look only at their own 4 cards.
5.  After the trump suit is declared, the dealer deals the remaining **4 cards** to each player, one at a time, clockwise. Each player now has a total of 8 cards.

### 1.4. Trump Declaration Phase

1.  **First Player:** The player to the dealer's left is the "First Player" for trump declaration.
2.  **Trump Declaration:** Based on their initial 4 cards, the First Player must declare one of the four suits as the trump suit for the hand. There is no passing or bidding.
3.  **Teams Defined:** Once trump is declared:
    * The team of the player who declared trump becomes the **Declaring Team**.
    * The opposing team becomes the **Challenging Team**.

### 1.5. Gameplay (Trick-Taking)

1.  **Lead Card:** The First Player (who declared trump) leads the first trick by playing any card from their hand.
2.  **Following Suit:** Players must follow suit if they have a card of the lead suit.
3.  **Playing Trump:** If a player does not have a card of the lead suit, they may play a trump card. Playing a trump card when unable to follow suit is not mandatory; a player can choose to discard a card from another non-trump suit.
4.  **Discarding:** If a player cannot follow suit and chooses not to play a trump card (or has no trumps), they may play any other card from their hand (a discard).
5.  **Trick Winner:**
    * The highest trump card played wins the trick.
    * If no trumps are played, the highest card of the lead suit wins the trick.
6.  **Next Lead:** The winner of the trick leads the next trick.
7.  **Hand Completion:** This continues for all 8 tricks until all cards are played.

### 1.6. Scoring

Points are awarded based on the number of tricks won by each team in a hand, in relation to the trump declaration:

* **Declaring Team:**
    * If they win **5 or more tricks**, they score the exact number of tricks they won (e.g., 5 tricks = 5 points, 8 tricks = 8 points).
    * If they win **fewer than 5 tricks**, they score **0 points**.
* **Challenging Team:**
    * If they win **4 or more tricks**, they score the exact number of tricks they won (e.g., 4 tricks = 4 points, 8 tricks = 8 points).
    * If they win **fewer than 4 tricks**, they score **0 points**.

### 1.7. Crown Rule

This rule dictates who declares trump in the subsequent round:

* If the **Declaring Team wins 5 or more tricks** in the current hand, the player who declared trump in the current hand gets to declare trump for the **next** hand as well (though the deal still rotates clockwise).
* If the **Declaring Team wins fewer than 5 tricks**, the right to declare trump for the next hand passes to the player on the **current dealer's left** (the player who would normally start the bidding in a standard game). This player's team becomes the Declaring Team for the next round.

### 1.8. Winning the Game

The game ends when a team reaches or exceeds the agreed-upon target score of **52 points**.

---

## 2. Core Functional Requirements

### 2.1. Frontend Requirements (Vanilla JavaScript PWA)

* **User Interface:**
    * **Login/Registration/Profile:** Forms for user authentication, display of user profile (username, game statistics).
    * **Game Lobby:** Display a list of available games, "Create Game" button, "Join Game" functionality (via game code).
    * **Game Table:** Real-time display of player hands (player's own 8 cards, number of cards for opponents), current trick, current scores for both teams, declared trump suit, and visual indication of whose turn it is.
    * **Player Actions:** Intuitive interface for selecting and playing cards, and for the "First Player" to declare the trump suit.
    * **Game Notifications:** Display in-game messages (e.g., "Player X won the trick", "Player Y declared Hearts").
* **Real-time Updates:** Synchronize game state (cards played, scores, current player, trump declaration) across all connected client browsers.
* **PWA Features:**
    * **Installability:** `manifest.json` for "Add to Home Screen" functionality, custom icons, splash screen.
    * **Offline Capabilities:** `service-worker.js` for caching static assets (HTML, CSS, JS, images) to enable basic offline access and faster loading.
    * **Responsive Design:** UI adapts seamlessly to different screen sizes (mobile, tablet, desktop).

### 2.2. Backend Requirements (Node.js Express.js)

* **User Management:**
    * API endpoints for user registration, login, and authentication (JWT-based).
    * API endpoint for retrieving and updating user profiles.
* **Game Management:**
    * API endpoints for creating new game rooms, joining existing rooms, and leaving games.
    * Logic to manage game sessions and their states (waiting, in-progress, completed, cancelled).
* **Game Logic Engine:**
    * Implementation of card shuffling and dealing algorithms.
    * Enforcement of all game rules: trick-taking mechanics (following suit, playing trump, discarding), determining trick winners.
    * Accurate scoring calculation based on the game rules.
    * Implementation of the "Crown Rule" to determine trump declaration advantage for subsequent rounds.
    * Logic to manage turn order and enforce valid player actions.
    * Logic for game termination conditions (reaching 52 points).
* **Real-time Communication:**
    * WebSocket server (Socket.IO) for high-frequency, low-latency communication of game state updates and player actions.
* **Database Interaction:**
    * Persistence of user data, game sessions, player data within games, and historical game results/statistics.

---

## 3. Database Schema (PostgreSQL)

The database schema is designed to support user authentication, game state management, and historical data.

### 3.1. `users` Table

* `user_id` (UUID PRIMARY KEY): Unique identifier for each user.
* `username` (VARCHAR(50) UNIQUE NOT NULL): User's chosen username.
* `email` (VARCHAR(100) UNIQUE NOT NULL): User's email address.
* `password_hash` (VARCHAR(255) NOT NULL): Hashed password.
* `created_at` (TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP): Timestamp of user registration.
* `last_login` (TIMESTAMP WITH TIME ZONE): Timestamp of last login.
* `total_games_played` (INTEGER DEFAULT 0): Total games played by the user.
* `total_games_won` (INTEGER DEFAULT 0): Total games won by the user.

### 3.2. `games` Table

* `game_id` (UUID PRIMARY KEY): Unique identifier for each game session.
* `game_code` (VARCHAR(10) UNIQUE NOT NULL): Short, human-readable code for joining games.
* `status` (ENUM('waiting', 'in_progress', 'completed', 'cancelled') NOT NULL): Current game status.
* `created_at` (TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP): Timestamp of game creation.
* `started_at` (TIMESTAMP WITH TIME ZONE): Timestamp when the game started.
* `completed_at` (TIMESTAMP WITH TIME ZONE): Timestamp when the game completed.
* `winning_team_id` (UUID REFERENCES `teams`(team_id)): ID of the winning team (NULL if not completed).
* `target_score` (INTEGER NOT NULL DEFAULT 52): The score required to win.

### 3.3. `teams` Table

* `team_id` (UUID PRIMARY KEY): Unique identifier for each team within a game.
* `game_id` (UUID NOT NULL REFERENCES `games`(game_id) ON DELETE CASCADE): Foreign key to `games`.
* `team_number` (INTEGER NOT NULL): 1 or 2 to distinguish teams.
* `current_score` (INTEGER DEFAULT 0): Current score of the team.
* `player1_id` (UUID REFERENCES `users`(user_id)): ID of player 1 on the team.
* `player2_id` (UUID REFERENCES `users`(user_id)): ID of player 2 on the team.

### 3.4. `game_players` Table

* `game_player_id` (UUID PRIMARY KEY): Unique identifier for a player's participation in a game.
* `game_id` (UUID NOT NULL REFERENCES `games`(game_id) ON DELETE CASCADE): Foreign key to `games`.
* `user_id` (UUID NOT NULL REFERENCES `users`(user_id)): Foreign key to `users`.
* `team_id` (UUID NOT NULL REFERENCES `teams`(team_id)): Foreign key to `teams`.
* `seat_position` (INTEGER NOT NULL): 1-4, representing table position.
* `is_dealer` (BOOLEAN DEFAULT FALSE): True if this player is the dealer for the current hand.
* `is_first_player` (BOOLEAN DEFAULT FALSE): True if this player is the "First Player" for trump declaration.
* `current_hand` (JSONB): Stores the player's current 8-card hand (e.g., `[{"suit": "Hearts", "rank": "Ace"}, ...]`).
* `tricks_won_current_hand` (INTEGER DEFAULT 0): Number of tricks won by this player in the current hand.

### 3.5. `game_rounds` Table

* `round_id` (UUID PRIMARY KEY): Unique identifier for each round (hand) within a game.
* `game_id` (UUID NOT NULL REFERENCES `games`(game_id) ON DELETE CASCADE): Foreign key to `games`.
* `round_number` (INTEGER NOT NULL): Sequential number of the round.
* `dealer_user_id` (UUID NOT NULL REFERENCES `users`(user_id)): Dealer for this round.
* `first_player_user_id` (UUID NOT NULL REFERENCES `users`(user_id)): Player who was "First Player" for trump.
* `trump_suit` (VARCHAR(10) NOT NULL): Declared trump suit for this round.
* `declaring_team_id` (UUID NOT NULL REFERENCES `teams`(team_id)): Team that declared trump.
* `declaring_team_tricks_won` (INTEGER DEFAULT 0): Tricks won by declaring team.
* `challenging_team_tricks_won` (INTEGER DEFAULT 0): Tricks won by challenging team.
* `declaring_team_score_change` (INTEGER DEFAULT 0): Points scored by declaring team.
* `challenging_team_score_change` (INTEGER DEFAULT 0): Points scored by challenging team.
* `round_completed_at` (TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP): Timestamp when the round ended.

### 3.6. `game_tricks` Table

* `trick_id` (UUID PRIMARY KEY): Unique identifier for each trick within a round.
* `round_id` (UUID NOT NULL REFERENCES `game_rounds`(round_id) ON DELETE CASCADE): Foreign key to `game_rounds`.
* `trick_number` (INTEGER NOT NULL): Sequential number of the trick (1-8).
* `leading_player_user_id` (UUID NOT NULL REFERENCES `users`(user_id)): Player who led this trick.
* `winner_user_id` (UUID REFERENCES `users`(user_id)): Player who won this trick.
* `trick_completed_at` (TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP): Timestamp when the trick ended.

### 3.7. `trick_plays` Table

* `play_id` (UUID PRIMARY KEY): Unique identifier for each card played in a trick.
* `trick_id` (UUID NOT NULL REFERENCES `game_tricks`(trick_id) ON DELETE CASCADE): Foreign key to `game_tricks`.
* `player_user_id` (UUID NOT NULL REFERENCES `users`(user_id)): Player who played the card.
* `card_suit` (VARCHAR(10) NOT NULL): Suit of the card played.
* `card_rank` (VARCHAR(5) NOT NULL): Rank of the card played (e.g., 'A', 'K', 'Q', 'J', '10', '9', '8', '7').
* `play_order` (INTEGER NOT NULL): Order in which the card was played within the trick (1-4).
* `played_at` (TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP): Timestamp when the card was played.

---

## 4. Frontend Development Tasks (Vanilla JavaScript PWA)

This section outlines the tasks for developing the client-side Progressive Web Application using vanilla JavaScript.

### 4.1. Project Setup and Basic Structure

* **4.1.1:** Initialize frontend project with `index.html`, `style.css`, `app.js`.
* **4.1.2:** Set up a development server.
* **4.1.3:** Create `manifest.json` for PWA installability (name, icons, start URL, display mode).
* **4.1.4:** Register `service-worker.js` for basic static asset caching.
* **4.1.5:** Implement basic client-side routing for views (Login/Register, Lobby, Game Table).

### 4.2. User Authentication and Profile UI

* **4.2.1:** Design and implement Login/Registration page UIs.
* **4.2.2:** Implement client-side validation for forms.
* **4.2.3:** Integrate with backend API for login/registration (`fetch` API).
* **4.2.4:** Store authentication tokens securely (e.g., `localStorage`).
* **4.2.5:** Implement User Profile UI (username, stats).
* **4.2.6:** Implement Logout functionality.

### 4.3. Game Lobby UI and Functionality

* **4.3.1:** Design and implement Game Lobby UI (list of games, Create/Join buttons).
* **4.3.2:** Fetch and display active game list from backend.
* **4.3.3:** Implement "Create Game" functionality (API request, navigate to game table).
* **4.3.4:** Implement "Join Game" functionality (API request with game code, navigate to game table).
* **4.3.5:** Implement real-time updates for lobby game list (WebSocket).

### 4.4. Real-time Game Table Display

* **4.4.1:** Design and implement Game Table UI layout (player hands, trick area, scores, trump).
* **4.4.2:** Implement dynamic card rendering (suit/rank).
* **4.4.3:** Establish WebSocket connection to backend for game state synchronization.
* **4.4.4:** Handle incoming WebSocket messages (`game:state_update`, `game:card_played`, `game:trick_won`, etc.) to update UI:
    * Render player hands (own cards, opponent card counts).
    * Display cards in the current trick.
    * Update trump suit display, team scores.
    * Highlight current player's turn.
    * Display game messages.

### 4.5. Player Actions and Interaction

* **4.5.1: Trump Declaration:**
    * Enable "First Player" to select trump from initial 4 cards.
    * Provide UI elements for trump selection.
    * Send declared trump to backend via WebSocket (`player:declare_trump`).
* **4.5.2: Card Selection and Play:**
    * Enable current player to select a card from their hand.
    * Visual feedback for selected cards.
    * Send selected card to backend via WebSocket (`player:play_card`).
    * Client-side validation for card plays (turn, suit-following).
* **4.5.3: Leave Game:**
    * Implement "Leave Game" button (API request, return to lobby).

### 4.6. PWA Enhancements

* **4.6.1:** Implement basic offline page using Service Worker.
* **4.6.2:** Implement caching strategies for dynamic content (e.g., card images) via Service Worker.

---

## 5. Backend Development Tasks (Node.js Express.js)

This section details the tasks for developing the server-side application using Node.js with Express.js and Socket.IO.

### 5.1. Project Setup and Core Server

* **5.1.1:** Initialize Node.js project.
* **5.1.2:** Install `express`, `pg`, `dotenv`, `bcrypt`, `jsonwebtoken`, `socket.io`.
* **5.1.3:** Set up Express.js server (middleware, CORS).
* **5.1.4:** Configure environment variables.
* **5.1.5:** Establish PostgreSQL connection with a connection pool.

### 5.2. User Management API Endpoints

* **5.2.1: User Registration (`POST /api/auth/register`):**
    * Receive username, email, password.
    * Hash password (`bcrypt`).
    * Store in `users` table.
* **5.2.2: User Login (`POST /api/auth/login`):**
    * Receive credentials.
    * Compare hashed password.
    * Generate JWT token.
    * Return token.
* **5.2.3: User Profile (`GET /api/users/profile`):**
    * Implement JWT authentication middleware.
    * Retrieve user data (exclude hash) from `users` table.

### 5.3. Game Management API Endpoints (RESTful)

* **5.3.1: Create Game (`POST /api/games`):**
    * JWT authentication.
    * Generate `game_id`, `game_code`.
    * Create `games`, `teams`, `game_players` entries.
    * Return `game_id`, `game_code`.
* **5.3.2: Join Game (`POST /api/games/join`):**
    * JWT authentication, receive `game_code`.
    * Validate `game_code`, game status, available slots.
    * Assign player to seat and team.
    * Update `game_players`, `teams` tables.
    * If 4 players, update `game` status to 'in_progress', trigger game start.
* **5.3.3: Leave Game (`POST /api/games/:gameId/leave`):**
    * JWT authentication.
    * Remove player from `game_players`.
    * Handle game state changes (e.g., cancel game if unplayable).
    * Notify other players via WebSocket.
* **5.3.4: Get Game Details (`GET /api/games/:gameId`):**
    * JWT authentication.
    * Retrieve current game state from DB.

### 5.4. WebSocket Server Implementation (Socket.IO)

* **5.4.1:** Integrate Socket.IO with Express.js server.
* **5.4.2:** Handle Socket.IO connections/disconnections.
* **5.4.3:** Implement Socket.IO rooms for each game session.
* **5.4.4:** Define and handle custom Socket.IO events (see Section 7).

---

## 6. Granular Backend Game Logic Implementation

This section details the precise steps and validations for the core game mechanics.

### 6.1. Game Initialization and Setup

* **6.1.1. Deck Generation:** `generateDeck()` function (32 card objects: suit, rank).
* **6.1.2. Deck Shuffling:** `shuffleDeck(deck)` (Fisher-Yates).
* **6.1.3. Determine First Dealer:** Random selection for first game, then rotation.
* **6.1.4. Determine Player Seating and Partnerships:** Assign `seat_position` (1-4), identify partners (1&3, 2&4).

### 6.2. Dealing Cards

* **6.2.1. Initial 4-Card Deal:**
    * Deal 4 cards per player.
    * Update `game_players.current_hand` in DB.
    * Emit `game:deal_initial_hand` (per player).
    * Identify `first_player_user_id` for trump declaration.
* **6.2.2. Remaining 4-Card Deal:**
    * After trump, deal remaining 4 cards per player.
    * Update `game_players.current_hand`.
    * Emit `game:deal_final_hand` (per player).

### 6.3. Trump Declaration Phase

* **6.3.1. `player:declare_trump` Event Handling:**
    * Listen for event from `first_player_user_id`.
    * **Validate:** Correct player, valid suit, based on initial 4 cards.
    * If valid: Store `trump_suit` in `game_rounds`, set `declaring_team_id`.
    * Emit `game:trump_declared` to all.
    * Proceed to deal remaining cards.

### 6.4. Trick-Taking Gameplay

* **6.4.1. Turn Management:** Maintain `current_player_user_id`. First trick lead by trump declarer, subsequent by trick winner. Emit `game:turn_change`.
* **6.4.2. `player:play_card` Event Handling:**
    * Listen for event from `current_player_user_id`.
    * Receive `card_suit` and `card_rank`.
    * **Validate:** Correct player's turn, player possesses card, **card adheres to suit-following rules**:
        * Must follow lead suit if possible.
        * May play trump if cannot follow suit.
        * May discard if cannot follow suit and chooses not to play trump.
    * If valid: Remove card from `current_hand` (in-memory & DB). Store in `trick_plays`.
    * Emit `game:card_played` to all. Advance turn.
* **6.4.3. Determine Trick Winner:**
    * After 4 cards played: Identify `lead_suit`.
    * Winner: Highest trump, or highest lead suit if no trumps.
    * Increment `tricks_won_current_hand` for winner. Store `winner_user_id` in `game_tricks`.
    * Emit `game:trick_won` to all. Set next leader.

### 6.5. Scoring and Round Progression

* **6.5.1. End of Round (8 Tricks):**
    * Calculate tricks won by Declaring/Challenging teams.
    * **Declaring Team Scoring:** >= 5 tricks = score tricks; < 5 tricks = 0 points.
    * **Challenging Team Scoring:** >= 4 tricks = score tricks; < 4 tricks = 0 points.
    * Update `teams.current_score`, `game_rounds` in DB.
    * Emit `game:round_scores` to all.
* **6.5.2. "Crown Rule" Implementation:**
    * If Declaring Team won >= 5 tricks: Current trump declarer declares next.
    * If Declaring Team won < 5 tricks: Trump declaration passes to current dealer's left.
    * Determine next dealer (clockwise rotation).
    * Emit `game:next_round_dealer_trump_decider`.
* **6.5.3. Game Termination Check:**
    * After each round, check if any team `current_score >= 52`.
    * If so: Update `game.status` to 'completed', set `winning_team_id`. Update `users` stats.
    * Emit `game:game_over` to all.
    * If not: Start new round (increment `round_number`, reset trick counts, shuffle deck, deal).

---

## 7. Real-time Game State Synchronization (Socket.IO)

The backend acts as the authoritative source of truth. All state changes are processed by the server and then broadcast to relevant clients using Socket.IO rooms.

### 7.1. Client-to-Server Events (Player Actions)

* **`game:join_room`**: Client requests to join a specific game's WebSocket room after successfully joining via REST API.
    * Data: `{ gameId: string, userId: string, token: string }`
* **`player:declare_trump`**: First Player declares the trump suit.
    * Data: `{ gameId: string, userId: string, trumpSuit: string }`
* **`player:play_card`**: Current player plays a card.
    * Data: `{ gameId: string, userId: string, card: { suit: string, rank: string } }`
* **`player:leave_game`**: Player explicitly leaves a game.
    * Data: `{ gameId: string, userId: string }`

### 7.2. Server-to-Client Events (State Updates)

* **`game:state_update`**: Comprehensive update of the current game state. Sent upon joining a room, or after significant state changes (e.g., start of a new round).
    * Data:
        ```json
        {
            "gameId": "uuid",
            "status": "in_progress", // or waiting, completed
            "currentRound": {
                "roundNumber": 1,
                "dealerUserId": "uuid",
                "firstPlayerUserId": "uuid", // Player who declares trump
                "trumpSuit": "Hearts", // Null if not yet declared
                "declaringTeamId": "uuid",
                "currentTrick": {
                    "trickNumber": 1,
                    "leadingPlayerUserId": "uuid",
                    "cardsPlayed": [
                        { "userId": "uuid", "card": { "suit": "Spades", "rank": "A" } }
                    ]
                }
            },
            "players": [
                {
                    "userId": "uuid",
                    "username": "Player1",
                    "seatPosition": 1,
                    "teamId": "uuid",
                    "isCurrentTurn": true,
                    "hand": [], // Only for the specific client receiving this message
                    "tricksWonCurrentHand": 0
                }
            ],
            "teams": [
                {
                    "teamId": "uuid",
                    "teamNumber": 1,
                    "currentScore": 5,
                    "isDeclaringTeam": true
                }
            ],
            "gameMessages": []
        }
        ```
* **`game:trump_declared`**: Notifies all players that trump has been declared.
    * Data: `{ gameId: string, trumpSuit: string, declaringPlayerId: string }`
* **`game:card_played`**: Notifies all players that a card has been played.
    * Data: `{ gameId: string, userId: string, card: { suit: string, rank: string }, nextPlayerId: string }`
* **`game:trick_won`**: Notifies all players of the trick winner and updates trick count.
    * Data: `{ gameId: string, winnerUserId: string, winningCard: { suit: string, rank: string }, tricksWonByWinnerTeam: number, nextLeadingPlayerId: string }`
* **`game:round_scores`**: Notifies all players of the scores at the end of a round.
    * Data: `{ gameId: string, declaringTeamScore: number, challengingTeamScore: number, declaringTeamTricksWon: number, challengingTeamTricksWon: number, nextDealerId: string, nextTrumpDeciderId: string }`
* **`game:game_over`**: Notifies all players that the game has ended.
    * Data: `{ gameId: string, winningTeamId: string, finalScores: { team1Id: number, team2Id: number } }`
* **`game:player_left`**: Notifies players that a participant has left the game.
    * Data: `{ gameId: string, userId: string, reason: string }`
* **`game:error`**: Generic error message from server to client, typically for invalid actions.
    * Data: `{ code: string, message: string }`

---

## 8. Edge Cases and Error Handling Considerations

Robust error handling and consideration of edge cases are crucial for a smooth and fair real-time multiplayer game.

### 8.1. Frontend Error Handling

* **API Request Failures:** Display user-friendly error messages (e.g., "Network error, please try again," "Invalid credentials," "Game not found"). Implement retry mechanisms for transient errors.
* **Invalid User Input:** Client-side validation for login/registration forms with immediate feedback to the user.
* **Invalid Player Actions (Client-Side Validation):** Disable UI elements (e.g., cards in hand) when it's not the player's turn. Implement client-side logic to grey out or prevent selection of invalid cards based on current game rules. Display a local message.
* **WebSocket Connection Issues:** Socket.IO has built-in auto-reconnect. Display a "Reconnecting..." message. If reconnection fails, prompt the user to refresh.
* **Out-of-Sync State:** Rely on `game:state_update` events from the server to periodically re-synchronize the client's view.

### 8.2. Backend Error Handling

* **Database Errors:** Implement robust `try-catch` blocks around database operations. Log errors with sufficient detail. Return appropriate HTTP status codes (e.g., 500 Internal Server Error, 409 Conflict). Use database transactions for multi-step operations.
* **Invalid API Requests:** Use middleware for input validation (e.g., `express-validator`). Return 400 Bad Request with specific error details.
* **Authentication and Authorization Failures:** Implement JWT authentication middleware. Return 401 Unauthorized or 403 Forbidden.
* **Invalid Game Logic Actions (Server-Side Validation - Critical):** All player actions received via WebSocket *must* be thoroughly validated against the current authoritative game state on the server. If an action is invalid, send a specific error message back to the client (e.g., `socket.emit('game:error', { code: 'INVALID_MOVE', message: 'It is not your turn.' })`) and do *not* update the game state.
* **Player Disconnections During Game:**
    * **Graceful Disconnection:** Mark the player's status as 'disconnected'.
    * **Timeout/Forfeit:** Implement a timeout mechanism. If a disconnected player doesn't reconnect within a certain period, their team might forfeit the current round, or the game might be paused/cancelled.
    * **Notify Others:** Emit `game:player_disconnected` to other players in the room.
* **Concurrent Game Actions:** Use proper state management (e.g., a dedicated game manager class/module that processes actions sequentially for a given game) to prevent race conditions. Database transactions also help.
* **Server Crashes/Restarts:**
    * **Persistence:** Ensure critical game state is regularly persisted to PostgreSQL.
    * **Recovery:** Upon server restart, implement logic to identify `in_progress` games from the database and attempt to reconstruct their in-memory state. Notify connected clients to re-join their game rooms.
    * **Process Management:** Use a process manager like PM2.
* **Resource Management:** Monitor server performance. Implement proper cleanup for disconnected sockets and completed game sessions. Optimize database queries and game logic.