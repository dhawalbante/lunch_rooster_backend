const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lunch-roster');
    const email = 'dhawal@gmail.com';
    const user = await User.findOne({ email }).lean();
    if (!user) {
      console.log('User not found');
      return;
    }
    console.log('Stored hash for user:', user.password);
    const ok = await bcrypt.compare('dhawal', user.password);
    console.log('bcrypt.compare result for "dhawal":', ok);
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.connection.close();
  }
})();
