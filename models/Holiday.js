const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Holiday', holidaySchema);
