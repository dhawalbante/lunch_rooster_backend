const express = require('express');
const User = require('../models/User');
const Assignment = require('../models/Assignment');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const { performRotation } = require('../utils/rotation');
const Holiday = require('../models/Holiday');
const { getUTCStartOfDay, getUTCEndOfDay } = require('../utils/dateHelper');

const router = express.Router();

// Admin middleware - check if user is admin
const adminAuth = [auth, (req, res, next) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}];

// Holiday routes

// GET all holidays
router.get('/holidays', adminAuth, async (req, res) => {
  try {
    const holidays = await Holiday.find().sort({ date: 1 });
    res.json(holidays);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching holidays' });
  }
});

// POST add new holiday
router.post('/holidays', [
  adminAuth,
  body('date').isISO8601().withMessage('Invalid date format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Normalize date to UTC start of day for consistent storage
    const holidayDate = getUTCStartOfDay(req.body.date);

    // Check if holiday already exists using UTC date range
    const startOfDay = getUTCStartOfDay(req.body.date);
    const endOfDay = getUTCEndOfDay(req.body.date);
    
    const existingHoliday = await Holiday.findOne({ date: { $gte: startOfDay, $lte: endOfDay } });
    if (existingHoliday) {
      return res.status(400).json({ message: 'Holiday already exists for this date' });
    }

    const holiday = new Holiday({
      date: holidayDate
    });

    await holiday.save();
    res.status(201).json(holiday);
  } catch (error) {
    res.status(500).json({ message: 'Error adding holiday' });
  }
});

// DELETE holiday by id
router.delete('/holidays/:id', adminAuth, async (req, res) => {
  try {
    const holiday = await Holiday.findByIdAndDelete(req.params.id);
    if (!holiday) {
      return res.status(404).json({ message: 'Holiday not found' });
    }
    res.json({ message: 'Holiday deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting holiday' });
  }
});

// Create new user (admin only)
router.post('/users', [
  adminAuth,
  body('name').trim().isLength({ min: 1 }),
  body('email').isEmail(),
  body('phone').optional().trim(),
  body('password').isLength({ min: 6 }),
  body('isAdmin').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, phone, password, isAdmin } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const user = new User({
      name,
      email,
      phone,
      password,
      isAdmin: isAdmin || false
    });

    await user.save();
    
    // Return user without password
    const userResponse = user.toObject();
    delete userResponse.password;
    
    res.status(201).json(userResponse);
  } catch (error) {
    res.status(500).json({ message: 'Error creating user' });
  }
});

// Get all users (admin only)
router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// Update user (admin only)
router.put('/users/:id', [
  adminAuth,
  body('name').optional().trim().isLength({ min: 1 }),
  body('email').optional().isEmail(),
  body('active').optional().isBoolean(),
  body('isAdmin').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error updating user' });
  }
});

// Delete user (admin only)
router.delete('/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting user' });
  }
});

// Update user sequence (admin only)
router.post('/users/update-sequence', adminAuth, async (req, res) => {
  try {
    const { updates } = req.body;
    
    if (!Array.isArray(updates)) {
      return res.status(400).json({ message: 'Updates must be an array' });
    }

    // Update each user's sequence
    const updatePromises = updates.map(({ userId, sequence }) =>
      User.findByIdAndUpdate(userId, { sequence }, { new: true })
    );

    await Promise.all(updatePromises);
    res.json({ message: 'User sequence updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating user sequence' });
  }
});

// Force rotation for a specific date
router.post('/rotate', [
  adminAuth,
  body('date').isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const assignment = await performRotation(new Date(req.body.date));
    res.json(assignment);
  } catch (error) {
    res.status(500).json({ message: 'Error performing rotation' });
  }
});

// Reset all assignments and rotation history (admin only)
router.post('/reset-rotation', adminAuth, async (req, res) => {
  try {
    // Delete all assignments from the future
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await Assignment.deleteMany({
      date: { $gte: today }
    });

    // Reset user assignment tracking
    await User.updateMany(
      {},
      { lastAssigned: null, assignmentCount: 0 }
    );

    res.json({ 
      message: 'Rotation history reset successfully',
      deletedAssignments: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({ message: 'Error resetting rotation' });
  }
});

module.exports = router;