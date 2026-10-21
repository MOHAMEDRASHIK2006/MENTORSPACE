const mongoose = require('mongoose');

const mentorshipRequestSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentor', required: true, index: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending', required: true },
  resolvedAt: { type: Date, default: null }
}, { timestamps: true });

mentorshipRequestSchema.index(
  { student: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

module.exports = mongoose.model('MentorshipRequest', mentorshipRequestSchema);
