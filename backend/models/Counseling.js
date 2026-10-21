const mongoose = require('mongoose');
const counselingSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  studentRollNo: { type: String, required: true, index: true },
  type: {
    type: String,
    enum: ['counseling_session', 'mentor_remark', 'intervention', 'student_request'],
    required: true
  },
  date: { type: Date, default: Date.now, required: true },
  remarks: { type: String, required: true, trim: true, maxlength: 5000 },
  interventionType: { type: String, trim: true, maxlength: 120, default: '' },
  createdByRole: { type: String, enum: ['mentor', 'student'], required: true },
  createdByName: { type: String, required: true, trim: true }
}, { timestamps: true });
module.exports = mongoose.model('Counseling', counselingSchema);
