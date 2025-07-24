/**
 * Room Manager
 * Handles room-related operations and API calls
 */

export class RoomManager {
    constructor() {
        this.apiBase = '/api';
    }

    /**
     * Get list of available rooms
     */
    async getRooms() {
        try {
            const response = await fetch(`${this.apiBase}/rooms`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch rooms');
            }

            const data = await response.json();
            return data.rooms || [];
        } catch (error) {
            console.error('Error fetching rooms:', error);
            throw error;
        }
    }

    /**
     * Create a new room
     */
    async createRoom(roomData) {
        try {
            const response = await fetch(`${this.apiBase}/rooms`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify(roomData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to create room');
            }

            const data = await response.json();
            return data.room;
        } catch (error) {
            console.error('Error creating room:', error);
            throw error;
        }
    }

    /**
     * Join an existing room
     */
    async joinRoom(roomId) {
        try {
            const response = await fetch(`${this.apiBase}/rooms/${roomId}/join`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to join room');
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error joining room:', error);
            throw error;
        }
    }

    /**
     * Leave a room
     */
    async leaveRoom(roomId) {
        try {
            const response = await fetch(`${this.apiBase}/rooms/${roomId}/leave`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to leave room');
            }

            return await response.json();
        } catch (error) {
            console.error('Error leaving room:', error);
            throw error;
        }
    }

    /**
     * Delete a room (owner only)
     */
    async deleteRoom(roomId) {
        try {
            const response = await fetch(`${this.apiBase}/rooms/${roomId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to delete room');
            }

            return await response.json();
        } catch (error) {
            console.error('Error deleting room:', error);
            throw error;
        }
    }

    /**
     * Get room details
     */
    async getRoomDetails(roomId) {
        try {
            const response = await fetch(`${this.apiBase}/rooms/${roomId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to get room details');
            }

            const data = await response.json();
            return data.room;
        } catch (error) {
            console.error('Error getting room details:', error);
            throw error;
        }
    }
}