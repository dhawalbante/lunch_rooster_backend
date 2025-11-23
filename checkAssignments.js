const mongoose = require('mongoose');
const Assignment = require('./models/Assignment');
const User = require('./models/User');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lunch-roster').then(async () => {
  try {
    // Get all assignments grouped by user
    const assignmentCounts = await Assignment.aggregate([
      {
        $group: {
          _id: '$assignedUser',
          count: { $sum: 1 },
          dates: { $push: '$date' }
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

    console.log('\n📊 Assignment Distribution:');
    console.log('================================');
    
    const totalAssignments = await Assignment.countDocuments();
    const totalUsers = assignmentCounts.length;
    const activeUsers = await User.countDocuments({ active: true });
    
    if (totalAssignments === 0) {
      console.log('No assignments found in the database.');
      console.log(`Active Users: ${activeUsers}`);
      console.log('\nRun the rotation to generate assignments.');
    } else {
      assignmentCounts.forEach(item => {
        const userName = item.user[0]?.name || 'Unknown';
        const userEmail = item.user[0]?.email || 'Unknown';
        const percentage = ((item.count / totalAssignments) * 100).toFixed(1);
        console.log(`${userName} (${userEmail}): ${item.count} assignments (${percentage}%)`);
      });
      
      console.log('================================');
      console.log(`Total Assignments: ${totalAssignments}`);
      console.log(`Total Active Users: ${activeUsers}`);
      console.log(`Users with assignments: ${totalUsers}`);
      console.log(`Average per user (actual): ${(totalAssignments/totalUsers).toFixed(1)}`);
      console.log(`Expected average: ${(totalAssignments/activeUsers).toFixed(1)}`);
      
      // Check if one user has all or majority of assignments
      if (assignmentCounts.length > 0) {
        const topUser = assignmentCounts[0];
        const topUserPercentage = (topUser.count / totalAssignments) * 100;
        const userName = topUser.user[0]?.name || 'Unknown';
        const userEmail = topUser.user[0]?.email || 'Unknown';
        
        console.log('\n' + '='.repeat(50));
        if (topUser.count === totalAssignments) {
          console.log(`❌ CRITICAL: All ${totalAssignments} assignments are given to ONE user!`);
          console.log(`   User: ${userName} (${userEmail})`);
        } else if (topUserPercentage > 80) {
          console.log(`⚠️  WARNING: User "${userName}" has ${topUserPercentage.toFixed(1)}% of assignments`);
        } else {
          console.log(`✅ Assignments are distributed fairly`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}).catch(err => console.error('Connection error:', err));
