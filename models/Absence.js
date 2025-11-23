const mongoose = require('mongoose');

const absenceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  reason: String
}, {
  timestamps: true
});

// Compound index for unique absences per user per date
absenceSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Absence', absenceSchema);