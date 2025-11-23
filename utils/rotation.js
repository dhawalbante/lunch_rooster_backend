const User = require('../models/User');
const Assignment = require('../models/Assignment');
const Absence = require('../models/Absence');
const Holiday = require('../models/Holiday');

class RotationAlgorithm {
  constructor() {
    this.rotationOrder = [];
  }

  async initializeRotationOrder() {
    // Get all active users sorted by last assigned date (least recently assigned first)
    const activeUsers = await User.find({ active: true })
      .sort({ lastAssigned: 1, assignmentCount: 1, name: 1 });
    
    this.rotationOrder = activeUsers.map(user => user._id);
    return this.rotationOrder;
  }

  async getNextUser(date) {
    // Sequence-based rotation (circular). Start from sequence 0 if no prior assignments.
    // Get all active users sorted by sequence ascending
    const activeUsers = await User.find({ active: true }).sort({ sequence: 1, name: 1 });

    if (activeUsers.length === 0) {
      throw new Error('No active users available for rotation');
    }

    // Get absences for the date
    const absences = await Absence.find({ date });
    const absentUserIds = absences.map(absence => absence.user.toString());

    // Build an ordered list of available users (by sequence)
    const orderedAvailable = activeUsers.filter(u => !absentUserIds.includes(u._id.toString()));

    if (orderedAvailable.length === 0) {
      throw new Error('No available users for this date (all are absent)');
    }

    // Find the most recent assignment strictly before the requested date
    const lastAssignment = await Assignment.findOne({ date: { $lt: new Date(date) } }).sort({ date: -1 }).populate('assignedUser', 'sequence');

    let startIndex = 0; // default start at sequence 0
    if (lastAssignment && lastAssignment.assignedUser && typeof lastAssignment.assignedUser.sequence === 'number') {
      // Find index of last assigned user's sequence in orderedAvailable
      const lastSeq = lastAssignment.assignedUser.sequence;
      const idx = orderedAvailable.findIndex(u => u.sequence === lastSeq);
      // Start from the next index after the last assigned
      startIndex = idx >= 0 ? (idx + 1) % orderedAvailable.length : 0;
    }

    // Walk the orderedAvailable list starting from startIndex to find the first available user
    for (let i = 0; i < orderedAvailable.length; i++) {
      const candidate = orderedAvailable[(startIndex + i) % orderedAvailable.length];
      if (candidate) {
        console.log(`[Rotation] Date: ${date}, Next User: ${candidate.name}, Sequence: ${candidate.sequence}`);
        return candidate._id;
      }
    }

    // Fallback
    return orderedAvailable[0]._id;
  }

