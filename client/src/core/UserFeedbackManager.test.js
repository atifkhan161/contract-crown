/**
 * Simple test for UserFeedbackManager
 * Tests basic functionality and integration
 * 
 * Requirements: 6.1, 6.2, 6.4
 */

import { UserFeedbackManager } from './UserFeedbackManager.js';

// Mock DOM environment for testing
global.document = {
    getElementById: jest.fn(),
    createElement: jest.fn(() => ({
        id: '',
        className: '',
        innerHTML: '',
        appendChild: jest.fn(),
        remove: jest.fn(),
        style: {},
        querySelectorAll: jest.fn(() => [])
    })),
    body: {
        appendChild: jest.fn()
    }
};

global.window = {
    addEventListener: jest.fn()
};

describe('UserFeedbackManager', () => {
    let feedbackManager;

    beforeEach(() => {
        feedbackManager = new UserFeedbackManager();
        jest.clearAllMocks();
    });

    afterEach(() => {
        feedbackManager.clearAllNotifications();
    });

    test('should initialize correctly', () => {
        expect(feedbackManager.notifications).toBeDefined();
        expect(feedbackManager.loadingStates).toBeDefined();
        expect(feedbackManager.notificationCounter).toBe(0);
    });

    test('should show error notification', () => {
        const id = feedbackManager.showError('Test error message');
        
        expect(id).toBe(1);
        expect(feedbackManager.notifications.has(1)).toBe(true);
        
        const notification = feedbackManager.notifications.get(1);
        expect(notification.message).toBe('Test error message');
        expect(notification.type).toBe('error');
    });

    test('should show success notification', () => {
        const id = feedbackManager.showSuccess('Test success message');
        
        expect(id).toBe(1);
        expect(feedbackManager.notifications.has(1)).toBe(true);
        
        const notification = feedbackManager.notifications.get(1);
        expect(notification.message).toBe('Test success message');
        expect(notification.type).toBe('success');
    });

    test('should show warning notification', () => {
        const id = feedbackManager.showWarning('Test warning message');
        
        expect(id).toBe(1);
        expect(feedbackManager.notifications.has(1)).toBe(true);
        
        const notification = feedbackManager.notifications.get(1);
        expect(notification.message).toBe('Test warning message');
        expect(notification.type).toBe('warning');
    });

    test('should show info notification', () => {
        const id = feedbackManager.showInfo('Test info message');
        
        expect(id).toBe(1);
        expect(feedbackManager.notifications.has(1)).toBe(true);
        
        const notification = feedbackManager.notifications.get(1);
        expect(notification.message).toBe('Test info message');
        expect(notification.type).toBe('info');
    });

    test('should remove notification', () => {
        const id = feedbackManager.showError('Test error');
        expect(feedbackManager.notifications.has(id)).toBe(true);
        
        feedbackManager.removeNotification(id);
        expect(feedbackManager.notifications.has(id)).toBe(false);
    });

    test('should clear all notifications', () => {
        feedbackManager.showError('Error 1');
        feedbackManager.showWarning('Warning 1');
        feedbackManager.showInfo('Info 1');
        
        expect(feedbackManager.notifications.size).toBe(3);
        
        feedbackManager.clearAllNotifications();
        expect(feedbackManager.notifications.size).toBe(0);
    });

    test('should manage loading states', () => {
        feedbackManager.showLoading('test-operation', 'Loading test...');
        
        expect(feedbackManager.isLoading('test-operation')).toBe(true);
        expect(feedbackManager.isLoading()).toBe(true);
        
        feedbackManager.hideLoading('test-operation');
        
        expect(feedbackManager.isLoading('test-operation')).toBe(false);
        expect(feedbackManager.isLoading()).toBe(false);
    });

    test('should limit number of notifications', () => {
        // Show more than max notifications
        for (let i = 0; i < 10; i++) {
            feedbackManager.showError(`Error ${i}`);
        }
        
        // Should not exceed max notifications
        expect(feedbackManager.notifications.size).toBeLessThanOrEqual(feedbackManager.maxNotifications);
    });

    test('should handle websocket errors', () => {
        const error = new Error('WebSocket connection failed');
        feedbackManager.handleWebsocketError(error, 'test-context');
        
        expect(feedbackManager.notifications.size).toBe(1);
        const notification = Array.from(feedbackManager.notifications.values())[0];
        expect(notification.type).toBe('error');
        expect(notification.message).toContain('Connection issue');
    });

    test('should handle authentication errors', () => {
        const error = new Error('Authentication failed');
        feedbackManager.handleAuthError(error, 'login');
        
        expect(feedbackManager.notifications.size).toBe(1);
        const notification = Array.from(feedbackManager.notifications.values())[0];
        expect(notification.type).toBe('error');
        expect(notification.message).toContain('Authentication failed');
    });

    test('should handle API errors', () => {
        const error = { status: 500, message: 'Server error' };
        feedbackManager.handleApiError(error, 'api-call');
        
        expect(feedbackManager.notifications.size).toBe(1);
        const notification = Array.from(feedbackManager.notifications.values())[0];
        expect(notification.type).toBe('error');
        expect(notification.message).toContain('Server error');
    });

    test('should handle room errors', () => {
        const error = new Error('Room operation failed');
        feedbackManager.handleRoomError(error, 'join');
        
        expect(feedbackManager.notifications.size).toBe(1);
        const notification = Array.from(feedbackManager.notifications.values())[0];
        expect(notification.type).toBe('error');
        expect(notification.message).toContain('Failed to join room');
    });

    test('should show connection status', () => {
        // Test connected status
        feedbackManager.showConnectionStatus(true, false);
        
        let notification = Array.from(feedbackManager.notifications.values()).find(n => n.type === 'success');
        expect(notification).toBeDefined();
        expect(notification.message).toBe('Connected');
        
        feedbackManager.clearAllNotifications();
        
        // Test disconnected status
        feedbackManager.showConnectionStatus(false, false);
        
        notification = Array.from(feedbackManager.notifications.values()).find(n => n.type === 'error');
        expect(notification).toBeDefined();
        expect(notification.message).toContain('Disconnected');
    });

    test('should get notification count', () => {
        feedbackManager.showError('Error 1');
        feedbackManager.showWarning('Warning 1');
        feedbackManager.showInfo('Info 1');
        
        expect(feedbackManager.getNotificationCount()).toBe(3);
        expect(feedbackManager.getNotificationCount('error')).toBe(1);
        expect(feedbackManager.getNotificationCount('warning')).toBe(1);
        expect(feedbackManager.getNotificationCount('info')).toBe(1);
        expect(feedbackManager.getNotificationCount('success')).toBe(0);
    });

    test('should clear notifications by type', () => {
        feedbackManager.showError('Error 1');
        feedbackManager.showWarning('Warning 1');
        feedbackManager.showInfo('Info 1');
        
        expect(feedbackManager.getNotificationCount()).toBe(3);
        
        feedbackManager.clearNotificationsByType('error');
        
        expect(feedbackManager.getNotificationCount()).toBe(2);
        expect(feedbackManager.getNotificationCount('error')).toBe(0);
        expect(feedbackManager.getNotificationCount('warning')).toBe(1);
        expect(feedbackManager.getNotificationCount('info')).toBe(1);
    });
});