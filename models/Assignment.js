const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
  },
  assignedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  swappedWith: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isSwapped: {
    type: Boolean,
    default: false
  },
  originalUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['completed', 'pending', 'skipped'],
    default: 'pending'
  },
  notes: String
}, {
  timestamps: true
});

// Compound index for unique assignments per date
assignmentSchema.index({ date: 1 }, { unique: true });

module.exports = mongoose.model('Assignment', assignmentSchema);