  // Preview next user for a date without creating/saving an assignment
  // This needs to handle holidays by finding the actual working day that will be assigned
  async previewNextUser(date, checkForHoliday = true) {
    let checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    
    // If checkForHoliday is true, skip holidays to find actual working day
    if (checkForHoliday) {
      const { isWeekend } = require('date-fns');
      let foundWorkingDay = false;
      const maxDaysToCheck = 30;
      let daysChecked = 0;
      
      while (!foundWorkingDay && daysChecked < maxDaysToCheck) {
        if (isWeekend(checkDate)) {
          checkDate.setDate(checkDate.getDate() + 1);
          daysChecked++;
          continue;
        }
        
        const startOfDay = new Date(checkDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(checkDate);
        endOfDay.setHours(23, 59, 59, 999);
        
        const holiday = await Holiday.findOne({
          date: { $gte: startOfDay, $lte: endOfDay }
        });
        
        if (!holiday) {
          foundWorkingDay = true;
          break;
        }
        
        checkDate.setDate(checkDate.getDate() + 1);
        daysChecked++;
      }
      
      if (!foundWorkingDay) {
        throw new Error('No working days found for preview');
      }
    }
    
    // Now get the next user for this working day
    const userId = await this.getNextUser(checkDate);
    const user = await User.findById(userId).select('name email phone sequence');
    return user;
  }

  async findNextAvailableDate(startDate, daysToCheck = 30) {
    // This function finds the next working day that is not a weekend or holiday
    const { isWeekend } = require('date-fns');
    let currentDate = new Date(startDate);
    
    for (let i = 0; i < daysToCheck; i++) {
      const checkDate = new Date(currentDate);
      checkDate.setDate(checkDate.getDate() + 1);
      
      // Skip weekends
      if (isWeekend(checkDate)) {
        currentDate = checkDate;
        continue;
      }
      
      // Check if it's a holiday
      const startOfDay = new Date(checkDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(checkDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      const holiday = await Holiday.findOne({
        date: { $gte: startOfDay, $lte: endOfDay }
      });
      
      if (!holiday) {
        return checkDate;
      }
      
      currentDate = checkDate;
    }
    
    throw new Error('No available working days found in the next ' + daysToCheck + ' days');
  }

  async performRotation(date, isHolidaySkip = false) {
    try {
      // Normalize to start/end of day and check if assignment already exists for this date
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      let existingAssignment = await Assignment.findOne({
        date: { $gte: startOfDay, $lte: endOfDay }
      });
      if (existingAssignment) {
        return existingAssignment.populate('assignedUser', 'name email phone');
      }

      // Check if it's a holiday (use the same start/end of day computed above)
      const holiday = await Holiday.findOne({
        date: { $gte: startOfDay, $lte: endOfDay }
      });

      if (holiday) {
        // If it's a holiday, shift to next available working day
        const nextAvailableDate = await this.findNextAvailableDate(date);
        
        // Mark that this is a holiday skip so we advance rotation
        return await this.performRotation(nextAvailableDate, true);
      }

      // Get next user for this date
      // If this is a holiday skip, we need to get the NEXT user after the last assignment
      let nextUserId;
      if (isHolidaySkip) {
        // For holiday skip: find last assignment and advance to next user
        const activeUsers = await User.find({ active: true }).sort({ sequence: 1, name: 1 });
        const absences = await Absence.find({ date });
        const absentUserIds = absences.map(absence => absence.user.toString());
        const orderedAvailable = activeUsers.filter(u => !absentUserIds.includes(u._id.toString()));

        if (orderedAvailable.length === 0) {
          throw new Error('No available users for this date (all are absent)');
        }

        // Find the most recent assignment strictly before this date
        const lastAssignment = await Assignment.findOne({ date: { $lt: new Date(date) } }).sort({ date: -1 }).populate('assignedUser', 'sequence');
        
        let startIndex = 0;
        if (lastAssignment && lastAssignment.assignedUser && typeof lastAssignment.assignedUser.sequence === 'number') {
          const lastSeq = lastAssignment.assignedUser.sequence;
          const idx = orderedAvailable.findIndex(u => u.sequence === lastSeq);
          startIndex = idx >= 0 ? (idx + 1) % orderedAvailable.length : 0;
        }

        // Get next user from startIndex
        for (let i = 0; i < orderedAvailable.length; i++) {
          const candidate = orderedAvailable[(startIndex + i) % orderedAvailable.length];
          if (candidate) {
            nextUserId = candidate._id;
            break;
          }
        }
      } else {
        nextUserId = await this.getNextUser(date);
      }

      // store the assignment date normalized to start of day
      const storedDate = new Date(date);
      storedDate.setHours(0, 0, 0, 0);

      const assignment = new Assignment({
        date: storedDate,
        assignedUser: nextUserId,
        status: 'pending'
      });

      await assignment.save();

      // Update user's last assigned date (but DON'T increment count - that happens on completion)
      await User.findByIdAndUpdate(nextUserId, {
        lastAssigned: storedDate
      });

      await assignment.populate('assignedUser', 'name email phone');
      return assignment;
    } catch (error) {
      throw new Error(`Rotation failed: ${error.message}`);
    }
  }
}

const rotationAlgorithm = new RotationAlgorithm();

// Export functions
exports.performRotation = (date) => rotationAlgorithm.performRotation(date);
exports.getNextAssignment = (date) => rotationAlgorithm.performRotation(date);
exports.RotationAlgorithm = RotationAlgorithm;
exports.previewNextUser = (date) => rotationAlgorithm.previewNextUser(date);
exports.rotationAlgorithm = rotationAlgorithm;