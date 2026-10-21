const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  studentRollNo: { type: String, required: true, trim: true, index: true },
  mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentor', required: true, index: true },
  date: { type: Date, required: true },
  slot: { type: String, required: true, enum: ['08:00-10:00', '10:30-12:30', '13:30-15:30'] },
  status: { type: String, required: true, enum: ['present', 'absent', 'od'] }
}, { timestamps: true });

attendanceSchema.index({ student: 1, date: 1, slot: 1 }, { unique: true });
attendanceSchema.index({ mentor: 1, date: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
