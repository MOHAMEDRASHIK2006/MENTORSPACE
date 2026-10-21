require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const crypto = require('crypto');
const Student = require('./models/Student');
const Mentor = require('./models/Mentor');
const Counseling = require('./models/Counseling');
const MentorshipRequest = require('./models/MentorshipRequest');
const Attendance = require('./models/Attendance');
const Homework = require('./models/Homework');
const { Assessment, AssessmentResult } = require('./models/Assessment');
const PasswordReset = require('./models/PasswordReset');
const { HttpError, asyncHandler } = require('./lib/errors');
const { parseStudentWorkbook, isAtRisk, getFlagReasons } = require('./lib/studentImport');
const { requireAuth, requireRole } = require('./middleware/auth');

const PASSWORD_MIN_LENGTH = 10;
const ATTENDANCE_SLOTS = ['08:00-10:00', '10:30-12:30', '13:30-15:30'];
const tokenSecret = () => process.env.JWT_SECRET || 'local-development-only-change-me';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!/\.xlsx$/i.test(file.originalname)) {
      return callback(new HttpError(400, 'Choose an Excel .xlsx file.'));
    }
    callback(null, true);
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Wait 15 minutes and try again.' }
});
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many password recovery attempts. Try again in an hour.' }
});

function passwordError(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return 'Password must be no longer than 72 bytes.';
  }
  return null;
}

function validateHomeworkInput(input) {
  const rollNo = typeof input?.rollNo === 'string' ? input.rollNo.trim() : '';
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  const instructions = typeof input?.instructions === 'string' ? input.instructions.trim() : '';
  if (!rollNo || rollNo.length > 60) return 'Choose a student from your roster.';
  if (!title || title.length > 120) return 'Enter a homework title up to 120 characters.';
  if (!instructions || instructions.length > 5000) return 'Enter homework instructions up to 5,000 characters.';
  if (input.dueDate !== undefined && input.dueDate !== null && input.dueDate !== '' && !parseDay(input.dueDate)) {
    return 'Enter a valid homework due date.';
  }
  return null;
}

function parseDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function validateProfile(profile, { mentor = false } = {}) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return 'Provide all required profile information.';
  }
  const { name, dateOfBirth, email, mobileNumber, department, section, gender } = profile;
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 120) {
    return 'Enter a name between 2 and 120 characters.';
  }
  if (typeof dateOfBirth !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    return 'Enter your date of birth in YYYY-MM-DD format.';
  }
  const parsedDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dateOfBirth) {
    return 'Enter a valid date of birth.';
  }
  if (dateOfBirth >= new Date().toISOString().slice(0, 10)) return 'Date of birth must be in the past.';
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254) {
    return 'Enter a valid email address.';
  }
  if (typeof mobileNumber !== 'string' || !/^\+?[\d\s()-]{7,20}$/.test(mobileNumber.trim())) {
    return 'Enter a valid mobile number.';
  }
  if (typeof department !== 'string' || department.trim().length < 2 || department.trim().length > 120) {
    return 'Enter a department between 2 and 120 characters.';
  }
  if (mentor) {
    if (!['female', 'male', 'non_binary', 'prefer_not_to_say'].includes(gender)) {
      return 'Choose a gender.';
    }
    if (typeof profile.mentorId !== 'string' || profile.mentorId.trim().length < 1 || profile.mentorId.trim().length > 60) {
      return 'Enter a Mentor ID between 1 and 60 characters.';
    }
  } else if (typeof section !== 'string' || section.trim().length < 1 || section.trim().length > 40) {
    return 'Enter a section of 1-40 characters.';
  }
  return null;
}

function toStudentView(student) {
  return {
    _id: student._id,
    rollNo: student.rollNo,
    name: student.name,
    department: student.department,
    section: student.section,
    email: student.email,
    mobileNumber: student.mobileNumber,
    isAssignedToMentor: Boolean(student.mentor),
    attendance: student.attendance,
    marks: student.marks,
    totalMarks: student.totalMarks ?? student.marks,
    totalSubjects: student.totalSubjects || 0,
    subjectMarks: student.subjectMarks || [],
    isFlagged: isAtRisk(student),
    flagReasons: getFlagReasons(student),
    manuallyFlagged: student.manuallyFlagged,
    manualFlagReason: student.manualFlagReason,
    updatedAt: student.updatedAt
  };
}

