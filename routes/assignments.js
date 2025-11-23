const express = require('express');
const Assignment = require('../models/Assignment');
const User = require('../models/User');
const Absence = require('../models/Absence');
const Holiday = require('../models/Holiday');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const { performRotation, getNextAssignment } = require('../utils/rotation');
const { getUTCStartOfDay, getUTCEndOfDay } = require('../utils/dateHelper');

const router = express.Router();

// Get assignments with filters
router.get('/', auth, async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;
    let filter = {};

    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (userId) {
      filter.assignedUser = userId;
    }

    const assignments = await Assignment.find(filter)
      .populate('assignedUser', 'name email')
      .populate('swappedWith', 'name email')
      .populate('originalUser', 'name email')
      .sort({ date: -1 });

    res.json(assignments);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching assignments' });
  }
});

// Get today's assignment
router.get('/today', auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Use a date range to avoid mismatches due to time components
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const assignment = await Assignment.findOne({ date: { $gte: startOfDay, $lte: endOfDay } })
      .populate('assignedUser', 'name email phone')
      .populate('swappedWith', 'name email phone');

    if (!assignment) {
      // Auto-assign for today if not exists
      const newAssignment = await getNextAssignment(today);
      return res.json(newAssignment);
    }

    res.json(assignment);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching today\'s assignment' });
  }
});

