const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lunch-roster');
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'dhawal@gmail.com' });
    if (existingAdmin) {
      console.log('Admin user already exists');
      return;
    }

    // Create admin user
    const adminUser = new User({
      name: 'System Administrator',
      email: 'dhawal@gmail.com',
      password: 'Dhawal', // Will be hashed by the pre-save hook
      phone: '+919657379605',
      isAdmin: true,
      active: true
    });

    await adminUser.save();
    console.log('Admin user created successfully:');
    console.log('Email: dhawal@gmail.com');
    console.log('Password:dhawal');
    
  } catch (error) {
    console.error('Error seeding admin user:', error);
  } finally {
    await mongoose.connection.close();
  }
};

seedAdmin();