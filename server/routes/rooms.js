import express from 'express';
import Room from '../models/Room.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Get all available rooms
router.get('/', auth, async (req, res) => {
    try {
        const rooms = await Room.findAll(['waiting', 'playing']);

        res.json({
            success: true,
            rooms: rooms.map(room => room.toApiResponse())
        });
    } catch (error) {
        console.error('Error fetching rooms:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch rooms'
        });
    }
});

// Create a new room
router.post('/', auth, async (req, res) => {
    try {
        const { name, maxPlayers, isPrivate } = req.body;
        const userId = req.user.id;

        // Validate input
        if (!Room.validateName(name)) {
            return res.status(400).json({
                success: false,
                message: 'Room name is required and must be 50 characters or less'
            });
        }

        if (!Room.validateMaxPlayers(maxPlayers)) {
            return res.status(400).json({
                success: false,
                message: 'Max players must be between 2 and 6'
            });
        }

        // Check if user already has an active room
        const existingRoom = await Room.findUserActiveRoom(userId);
        if (existingRoom) {
            return res.status(400).json({
                success: false,
                message: 'You already have an active room'
            });
        }

        // Create new room
        const room = await Room.create({
            name,
            maxPlayers,
            isPrivate,
            ownerId: userId
        });

        // Emit room created event to all clients
        req.io.emit('roomCreated', room.toApiResponse());

        res.status(201).json({
            success: true,
            message: 'Room created successfully',
            room: room.toApiResponse()
        });
    } catch (error) {
        console.error('Error creating room:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create room'
        });
    }
});

// Join a room
router.post('/:roomId/join', auth, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.id;

        const room = await Room.findById(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }

        // Check if user is already in another room
        const existingRoom = await Room.findUserActiveRoom(userId);
        if (existingRoom && existingRoom.room_id !== roomId) {
            return res.status(400).json({
                success: false,
                message: 'You are already in another room'
            });
        }

        // Add user to room (this will validate if user can join)
        await room.addPlayer(userId);

        // Emit player joined event
        req.io.to(`room_${roomId}`).emit('playerJoined', {
            roomId: room.room_id,
            player: {
                id: userId,
                username: req.user.username
            },
            players: room.players
        });

        // Emit rooms updated event to all clients
        const allRooms = await Room.findAll(['waiting', 'playing']);
        req.io.emit('roomsUpdated', allRooms.map(r => r.toApiResponse()));

        res.json({
            success: true,
            message: 'Joined room successfully',
            roomId: room.room_id,
            room: room.toApiResponse()
        });
    } catch (error) {
        console.error('Error joining room:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to join room'
        });
    }
});

// Leave a room
router.post('/:roomId/leave', auth, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.id;

        const room = await Room.findById(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }

        // Remove user from room (this handles owner reassignment)
        await room.removePlayer(userId);

        // If no players left, delete the room
        if (room.players.length === 0) {
            await room.delete();
            
            // Emit room deleted event
            req.io.emit('roomDeleted', { roomId });
        } else {
            // Emit player left event
            req.io.to(`room_${roomId}`).emit('playerLeft', {
                roomId: room.room_id,
                playerId: userId,
                players: room.players,
                newOwner: room.owner_id
            });
        }

        // Emit rooms updated event to all clients
        const allRooms = await Room.findAll(['waiting', 'playing']);
        req.io.emit('roomsUpdated', allRooms.map(r => r.toApiResponse()));

        res.json({
            success: true,
            message: 'Left room successfully'
        });
    } catch (error) {
        console.error('Error leaving room:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to leave room'
        });
    }
});

// Delete a room (owner only)
router.delete('/:roomId', auth, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.id;

        const room = await Room.findById(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }

        // Check if user is the room owner
        if (room.owner_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Only room owner can delete the room'
            });
        }

        // Delete the room
        await room.delete();

        // Emit room deleted event
        req.io.emit('roomDeleted', { roomId });

        // Emit rooms updated event to all clients
        const allRooms = await Room.findAll(['waiting', 'playing']);
        req.io.emit('roomsUpdated', allRooms.map(r => r.toApiResponse()));

        res.json({
            success: true,
            message: 'Room deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting room:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete room'
        });
    }
});

// Get room details
router.get('/:roomId', auth, async (req, res) => {
    try {
        const { roomId } = req.params;

        const room = await Room.findById(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found'
            });
        }

        res.json({
            success: true,
            room: room.toApiResponse()
        });
    } catch (error) {
        console.error('Error fetching room details:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch room details'
        });
    }
});

export default router;