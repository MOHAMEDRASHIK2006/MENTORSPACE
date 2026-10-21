const mongoose = require('mongoose');

const mentorSchema = new mongoose.Schema({
  mentorId: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
  username: { type: String, default: undefined, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  dateOfBirth: { type: Date, required: true, select: false },
  gender: { type: String, enum: ['female', 'male', 'non_binary', 'prefer_not_to_say'], required: true },
  department: { type: String, required: true, trim: true, maxlength: 120 },
  mobileNumber: { type: String, required: true, trim: true, maxlength: 20 },
  passwordHash: { type: String, required: true, select: false }
}, { timestamps: true });

module.exports = mongoose.model('Mentor', mentorSchema);
