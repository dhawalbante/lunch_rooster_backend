const express = require('express');
const User = require('../models/User');
const Assignment = require('../models/Assignment');
const Absence = require('../models/Absence');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all active users
router.get('/', auth, async (req, res) => {
  try {
    const users = await User.find({ active: true }).select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// Get user statistics
router.get('/:id/stats', auth, async (req, res) => {
  try {
    const { period } = req.query; // 'week' or 'month'
    const startDate = new Date();
    
    if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    }

    const assignments = await Assignment.find({
      assignedUser: req.params.id,
      date: { $gte: startDate }
    });

    res.json({
      totalAssignments: assignments.length,
      assignments
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user stats' });
  }
});

// Mark user absent for a date
router.post('/:id/absences', [
  auth,
  body('date').isISO8601(),
  body('reason').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const absence = new Absence({
      user: req.params.id,
      date: req.body.date,
      reason: req.body.reason
    });

    await absence.save();
    res.status(201).json(absence);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'User already marked absent for this date' });
    }
    res.status(500).json({ message: 'Error creating absence' });
  }
});

module.exports = router;