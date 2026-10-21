const mongoose = require('mongoose');

const homeworkSchema = new mongoose.Schema({
  mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentor', required: true, index: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  studentRollNo: { type: String, required: true, trim: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  instructions: { type: String, required: true, trim: true, maxlength: 5000 },
  dueDate: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Homework', homeworkSchema);