const mongoose = require('mongoose');
const User = require('./models/User');
const Assignment = require('./models/Assignment');

async function testRotation() {
  try {
    await mongoose.connect('mongodb://localhost:27017/lunch_paper');
    console.log('Connected to MongoDB\n');

    // Get all active users
    const activeUsers = await User.find({ active: true })
      .sort({ lastAssigned: 1, assignmentCount: 1, name: 1 });
    
    console.log('=== ACTIVE USERS (Sorted by Rotation Order) ===');
    activeUsers.forEach((u, i) => {
      console.log(`${i + 1}. ${u.name}`);
      console.log(`   ID: ${u._id}`);
      console.log(`   Last Assigned: ${u.lastAssigned}`);
      console.log(`   Assignment Count: ${u.assignmentCount}`);
      console.log();
    });

    // Get recent assignments
    const recentAssignments = await Assignment.find()
      .populate('assignedUser', 'name')
      .sort({ date: -1 })
      .limit(15);
    
    console.log('\n=== RECENT ASSIGNMENTS (Last 15) ===');
    recentAssignments.forEach(a => {
      console.log(`${a.date.toLocaleDateString('en-IN')}: ${a.assignedUser.name}`);
    });

    // Check if there are duplicate assignments on same dates
    const duplicates = await Assignment.aggregate([
      {
        $group: {
          _id: '$date',
          count: { $sum: 1 },
          users: { $push: '$assignedUser' }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]);

    if (duplicates.length > 0) {
      console.log('\n=== DUPLICATE ASSIGNMENTS FOUND ===');
      duplicates.forEach(d => {
        console.log(`Date ${d._id}: ${d.count} assignments`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

testRotation();
