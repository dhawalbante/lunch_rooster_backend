const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
require('dotenv').config();

const isPasswordHashed = (password) => {
  // bcrypt hashed passwords start with $2a$, $2b$, or $2y$ prefix
  return password.startsWith('$2a$') || password.startsWith('$2b$') || password.startsWith('$2y$');
};

const hashPlainTextPasswords = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lunch-roster');
    console.log('Connected to MongoDB for password hashing migration.');

    const users = await User.find({});

    for (const user of users) {
      if (!isPasswordHashed(user.password)) {
        console.log(`Hashing password for user: ${user.email}`);

        const hashedPassword = await bcrypt.hash(user.password, 12);
        user.password = hashedPassword;
        await user.save();

        console.log(`Password hashed and updated for user: ${user.email}`);
      } else {
        console.log(`Password already hashed for user: ${user.email}, skipping.`);
      }
    }

    console.log('Password hashing migration completed.');
  } catch (error) {
    console.error('Error during password hashing migration:', error);
  } finally {
    await mongoose.disconnect();
  }
};

hashPlainTextPasswords();
