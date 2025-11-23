const mongoose = require('mongoose');
const { performRotation } = require('./utils/rotation');
const Assignment = require('./models/Assignment');
const Holiday = require('./models/Holiday');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lunch-roster').then(async () => {
  try {
    console.log('\n✅ Testing NEW Rotation Logic\n');

    // Get next 5 working days
    const { isWeekend } = require('date-fns');
    let testDates = [];
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    while (testDates.length < 5) {
      const nextDate = new Date(currentDate);
      nextDate.setDate(nextDate.getDate() + 1);

      if (!isWeekend(nextDate)) {
        // Check if holiday
        const startOfDay = new Date(nextDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(nextDate);
        endOfDay.setHours(23, 59, 59, 999);

        const holiday = await Holiday.findOne({
          date: { $gte: startOfDay, $lte: endOfDay }
        });

        testDates.push({
          date: nextDate,
          isHoliday: !!holiday
        });
      }
      currentDate = nextDate;
    }

    console.log('📅 Next 5 Working Days:');
    console.log('========================');

    for (const testDay of testDates) {
      try {
        const assignment = await performRotation(testDay.date);
        const dateStr = testDay.date.toLocaleDateString('en-IN', { 
          weekday: 'short', 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        });
        
        console.log(`${dateStr}: ${assignment.assignedUser.name}`);
      } catch (error) {
        console.error(`Error for date: ${testDay.date}`, error.message);
      }
    }

    console.log('========================\n');
    console.log('✅ Test completed!');
    console.log('\n📝 How it works now:');
    console.log('   • Assignments are created on-demand (not pre-generated)');
    console.log('   • Turn goes to whoever hasn\'t been assigned longest');
    console.log('   • If it\'s a holiday, assignment shifts to next working day');
    console.log('   • Upcoming endpoint shows next 5 users in order\n');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}).catch(err => console.error('Connection error:', err));
