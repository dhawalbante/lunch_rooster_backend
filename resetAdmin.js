const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lunch-roster');
    const email = 'dhawal@gmail.com';
    let user = await User.findOne({ email });
    if (!user) {
      user = new User({
        name: 'System Administrator',
        email,
        password: 'dhawal',
        phone: '+919657379605',
        isAdmin: true,
        active: true
      });
      await user.save();
      console.log('Admin user created/updated with password dhawal');
    } else {
      user.password = 'dhawal';
      user.markModified && user.markModified('password');
      await user.save();
      console.log('Admin user password reset to dhawal');
    }
  } catch (err) {
    console.error('Error resetting admin:', err);
  } finally {
    await mongoose.connection.close();
  }
};

run();
