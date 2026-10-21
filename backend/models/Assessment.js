const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  maxMarks: { type: Number, required: true, min: 1, max: 1000, default: 100 }
}, { _id: true });

const assessmentSchema = new mongoose.Schema({
  mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentor', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  subjects: {
    type: [subjectSchema],
    validate: {
      validator: (subjects) => subjects.length >= 1 && subjects.length <= 20,
      message: 'An assessment must have between 1 and 20 subjects.'
    }
  }
}, { timestamps: true });

const resultSchema = new mongoose.Schema({
  assessment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  studentRollNo: { type: String, required: true, trim: true },
  marks: [{
    subjectId: { type: mongoose.Schema.Types.ObjectId, required: true },
    score: { type: Number, required: true, min: 0, max: 1000 }
  }]
}, { timestamps: true });

resultSchema.index({ assessment: 1, student: 1 }, { unique: true });

module.exports = {
  Assessment: mongoose.model('Assessment', assessmentSchema),
  AssessmentResult: mongoose.model('AssessmentResult', resultSchema)
};
