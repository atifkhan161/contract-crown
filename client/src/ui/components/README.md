# UI Components

This directory contains modular UI components that have been extracted from the original WaitingRoomUI.js and waiting-room.js files to eliminate duplicate code and improve maintainability.

## File Structure

### Core Components
- **ConnectionStatusManager** - Connection status display and warnings
- **PlayerSlotManager** - Player slot rendering and updates  
- **ToastManager** - Toast notifications and messages
- **LoadingManager** - Loading states and overlays
- **ModalManager** - Modal dialogs and error displays
- **EventHandlerManager** - Event listeners and interactions
- **TeamManager** - Team formation and display
- **AccessibilityManager** - Accessibility features and keyboard navigation
- **ResponsiveLayoutManager** - Responsive design and mobile features

### Orchestrators
- **WaitingRoomOrchestrator** - Coordinates all UI components
- **WaitingRoomUI** - Backward compatibility wrapper

### Controllers  
- **WaitingRoomController** - Main application controller
- **SocketEventHandler** - WebSocket event handling
- **GameLogicManager** - Game logic and validation

## Benefits

1. **Minimal Code** - Each file contains only essential functionality
2. **Single Responsibility** - Each component has one clear purpose  
3. **No Duplication** - Shared logic extracted to reusable components
4. **Easy Testing** - Components can be tested in isolation
5. **Clear Names** - File names clearly indicate their content

## Usage

The original API is preserved through wrapper classes:

```javascript
// Still works exactly the same
import { WaitingRoomUI } from '../ui/WaitingRoomUI.js';
const ui = new WaitingRoomUI();
```

But now the implementation is modular and maintainable.