function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({
    origin: process.env.FRONTEND_ORIGIN
      ? process.env.FRONTEND_ORIGIN.split(',').map((value) => value.trim())
      : true
  }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  app.post('/api/auth/login', authLimiter, asyncHandler(async (req, res) => {
    const { role, identifier, password } = req.body || {};
    if (!['mentor', 'student'].includes(role) || typeof identifier !== 'string' || typeof password !== 'string') {
      throw new HttpError(400, 'Choose a role and provide your email address or registration number and password.');
    }

    const account = role === 'mentor'
      ? await Mentor.findOne({
          $or: [
            { email: identifier.trim().toLowerCase() },
            { mentorId: identifier.trim().toUpperCase() }
          ]
        }).select('+passwordHash')
      : await Student.findOne({ rollNo: identifier.trim() }).select('+passwordHash');
    if (!account || !account.passwordHash || !(await bcrypt.compare(password, account.passwordHash))) {
      throw new HttpError(401, 'The role, email/registration number, or password is incorrect.');
    }

    const user = role === 'mentor'
      ? {
          id: account.id,
          role,
          name: account.name,
          email: account.email,
          mentorId: account.mentorId,
          mustChangePassword: false
        }
      : {
          id: account.id,
          role,
          name: account.name,
          rollNo: account.rollNo,
          mustChangePassword: account.mustChangePassword
        };
    const token = jwt.sign(
      { sub: user.id, role, ...(role === 'student' ? { rollNo: user.rollNo } : {}) },
      tokenSecret(),
      { expiresIn: '8h' }
    );
    res.json({ token, user });
  }));

  app.post('/api/auth/password-reset/request', passwordResetLimiter, asyncHandler(async (req, res) => {
    const { role, email } = req.body || {};
    if (!['mentor', 'student'].includes(role) || typeof email !== 'string'
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      throw new HttpError(400, 'Choose your account type and enter a valid account email address.');
    }
    if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) {
      return res.status(503).json({ error: 'Password recovery email is not configured. Contact the administrator.' });
    }

    const Model = role === 'mentor' ? Mentor : Student;
    const account = await Model.findOne({ email: email.trim().toLowerCase() }).select('_id email');
    if (account) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await PasswordReset.deleteMany({ accountId: account._id, role });
      await PasswordReset.create({
        accountId: account._id,
        role,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });

      const resetUrl = new URL('/reset-password', process.env.FRONTEND_URL || 'http://localhost:3000');
      resetUrl.searchParams.set('token', token);
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        ...(process.env.SMTP_USER ? {
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
        } : {})
      });
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM,
          to: account.email,
          subject: 'Reset your MentorSpace password',
          text: `Use this link to reset your password within 30 minutes:\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
          html: `<p>Use this link to reset your MentorSpace password within 30 minutes:</p><p><a href="${resetUrl}">Reset password</a></p><p>If you did not request this, ignore this email.</p>`
        });
      } catch (error) {
        await PasswordReset.deleteOne({ tokenHash });
        console.error('Password reset email delivery failed:', error.message);
      }
    }
    res.status(202).json({ message: 'If an account matches that email, password reset instructions will be sent.' });
  }));

  app.post('/api/auth/password-reset/confirm', passwordResetLimiter, asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body || {};
    const error = passwordError(newPassword);
    if (error) throw new HttpError(400, error);
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      throw new HttpError(400, 'This password reset link is invalid or expired. Request a new link.');
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const reset = await PasswordReset.findOneAndDelete({
      tokenHash,
      expiresAt: { $gt: new Date() }
    });
    if (!reset) throw new HttpError(400, 'This password reset link is invalid or expired. Request a new link.');

    const Model = reset.role === 'mentor' ? Mentor : Student;
    const account = await Model.findById(reset.accountId);
    if (!account) throw new HttpError(400, 'This password reset link is invalid or expired. Request a new link.');
    account.passwordHash = await bcrypt.hash(newPassword, 12);
    if (reset.role === 'student') account.mustChangePassword = false;
    await account.save();
    await PasswordReset.deleteMany({ accountId: reset.accountId, role: reset.role });
    res.json({ message: 'Password reset successfully. You can now sign in.' });
  }));

  app.post('/api/auth/signup', authLimiter, asyncHandler(async (req, res) => {
    const { role, password, ...profile } = req.body || {};
    if (!['mentor', 'student'].includes(role)) {
      throw new HttpError(400, 'Choose Mentor or Student to create your account.');
    }
    const profileError = validateProfile(profile, { mentor: role === 'mentor' });
    if (profileError) throw new HttpError(400, profileError);
    const passwordValidationError = passwordError(password);
    if (passwordValidationError) throw new HttpError(400, passwordValidationError);

    const email = profile.email.trim().toLowerCase();
    const emailExists = await Promise.all([
      Mentor.exists({ email }),
      Student.exists({ email })
    ]);
    if (emailExists.some(Boolean)) throw new HttpError(409, 'An account already exists for that email address. Sign in instead.');

    let account;
    let user;
    if (role === 'mentor') {
      const mentorId = profile.mentorId.trim().toUpperCase();
      if (await Mentor.exists({ mentorId })) {
        throw new HttpError(409, 'That Mentor ID is already in use. Choose a different ID.');
      }
      account = await Mentor.create({
        mentorId,
        username: mentorId,
        name: profile.name.trim(),
        dateOfBirth: profile.dateOfBirth,
        gender: profile.gender,
        department: profile.department.trim(),
        mobileNumber: profile.mobileNumber.trim(),
        email,
        passwordHash: await bcrypt.hash(password, 12)
      });
      user = {
        id: account.id,
        role,
        name: account.name,
        email: account.email,
        mentorId: account.mentorId,
        mustChangePassword: false
      };
    } else {
      const rollNo = typeof profile.registrationNumber === 'string' ? profile.registrationNumber.trim() : '';
      if (!rollNo || rollNo.length > 60) {
        throw new HttpError(400, 'Enter a valid registration number.');
      }
      if (await Student.exists({ rollNo })) {
        throw new HttpError(409, 'An account already exists for that registration number. Sign in or contact your mentor.');
      }
      account = await Student.create({
        rollNo,
        name: profile.name.trim(),
        dateOfBirth: profile.dateOfBirth,
        department: profile.department.trim(),
        section: profile.section.trim(),
        mobileNumber: profile.mobileNumber.trim(),
        email,
        attendance: 0,
        marks: 0,
        passwordHash: await bcrypt.hash(password, 12),
        mustChangePassword: false
      });
      user = {
        id: account.id,
        role,
        name: account.name,
        rollNo: account.rollNo,
        mustChangePassword: false
      };
    }

    const token = jwt.sign(
      { sub: user.id, role, ...(role === 'student' ? { rollNo: user.rollNo } : {}) },
      tokenSecret(),
      { expiresIn: '8h' }
    );
    res.status(201).json({ token, user });
  }));

  app.get('/api/auth/me', requireAuth, asyncHandler(async (req, res) => {
    const account = req.auth.role === 'mentor'
      ? await Mentor.findById(req.auth.id)
      : await Student.findById(req.auth.id);
    if (!account) throw new HttpError(401, 'This account no longer exists. Please sign in again.');
    res.json({
      user: req.auth.role === 'mentor'
        ? {
            id: account.id,
            role: 'mentor',
            name: account.name,
            email: account.email,
            mentorId: account.mentorId
          }
        : {
            id: account.id,
            role: 'student',
            name: account.name,
            rollNo: account.rollNo,
            mustChangePassword: account.mustChangePassword
          }
    });
  }));

  app.post('/api/auth/change-password', requireAuth, asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    const error = passwordError(newPassword);
    if (error) throw new HttpError(400, error);
    if (currentPassword === newPassword) {
      throw new HttpError(400, 'Choose a password different from your current password.');
    }

    const Model = req.auth.role === 'mentor' ? Mentor : Student;
    const account = await Model.findById(req.auth.id).select('+passwordHash');
    if (!account || !(await bcrypt.compare(currentPassword, account.passwordHash))) {
      throw new HttpError(400, 'Your current password is incorrect.');
    }
    account.passwordHash = await bcrypt.hash(newPassword, 12);
    if (req.auth.role === 'student') account.mustChangePassword = false;
    await account.save();
    res.json({ message: 'Password updated successfully.' });
  }));

  app.use('/api', requireAuth);

  app.get('/api/dashboard/summary', requireRole('mentor'), asyncHandler(async (req, res) => {
    const assignedStudentIds = await Student.find({ mentor: req.auth.id }).distinct('_id');
    const [students, totalStudents, recentRecords] = await Promise.all([
      Student.find({ mentor: req.auth.id }).lean(),
      Student.countDocuments({ mentor: req.auth.id }),
      Counseling.find({ student: { $in: assignedStudentIds } }).sort({ date: -1 }).limit(5).lean()
    ]);
    const flagged = students.filter(isAtRisk).length;
    const averageAttendance = totalStudents
      ? Math.round(students.reduce((sum, student) => sum + student.attendance, 0) / totalStudents)
      : 0;
    const averageMarks = totalStudents
      ? Math.round(students.reduce((sum, student) => sum + student.marks, 0) / totalStudents)
      : 0;
    res.json({
      totalStudents,
      flaggedStudents: flagged,
      studentsNeedingSupport: flagged,
      averageAttendance,
      averageMarks,
      recentRecords
    });
  }));

  app.get('/api/students', requireRole('mentor'), asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || 'all');
    const criteria = {
      mentor: req.auth.id,
      ...(search
        ? { $or: [{ rollNo: new RegExp(escapeRegExp(search), 'i') }, { name: new RegExp(escapeRegExp(search), 'i') }] }
        : {})
    };
    let students = await Student.find(criteria).sort({ name: 1 }).lean();
    if (status === 'flagged') students = students.filter(isAtRisk);
    if (status === 'on_track') students = students.filter((student) => !isAtRisk(student));
    res.json(students.map(toStudentView));
  }));

  app.post('/api/students/import', requireRole('mentor'), (req, res, next) => {
    upload.single('file')(req, res, (error) => {
      if (error) return next(error);
      next();
    });
  }, asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Select an Excel spreadsheet to import.');
    const rows = await parseStudentWorkbook(req.file.buffer);
    const existing = await Student.find({ rollNo: { $in: rows.map((row) => row.rollNo) } }).select('+passwordHash');
    const existingByRollNo = new Map(existing.map((student) => [student.rollNo.toLowerCase(), student]));
    const assignedElsewhere = existing.find((student) => student.mentor && student.mentor.toString() !== req.auth.id);
    if (assignedElsewhere) {
      throw new HttpError(409, `Student ${assignedElsewhere.rollNo} is already assigned to another mentor.`);
    }
    const credentials = [];
    const operations = await Promise.all(rows.map(async (row) => {
      const current = existingByRollNo.get(row.rollNo.toLowerCase());
      const update = {
        $set: {
          name: row.name,
          attendance: row.attendance,
          marks: row.marks,
          totalMarks: row.totalMarks ?? row.marks,
          totalSubjects: row.totalSubjects || 0,
          subjectMarks: row.subjectMarks || [],
          mentor: req.auth.id
        }
      };
      if (row.dateOfBirth) update.$set.dateOfBirth = row.dateOfBirth;
      if (!current || !current.passwordHash) {
        const temporaryPassword = crypto.randomBytes(15).toString('base64url');
        update.$set.passwordHash = await bcrypt.hash(temporaryPassword, 12);
        update.$set.mustChangePassword = true;
        credentials.push({ rollNo: row.rollNo, name: row.name, temporaryPassword });
      }
      return {
        updateOne: {
          filter: { rollNo: row.rollNo },
          update,
          upsert: true,
          setDefaultsOnInsert: true
        }
      };
    }));
    await Student.bulkWrite(operations, { ordered: true });
    res.json({
      imported: rows.length,
      updated: rows.length - credentials.length,
      created: credentials.length,
      credentials
    });
  }));

  app.get('/api/students/me', requireRole('student'), asyncHandler(async (req, res) => {
    const student = await Student.findById(req.auth.id);
    if (!student) throw new HttpError(404, 'Student account not found.');
    res.json({ student: toStudentView(student) });
  }));

  app.get('/api/students/:rollNo', asyncHandler(async (req, res) => {
    if (req.auth.role === 'student' && req.auth.rollNo !== req.params.rollNo) {
      throw new HttpError(403, 'Students can only view their own academic profile.');
    }
    const student = await Student.findOne({ rollNo: req.params.rollNo });
    if (!student) throw new HttpError(404, 'No student found with that roll number.');
    if (req.auth.role === 'mentor' && student.mentor?.toString() !== req.auth.id) {
      throw new HttpError(403, 'Mentors can only view students assigned to them.');
    }
    res.json({ student: toStudentView(student) });
  }));

  app.patch('/api/students/:rollNo/flag', requireRole('mentor'), asyncHandler(async (req, res) => {
    const { flagged, reason } = req.body || {};
    if (typeof flagged !== 'boolean') throw new HttpError(400, 'A true or false flag value is required.');
    if (reason !== undefined && (typeof reason !== 'string' || reason.length > 500)) {
      throw new HttpError(400, 'Flag reason must be 500 characters or fewer.');
    }
    const student = await Student.findOneAndUpdate(
      { rollNo: req.params.rollNo, mentor: req.auth.id },
      { manuallyFlagged: flagged, manualFlagReason: flagged ? String(reason || '').trim() : '' },
      { new: true, runValidators: true }
    );
    if (!student) throw new HttpError(404, 'No student found with that roll number.');
    res.json({ student: toStudentView(student) });
  }));

  app.get('/api/attendance/me', requireRole('student'), asyncHandler(async (req, res) => {
    const records = await Attendance.find({ student: req.auth.id }).sort({ date: -1, slot: 1 }).limit(500).lean();
    res.json(records);
  }));

  app.get('/api/homework/me', requireRole('student'), asyncHandler(async (req, res) => {
    res.json(await Homework.find({ student: req.auth.id }).sort({ dueDate: 1, createdAt: -1 }).lean());
  }));

  app.get('/api/homework', requireRole('mentor'), asyncHandler(async (req, res) => {
    const rollNo = typeof req.query.rollNo === 'string' ? req.query.rollNo.trim() : '';
    if (!rollNo) throw new HttpError(400, 'Choose a student to view their homework.');
    const student = await Student.findOne({ rollNo, mentor: req.auth.id }).select('_id');
    if (!student) throw new HttpError(404, 'No student found in your roster with that registration number.');
    res.json(await Homework.find({ mentor: req.auth.id, student: student._id }).sort({ dueDate: 1, createdAt: -1 }).lean());
  }));

  app.post('/api/homework', requireRole('mentor'), asyncHandler(async (req, res) => {
    const error = validateHomeworkInput(req.body);
    if (error) throw new HttpError(400, error);
    const rollNo = req.body.rollNo.trim();
    const student = await Student.findOne({ rollNo, mentor: req.auth.id }).select('_id rollNo');
    if (!student) throw new HttpError(404, 'No student found in your roster with that registration number.');
    const homework = await Homework.create({
      mentor: req.auth.id,
      student: student._id,
      studentRollNo: student.rollNo,
      title: req.body.title.trim(),
      instructions: req.body.instructions.trim(),
      dueDate: req.body.dueDate ? parseDay(req.body.dueDate) : null
    });
    res.status(201).json({ homework });
  }));

  app.get('/api/attendance', requireRole('mentor'), asyncHandler(async (req, res) => {
    const date = parseDay(req.query.date);
    if (!date) throw new HttpError(400, 'Choose a valid attendance date.');
    const records = await Attendance.find({ mentor: req.auth.id, date }).lean();
    res.json(records);
  }));

  app.put('/api/attendance', requireRole('mentor'), asyncHandler(async (req, res) => {
    const date = parseDay(req.body?.date);
    const entries = req.body?.entries;
    if (!date) throw new HttpError(400, 'Choose a valid attendance date.');
    if (!Array.isArray(entries) || entries.length > 3000) {
      throw new HttpError(400, 'Attendance must contain up to 3,000 student and class-slot entries.');
    }
    if (date > parseDay(new Date().toISOString().slice(0, 10))) {
      throw new HttpError(400, 'Attendance cannot be entered for a future date.');
    }

    const uniqueEntries = new Set();
    for (const entry of entries) {
      if (!entry || typeof entry.rollNo !== 'string' || !entry.rollNo.trim()
        || !ATTENDANCE_SLOTS.includes(entry.slot)
        || ![null, 'present', 'absent', 'od'].includes(entry.status)) {
        throw new HttpError(400, 'Each attendance entry needs a student, valid class slot, and Present, Absent, OD, or blank status.');
      }
      const key = `${entry.rollNo.trim()}\u0000${entry.slot}`;
      if (uniqueEntries.has(key)) throw new HttpError(400, 'Attendance contains a duplicate student and class-slot entry.');
      uniqueEntries.add(key);
    }

    const rollNos = [...new Set(entries.map((entry) => entry.rollNo.trim()))];
    const students = await Student.find({ mentor: req.auth.id, rollNo: { $in: rollNos } }).select('_id rollNo');
    const studentsByRollNo = new Map(students.map((student) => [student.rollNo, student]));
    if (students.length !== rollNos.length) {
      throw new HttpError(403, 'Attendance can only be entered for students in your roster.');
    }

    const operations = entries.map((entry) => {
      const student = studentsByRollNo.get(entry.rollNo.trim());
      return entry.status === null
        ? Attendance.deleteOne({ student: student._id, mentor: req.auth.id, date, slot: entry.slot })
        : Attendance.updateOne(
            { student: student._id, date, slot: entry.slot },
            {
              $set: {
                studentRollNo: student.rollNo,
                mentor: req.auth.id,
                status: entry.status
              }
            },
            { upsert: true }
          );
    });
    await Promise.all(operations);

    if (students.length) {
      const totals = await Attendance.aggregate([
        { $match: { student: { $in: students.map((student) => student._id) } } },
        {
          $group: {
            _id: '$student',
            total: { $sum: 1 },
            attended: { $sum: { $cond: [{ $in: ['$status', ['present', 'od']] }, 1, 0] } }
          }
        }
      ]);
      const attendanceByStudent = new Map(totals.map((row) => [row._id.toString(), Math.round((row.attended / row.total) * 100)]));
      await Promise.all(students.map((student) => {
        const attendance = attendanceByStudent.get(student._id.toString());
        return attendance === undefined
          ? Promise.resolve()
          : Student.updateOne({ _id: student._id, mentor: req.auth.id }, { $set: { attendance } });
      }));
    }

    res.json({ saved: entries.length });
  }));

  app.get('/api/assessments/me', requireRole('student'), asyncHandler(async (req, res) => {
    const student = await Student.findById(req.auth.id).select('mentor');
    const assessments = student?.mentor
      ? await Assessment.find({ mentor: student.mentor }).sort({ createdAt: -1 }).lean()
      : [];
    const results = assessments.length
      ? await AssessmentResult.find({ student: req.auth.id, assessment: { $in: assessments.map((item) => item._id) } }).lean()
      : [];
    const resultByAssessment = new Map(results.map((result) => [result.assessment.toString(), result]));
    res.json(assessments.map((assessment) => {
      const result = resultByAssessment.get(assessment._id.toString());
      return {
        ...assessment,
        marks: assessment.subjects.map((subject) => ({
          subjectId: subject._id,
          subject: subject.name,
          maxMarks: subject.maxMarks,
          score: result?.marks.find((mark) => mark.subjectId.toString() === subject._id.toString())?.score ?? null
        }))
      };
    }));
  }));

  app.get('/api/assessments', requireRole('mentor'), asyncHandler(async (req, res) => {
    res.json(await Assessment.find({ mentor: req.auth.id }).sort({ createdAt: -1 }).lean());
  }));

  app.post('/api/assessments', requireRole('mentor'), asyncHandler(async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const subjects = req.body?.subjects;
    if (!name || name.length > 120) throw new HttpError(400, 'Enter a test name up to 120 characters.');
    if (!Array.isArray(subjects) || subjects.length < 1 || subjects.length > 20) {
      throw new HttpError(400, 'Add between 1 and 20 subjects to this test.');
    }
    const normalizedSubjects = subjects.map((subject) => ({
      name: typeof subject?.name === 'string' ? subject.name.trim() : '',
      maxMarks: subject?.maxMarks === undefined ? 100 : subject.maxMarks
    }));
    if (normalizedSubjects.some((subject) =>
      !subject.name || subject.name.length > 100
      || typeof subject.maxMarks !== 'number' || !Number.isFinite(subject.maxMarks)
      || subject.maxMarks < 1 || subject.maxMarks > 1000
    )) {
      throw new HttpError(400, 'Each subject needs a name and a maximum mark value from 1 to 1,000.');
    }
    const subjectNames = normalizedSubjects.map((subject) => subject.name.toLocaleLowerCase());
    if (new Set(subjectNames).size !== subjectNames.length) {
      throw new HttpError(400, 'Subject names must be unique within a test.');
    }
    const assessment = await Assessment.create({ mentor: req.auth.id, name, subjects: normalizedSubjects });
    res.status(201).json({ assessment });
  }));

  app.get('/api/assessments/:assessmentId/results', requireRole('mentor'), asyncHandler(async (req, res) => {
    const assessment = await Assessment.findOne({ _id: req.params.assessmentId, mentor: req.auth.id }).lean();
    if (!assessment) throw new HttpError(404, 'Test not found in your assessments.');
    const students = await Student.find({ mentor: req.auth.id }).sort({ name: 1 }).select('name rollNo').lean();
    const results = await AssessmentResult.find({ assessment: assessment._id }).lean();
    const resultByStudent = new Map(results.map((result) => [result.student.toString(), result]));
    res.json({
      assessment,
      students: students.map((student) => {
        const result = resultByStudent.get(student._id.toString());
        return {
          ...student,
          marks: assessment.subjects.map((subject) => ({
            subjectId: subject._id,
            score: result?.marks.find((mark) => mark.subjectId.toString() === subject._id.toString())?.score ?? null
          }))
        };
      })
    });
  }));

  app.put('/api/assessments/:assessmentId/students/:rollNo/marks', requireRole('mentor'), asyncHandler(async (req, res) => {
    const [assessment, student] = await Promise.all([
      Assessment.findOne({ _id: req.params.assessmentId, mentor: req.auth.id }),
      Student.findOne({ rollNo: req.params.rollNo, mentor: req.auth.id })
    ]);
    if (!assessment) throw new HttpError(404, 'Test not found in your assessments.');
    if (!student) throw new HttpError(404, 'No student found in your roster with that registration number.');
    const submittedMarks = req.body?.marks;
    if (!Array.isArray(submittedMarks) || submittedMarks.length !== assessment.subjects.length) {
      throw new HttpError(400, 'Enter a mark or leave blank for every subject in this test.');
    }
    const marksById = new Map();
    for (const mark of submittedMarks) {
      const subjectId = String(mark?.subjectId || '');
      if (!assessment.subjects.some((subject) => subject._id.toString() === subjectId)
        || marksById.has(subjectId)
        || (mark.score !== null && (typeof mark.score !== 'number' || !Number.isFinite(mark.score) || mark.score < 0))) {
        throw new HttpError(400, 'Enter a valid mark for each subject.');
      }
      const subject = assessment.subjects.find((item) => item._id.toString() === subjectId);
      if (mark.score !== null && mark.score > subject.maxMarks) {
        throw new HttpError(400, `Marks for ${subject.name} cannot exceed ${subject.maxMarks}.`);
      }
      marksById.set(subjectId, mark.score);
    }
    const marks = [...marksById].filter(([, score]) => score !== null).map(([subjectId, score]) => ({ subjectId, score }));
    if (marks.length) {
      await AssessmentResult.findOneAndUpdate(
        { assessment: assessment._id, student: student._id },
        { assessment: assessment._id, student: student._id, studentRollNo: student.rollNo, marks },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
    } else {
      await AssessmentResult.deleteOne({ assessment: assessment._id, student: student._id });
    }
    const results = await AssessmentResult.find({ student: student._id }).populate('assessment', 'subjects').lean();
    const scored = results.flatMap((result) => result.marks.map((mark) => {
      const subject = result.assessment.subjects.find((item) => item._id.toString() === mark.subjectId.toString());
      return subject ? { score: mark.score, maxMarks: subject.maxMarks } : null;
    })).filter(Boolean);
    if (scored.length) {
      const percentage = Math.round(scored.reduce((sum, item) => sum + item.score, 0) / scored.reduce((sum, item) => sum + item.maxMarks, 0) * 100);
      await Student.updateOne({ _id: student._id, mentor: req.auth.id }, { $set: { marks: percentage } });
    }
    res.json({ saved: true, marks });
  }));

  app.get('/api/records', asyncHandler(async (req, res) => {
    const rollNo = req.auth.role === 'student'
      ? req.auth.rollNo
      : String(req.query.rollNo || '').trim();
    const criteria = req.auth.role === 'mentor'
      ? {
          student: { $in: await Student.find({ mentor: req.auth.id }).distinct('_id') },
          ...(rollNo ? { studentRollNo: rollNo } : {})
        }
      : { studentRollNo: rollNo };
    res.json(await Counseling.find(criteria).sort({ date: -1 }).limit(500).lean());
  }));

  app.post('/api/records', asyncHandler(async (req, res) => {
    const { studentRollNo, type, remarks, interventionType, date } = req.body || {};
    if (typeof studentRollNo !== 'string' || !studentRollNo.trim()) {
      throw new HttpError(400, 'A student roll number is required.');
    }
    if (req.auth.role === 'student' && type !== 'student_request') {
      throw new HttpError(403, 'Students can submit a counseling request but cannot add mentor records.');
    }
    if (!['counseling_session', 'mentor_remark', 'intervention', 'student_request'].includes(type)) {
      throw new HttpError(400, 'Choose a valid counseling record type.');
    }
    if (typeof remarks !== 'string' || !remarks.trim() || remarks.length > 5000) {
      throw new HttpError(400, 'Details are required and must be 5,000 characters or fewer.');
    }
    const student = req.auth.role === 'student'
      ? await Student.findById(req.auth.id)
      : await Student.findOne({ rollNo: studentRollNo.trim(), mentor: req.auth.id });
    if (!student) throw new HttpError(404, 'No student found with that roll number.');
    if (req.auth.role === 'student' && type === 'student_request' && !student.mentor) {
      throw new HttpError(409, 'Request to join a mentor first; send a mentor request from your dashboard.');
    }
    if (req.auth.role === 'student' && student.rollNo !== studentRollNo.trim()) {
      throw new HttpError(403, 'Students can only submit requests for themselves.');
    }
    const entryDate = date === undefined ? new Date() : new Date(date);
    if (Number.isNaN(entryDate.getTime())) throw new HttpError(400, 'Enter a valid date for this record.');
    const author = req.auth.role === 'mentor' ? await Mentor.findById(req.auth.id) : student;
    const record = await Counseling.create({
      student: student._id,
      studentRollNo: student.rollNo,
      type,
      remarks: remarks.trim(),
      interventionType: String(interventionType || '').trim(),
      date: entryDate,
      createdByRole: req.auth.role,
      createdByName: author.name
    });
    res.status(201).json({ record });
  }));

  app.get('/api/mentorship-requests/me', requireRole('student'), asyncHandler(async (req, res) => {
    const [student, request] = await Promise.all([
      Student.findById(req.auth.id).populate('mentor', 'name mentorId department'),
      MentorshipRequest.findOne({ student: req.auth.id })
        .sort({ createdAt: -1 })
        .populate('mentor', 'name mentorId department')
    ]);
    if (!student) throw new HttpError(404, 'Student account not found.');
    res.json({
      assignment: student.mentor
        ? { status: 'accepted', mentor: student.mentor }
        : request
          ? { status: request.status, mentor: request.mentor, updatedAt: request.updatedAt }
          : null
    });
  }));

  app.post('/api/mentorship-requests', requireRole('student'), asyncHandler(async (req, res) => {
    const mentorId = typeof req.body?.mentorId === 'string' ? req.body.mentorId.trim().toUpperCase() : '';
    if (!mentorId || mentorId.length > 60) throw new HttpError(400, 'Enter a Mentor ID between 1 and 60 characters.');
    const student = await Student.findById(req.auth.id);
    if (!student) throw new HttpError(404, 'Student account not found.');
    if (student.mentor) {
      throw new HttpError(409, 'You already have an assigned mentor. Contact your mentor to update your assignment.');
    }
    const mentor = await Mentor.findOne({ mentorId });
    if (!mentor) throw new HttpError(404, 'No mentor was found for that Mentor ID. Check the ID and try again.');
    if (await MentorshipRequest.exists({ student: student._id, status: 'pending' })) {
      throw new HttpError(409, 'You already have a pending mentor request. Wait for that mentor to respond.');
    }
    const request = await MentorshipRequest.create({ student: student._id, mentor: mentor._id });
    res.status(201).json({
      request: {
        id: request.id,
        status: request.status,
        mentor: { name: mentor.name, mentorId: mentor.mentorId }
      }
    });
  }));

  app.get('/api/mentorship-requests', requireRole('mentor'), asyncHandler(async (req, res) => {
    const requests = await MentorshipRequest.find({ mentor: req.auth.id, status: 'pending' })
      .sort({ createdAt: 1 })
      .populate('student', 'rollNo name department section email mobileNumber');
    res.json(requests);
  }));

  app.patch('/api/mentorship-requests/:requestId', requireRole('mentor'), asyncHandler(async (req, res) => {
    const { decision } = req.body || {};
    if (!['accept', 'reject'].includes(decision)) {
      throw new HttpError(400, 'Choose whether to accept or reject this request.');
    }
    const request = await MentorshipRequest.findOne({
      _id: req.params.requestId,
      mentor: req.auth.id,
      status: 'pending'
    });
    if (!request) throw new HttpError(404, 'This pending request was not found for your mentor account.');

    if (decision === 'accept') {
      const student = await Student.findOneAndUpdate(
        { _id: request.student, $or: [{ mentor: null }, { mentor: { $exists: false } }] },
        { mentor: req.auth.id },
        { new: true }
      );
      if (!student) throw new HttpError(409, 'The student has already been assigned to another mentor.');
      request.status = 'accepted';
    } else {
      request.status = 'rejected';
    }
    request.resolvedAt = new Date();
    await request.save();
    res.json({ request: { id: request.id, status: request.status } });
  }));

  app.use((req, res, next) => next(new HttpError(404, 'API endpoint not found.')));
  app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Excel file must be 10 MB or smaller.'
        : error.message;
      return res.status(400).json({ error: message });
    }
    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({ error: 'The requested record identifier is invalid.' });
    }
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      const message = field === 'mentorId'
        ? 'That Mentor ID is already in use. Choose a different ID.'
        : field === 'email'
          ? 'An account already exists for that email address. Sign in instead.'
          : field === 'rollNo'
            ? 'An account already exists for that registration number. Sign in instead.'
            : 'This request conflicts with an existing account or request.';
      return res.status(409).json({ error: message });
    }
    const status = error.status || 500;
    if (status >= 500) console.error('API error:', error);
    res.status(status).json({ error: status >= 500 ? 'An unexpected server error occurred.' : error.message });
  });
  return app;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { createApp, passwordError, validateHomeworkInput, validateProfile, PASSWORD_MIN_LENGTH };
