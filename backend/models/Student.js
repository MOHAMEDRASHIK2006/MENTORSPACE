const mongoose = require('mongoose');
const studentSchema = new mongoose.Schema({
  rollNo: { type: String, required: true, unique: true, trim: true, index: true },
  name: { type: String, required: true, trim: true },
  dateOfBirth: { type: Date, select: false },
  department: { type: String, default: '', trim: true, maxlength: 120 },
  section: { type: String, default: '', trim: true, maxlength: 40 },
  mobileNumber: { type: String, default: '', trim: true, maxlength: 20 },
  email: { type: String, default: undefined, lowercase: true, trim: true, maxlength: 254, sparse: true, unique: true },
  attendance: { type: Number, required: true, min: 0, max: 100 },
  marks: { type: Number, required: true, min: 0, max: 100 },
  totalMarks: { type: Number, default: 0, min: 0 },
  totalSubjects: { type: Number, default: 0, min: 0 },
  subjectMarks: [{
    subject: { type: String, required: true, trim: true, maxlength: 100 },
    score: { type: Number, required: true, min: 0, max: 1000 }
  }],
  passwordHash: { type: String, default: null, select: false },
  mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentor', default: null, index: true },
  mustChangePassword: { type: Boolean, default: true },
  manuallyFlagged: { type: Boolean, default: false },
  manualFlagReason: { type: String, default: '', trim: true, maxlength: 500 }
}, { timestamps: true });
module.exports = mongoose.model('Student', studentSchema);
