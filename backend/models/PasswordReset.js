const mongoose = require('mongoose');

const passwordResetSchema = new mongoose.Schema({
  accountId: { type: mongoose.Schema.Types.ObjectId, required: true },
  role: { type: String, required: true, enum: ['mentor', 'student'] },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, expires: 0 }
}, { timestamps: true });

passwordResetSchema.index({ accountId: 1, role: 1 });

module.exports = mongoose.model('PasswordReset', passwordResetSchema);
