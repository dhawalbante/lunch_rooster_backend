const mongoose = require('mongoose');
const Assignment = require('./models/Assignment');
const User = require('./models/User');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lunch-roster').then(async () => {
  try {
    console.log('\n🔄 Rebalancing Assignments...\n');

    // Get all active users
    const activeUsers = await User.find({ active: true }).sort({ name: 1 });
    
    if (activeUsers.length === 0) {
      console.log('❌ No active users found');
      process.exit(1);
    }

    console.log(`Found ${activeUsers.length} active users`);
    
    // Get current assignments
    const currentAssignments = await Assignment.find({});
    console.log(`Current assignments: ${currentAssignments.length}`);

    // Reset all users' assignment counts and lastAssigned
    await User.updateMany(
      { active: true },
      { assignmentCount: 0, lastAssigned: null }
    );
    
    console.log('✅ Reset all user counters');

    // Delete all existing assignments
    await Assignment.deleteMany({});
    console.log('✅ Deleted all existing assignments');

    // Generate fair assignments for next 30 days
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    
    let assignmentCreated = 0;
    let userIndex = 0;
    let userRotationCycle = 0;

    for (let i = 0; i < 30; i++) {
      const checkDate = new Date(startDate);
      checkDate.setDate(checkDate.getDate() + i);

      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (checkDate.getDay() === 0 || checkDate.getDay() === 6) {
        continue;
      }

      // Rotate through users fairly
      const assignedUser = activeUsers[userIndex % activeUsers.length];
      
      const assignment = new Assignment({
        date: checkDate,
        assignedUser: assignedUser._id,
        status: 'pending'
      });

      await assignment.save();

      // Update user's assignment count
      await User.findByIdAndUpdate(assignedUser._id, {
        lastAssigned: checkDate,
        $inc: { assignmentCount: 1 }
      });

      assignmentCreated++;
      userIndex++;
    }

    console.log(`\n✅ Created ${assignmentCreated} fair assignments\n`);

    // Show new distribution
    const newDistribution = await Assignment.aggregate([
      {
        $group: {
          _id: '$assignedUser',
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $sort: { count: -1 } }
    ]);

    console.log('📊 New Assignment Distribution:');
    console.log('================================');
    
    newDistribution.forEach(item => {
      const userName = item.user[0]?.name || 'Unknown';
      const userEmail = item.user[0]?.email || 'Unknown';
      console.log(`${userName} (${userEmail}): ${item.count} assignments`);
    });
    
    console.log('================================\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}).catch(err => console.error('Connection error:', err));
