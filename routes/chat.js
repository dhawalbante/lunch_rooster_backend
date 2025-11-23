const express = require('express');
const router = express.Router();
const ChatMessage = require('../models/ChatMessage');
const auth = require('../middleware/auth'); // Middleware for token verification

// Get recent chat messages, limit 50 by default
router.get('/messages', auth, async (req, res) => {
  try {
    const messages = await ChatMessage.find()
      .sort({ createdAt: 1 }) // oldest first
      .limit(50);
    res.json(messages);
  } catch (err) {
    console.error('Error fetching chat messages:', err);
    res.status(500).json({ message: 'Failed to fetch chat messages' });
  }
});

// Post a new chat message
router.post('/messages', auth, async (req, res) => {
  const { message } = req.body;
  if (!message || message.trim() === '') {
    return res.status(400).json({ message: 'Message content is required' });
  }

  try {
    const chatMessage = new ChatMessage({
      userId: req.user._id,
      username: req.user.name,
      message: message.trim(),
    });
    await chatMessage.save();
    res.status(201).json(chatMessage);
  } catch (err) {
    console.error('Error saving chat message:', err);
    res.status(500).json({ message: 'Failed to save chat message' });
  }
});

module.exports = router;
