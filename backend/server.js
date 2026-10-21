require('dotenv').config();

const mongoose = require('mongoose');
const { createApp } = require('./app');
const Student = require('./models/Student');
const Counseling = require('./models/Counseling');

const PORT = Number(process.env.PORT || 5050);

async function start() {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error('Set JWT_SECRET to a random value of at least 32 characters before production startup.');
    }
    if (!process.env.FRONTEND_ORIGIN) {
      throw new Error('Set FRONTEND_ORIGIN to the deployed frontend origin before production startup.');
    }
  }

  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mentorSystem');
  console.log('MongoDB Connected');
  await migrateLegacyCounselingRecords();
  return createApp().listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

async function migrateLegacyCounselingRecords() {
  const legacyRecords = await Counseling.collection.find({
    $or: [{ student: { $exists: false } }, { type: { $exists: false } }]
  }).toArray();
  let migrated = 0;
  let unmatched = 0;

  for (const record of legacyRecords) {
    const student = await Student.findOne({ rollNo: record.studentRollNo }).select('_id');
    if (!student) {
      unmatched += 1;
      continue;
    }
    await Counseling.collection.updateOne(
      { _id: record._id },
      {
        $set: {
          student: student._id,
          type: record.interventionType ? 'intervention' : 'mentor_remark',
          createdByRole: 'mentor',
          createdByName: 'Mentor',
          remarks: record.remarks || 'Legacy mentoring record',
          date: record.date || record.createdAt || new Date(),
          interventionType: record.interventionType || ''
        }
      }
    );
    migrated += 1;
  }

  if (migrated) console.log(`Migrated ${migrated} legacy mentoring record(s).`);
  if (unmatched) console.warn(`${unmatched} legacy record(s) could not be linked to an imported student.`);
}

start().catch((error) => {
  console.error('Server startup failed:', error.message);
  process.exitCode = 1;
});