// Get upcoming assignments (next 5 working days)
router.get('/upcoming', auth, async (req, res) => {
  try {
    const { isWeekend } = require('date-fns');
    
    const upcomingAssignments = [];
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    
    // Find the most recent assignment (including today or before)
    const startOfToday = new Date(currentDate);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(currentDate);
    endOfToday.setHours(23, 59, 59, 999);
    
    // Check if today has an assignment
    const todayAssignment = await Assignment.findOne({
      date: { $gte: startOfToday, $lte: endOfToday }
    }).populate('assignedUser', 'sequence');
    
    // Find the most recent assignment up to and including today
    const lastSavedAssignment = await Assignment.findOne({ date: { $lte: endOfToday } })
      .sort({ date: -1 })
      .populate('assignedUser', 'sequence')
      .populate('originalUser', 'sequence');
    
    let rotationIndex = 0; // Which user in sequence will get next
    if (lastSavedAssignment && lastSavedAssignment.assignedUser) {
      // For rotation, use the ORIGINAL assigned user (not who swapped)
      // This ensures rotation order is based on the planned sequence, not who actually did it
      const userForRotation = lastSavedAssignment.isSwapped && lastSavedAssignment.originalUser 
        ? lastSavedAssignment.originalUser 
        : lastSavedAssignment.assignedUser;
      
      if (userForRotation && typeof userForRotation.sequence === 'number') {
        // Start from next user after the original assigned user
        rotationIndex = (userForRotation.sequence + 1);
      }
    }
    
    // Get all active users sorted by sequence
    const activeUsers = await User.find({ active: true }).sort({ sequence: 1 });
    const totalUsers = activeUsers.length;
    
    if (totalUsers === 0) {
      return res.json([]);
    }
    
    // Normalize rotationIndex to valid range
    rotationIndex = rotationIndex % totalUsers;
    
    let daysChecked = 0;
    const maxDaysToCheck = 30;

    // Generate assignments for next 5 working days
    while (upcomingAssignments.length < 5 && daysChecked < maxDaysToCheck) {
      const nextDate = new Date(currentDate);
      nextDate.setDate(nextDate.getDate() + 1);

      // Skip weekends
      if (isWeekend(nextDate)) {
        currentDate = nextDate;
        daysChecked++;
        continue;
      }

      // Check if it's a holiday
      const startOfDay = new Date(nextDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(nextDate);
      endOfDay.setHours(23, 59, 59, 999);

      const holiday = await Holiday.findOne({
        date: { $gte: startOfDay, $lte: endOfDay }
      });

      if (holiday) {
        upcomingAssignments.push({
          date: nextDate,
          isHoliday: true,
          assignedUser: null
        });
        currentDate = nextDate;
        daysChecked++;
        continue;
      }

      // Check if assignment already exists in DB
      const nextStart = new Date(nextDate);
      nextStart.setHours(0, 0, 0, 0);
      const nextEnd = new Date(nextDate);
      nextEnd.setHours(23, 59, 59, 999);

      let assignment = await Assignment.findOne({ date: { $gte: nextStart, $lte: nextEnd } })
        .populate('assignedUser', 'name email phone sequence')
        .populate('originalUser', 'sequence');

      if (assignment) {
        // Use the saved assignment
        upcomingAssignments.push({
          date: nextDate,
          isHoliday: false,
          assignedUser: assignment.assignedUser
        });
        // For rotation, use original assigned user (not the one who actually did it via swap)
        const userForRotation = assignment.isSwapped && assignment.originalUser 
          ? assignment.originalUser 
          : assignment.assignedUser;
        rotationIndex = (userForRotation.sequence + 1) % totalUsers;
      } else {
        // Check for absences on this date
        const absences = await Absence.find({ date: nextDate });
        const absentUserIds = absences.map(a => a.user.toString());

        // Find next available user starting from rotationIndex
        let foundUser = null;
        for (let attempt = 0; attempt < totalUsers; attempt++) {
          const userIndex = (rotationIndex + attempt) % totalUsers;
          const candidate = activeUsers[userIndex];
          if (!absentUserIds.includes(candidate._id.toString())) {
            foundUser = candidate;
            rotationIndex = (userIndex + 1) % totalUsers;
            break;
          }
        }

        if (foundUser) {
          upcomingAssignments.push({
            date: nextDate,
            isHoliday: false,
            assignedUser: {
              _id: foundUser._id,
              name: foundUser.name,
              email: foundUser.email,
              phone: foundUser.phone,
              sequence: foundUser.sequence
            }
          });
        } else {
          // All users are absent, skip this day
          currentDate = nextDate;
          daysChecked++;
          continue;
        }
      }
      
      currentDate = nextDate;
      daysChecked++;
    }

    res.json(upcomingAssignments);
  } catch (error) {
    console.error('Error fetching upcoming assignments:', error);
    res.status(500).json({ message: 'Error fetching upcoming assignments' });
  }
});

// Manual assignment override
router.post('/manual', [
  auth,
  body('date').notEmpty().withMessage('Date is required'),
  body('userId').isMongoId().withMessage('Valid userId is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { date, userId, notes } = req.body;

    // Normalize to UTC date range
    const manualStart = getUTCStartOfDay(date);
    const manualEnd = getUTCEndOfDay(date);

    // Check if it's a holiday
    const isHoliday = await Holiday.findOne({
      date: { $gte: manualStart, $lte: manualEnd }
    });

    if (isHoliday) {
      return res.status(400).json({ message: 'Cannot create assignment on a holiday' });
    }

    const existingAssignment = await Assignment.findOne({ date: { $gte: manualStart, $lte: manualEnd } });
    if (existingAssignment) {
      return res.status(400).json({ message: 'Assignment already exists for this date' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Save manual assignment with UTC start of day
    const storedDate = getUTCStartOfDay(date);

    const assignment = new Assignment({
      date: storedDate,
      assignedUser: userId,
      notes,
      status: 'pending'
    });

    await assignment.save();
    await assignment.populate('assignedUser', 'name email phone');

    res.status(201).json(assignment);
  } catch (error) {
    console.error('Manual assignment error:', error);
    res.status(500).json({ message: 'Error creating manual assignment' });
  }
});

// Swap assignment
router.post('/:id/swap', [
  auth,
  body('swapWithUserId').isMongoId()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Check if the assignment date is a holiday using UTC date range
    const startOfDay = getUTCStartOfDay(assignment.date);
    const endOfDay = getUTCEndOfDay(assignment.date);

    const isHoliday = await Holiday.findOne({
      date: { $gte: startOfDay, $lte: endOfDay }
    });

    if (isHoliday) {
      return res.status(400).json({ message: 'Cannot swap assignment on a holiday' });
    }

    const swapWithUser = await User.findById(req.body.swapWithUserId);
    if (!swapWithUser) {
      return res.status(404).json({ message: 'User to swap with not found' });
    }

    assignment.swappedWith = req.body.swapWithUserId;
    assignment.originalUser = assignment.assignedUser;
    assignment.assignedUser = req.body.swapWithUserId;
    assignment.isSwapped = true;

    await assignment.save();
    await assignment.populate('assignedUser', 'name email phone');
    await assignment.populate('originalUser', 'name email phone');
    await assignment.populate('swappedWith', 'name email phone');

    res.json(assignment);
  } catch (error) {
    res.status(500).json({ message: 'Error swapping assignment' });
  }
});

// Mark assignment as completed
router.patch('/:id/complete', auth, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate('assignedUser', 'name email phone')
      .populate('swappedWith', 'name email phone')
      .populate('originalUser', 'name email phone');

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Check if the assignment date is a holiday using UTC date range
    const startOfDay = getUTCStartOfDay(assignment.date);
    const endOfDay = getUTCEndOfDay(assignment.date);

    console.log(`[Holiday Check] Assignment date: ${assignment.date}, Start: ${startOfDay}, End: ${endOfDay}`);

    const isHoliday = await Holiday.findOne({
      date: { $gte: startOfDay, $lte: endOfDay }
    });

    console.log(`[Holiday Check] Is holiday: ${isHoliday ? 'YES' : 'NO'}`);
    if (isHoliday) {
      console.log(`[Holiday Check] Holiday found, blocking completion`);
      return res.status(400).json({ message: 'Cannot mark assignment as completed on a holiday' });
    }

    // Determine who actually completed the assignment
    let userWhoCompleted = assignment.assignedUser._id;
    if (assignment.isSwapped && assignment.swappedWith) {
      userWhoCompleted = assignment.swappedWith._id;
    }

    // Update assignment status
    assignment.status = 'completed';
    await assignment.save();

    // Update the user who actually completed it (increment assignmentCount)
    await User.findByIdAndUpdate(userWhoCompleted, {
      $inc: { assignmentCount: 1 }
    });

    // If it was swapped, also update the original assigned user to mark they didn't do it
    if (assignment.isSwapped && assignment.originalUser) {
      // We don't decrement, we just leave it as is (they were assigned but didn't do)
      console.log(`[Assignment Complete] Swapped: ${assignment.originalUser.name} was assigned but ${assignment.swappedWith.name} completed it`);
    }

    res.json(assignment);
  } catch (error) {
    console.error('Error completing assignment:', error);
    res.status(500).json({ message: 'Error updating assignment' });
  }
});

module.exports = router;