const ExcelJS = require('exceljs');
const { HttpError } = require('./errors');

const normalizeHeader = (value) => String(value).trim().toLowerCase().replace(/[\s_-]/g, '');

function parseDateOfBirth(value, rowNumber) {
  const rawValue = value instanceof Date ? value : String(value || '').trim();
  if (!rawValue) return null;
  const parsed = rawValue instanceof Date
    ? rawValue
    : /^\d{4}-\d{2}-\d{2}$/.test(rawValue)
      ? new Date(`${rawValue}T00:00:00.000Z`)
      : new Date(Number.NaN);
  const dateString = parsed instanceof Date && !Number.isNaN(parsed.getTime())
    ? parsed.toISOString().slice(0, 10)
    : '';
  if (!dateString || (typeof rawValue === 'string' && dateString !== rawValue)) {
    throw new HttpError(400, `Row ${rowNumber}: dateOfBirth must be a valid date in YYYY-MM-DD format.`);
  }
  if (dateString >= new Date().toISOString().slice(0, 10)) {
    throw new HttpError(400, `Row ${rowNumber}: dateOfBirth must be in the past.`);
  }
  return parsed;
}

async function parseStudentWorkbook(buffer) {
  let workbook;
  try {
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
  } catch {
    throw new HttpError(400, 'The uploaded file could not be read as an .xlsx workbook.');
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 2) {
    throw new HttpError(400, 'The first worksheet must contain a header row and student rows.');
  }
  const headers = new Map();
  const headerLabels = new Map();
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
    const normalizedHeader = normalizeHeader(cell.text);
    const canonicalHeader = ['registrationid', 'registrationnumber'].includes(normalizedHeader) ? 'rollno' : normalizedHeader;
    if (canonicalHeader) {
      headers.set(canonicalHeader, column);
      headerLabels.set(canonicalHeader, cell.text.trim());
    }
  });
  for (const required of ['rollno', 'name', 'attendance']) {
    if (!headers.has(required)) throw new HttpError(400, `The spreadsheet must include a "${required}" column.`);
  }
  const subjectColumns = [...headers.entries()].filter(([header]) =>
    ![
      'rollno', 'name', 'dateofbirth', 'attendance', 'marks', 'totalmarks', 'totalsubjects',
      'department', 'section', 'email', 'emailid', 'mobile', 'mobilenumber', 'phone', 'phonenumber',
      'gender', 'dob', 'serialno', 'sno'
    ].includes(header)
  ).map(([header, column]) => ({ header, column, label: headerLabels.get(header) || header }));
  if (!subjectColumns.length && !headers.has('marks')) {
    throw new HttpError(400, 'The spreadsheet must include a marks column or at least one subject score column.');
  }

  const seenRollNos = new Set();
  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    if (rows.length >= 1000) throw new HttpError(400, 'Import at most 1,000 students per spreadsheet.');
    const cellValue = (name) => row.getCell(headers.get(name)).text;
    const rollNo = cellValue('rollno').trim();
    const name = cellValue('name').trim();
    const dateOfBirth = headers.has('dateofbirth')
      ? parseDateOfBirth(row.getCell(headers.get('dateofbirth')).value, rowNumber)
      : null;
    const rawAttendance = cellValue('attendance').trim();
    const attendance = rawAttendance === '' ? Number.NaN : Number(rawAttendance);
    const errors = [];
    const subjectMarks = subjectColumns.map(({ header, column, label }) => {
      const rawScore = row.getCell(column).text.trim();
      const score = rawScore === '' ? Number.NaN : Number(rawScore);
      if (!Number.isFinite(score) || score < 0 || score > 1000) {
        errors.push(`${label} must be a number from 0 to 1,000`);
      }
      return { subject: label, score };
    });
    const rawMarks = headers.has('marks') ? cellValue('marks').trim() : '';
    const legacyMarks = rawMarks === '' ? null : Number(rawMarks);
    const scoreValues = subjectMarks.length
      ? subjectMarks.map(({ score }) => score)
      : legacyMarks === null ? [] : [legacyMarks];
    const marks = scoreValues.length
      ? Math.min(100, Math.round(scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length))
      : Number.NaN;
    const totalMarks = subjectMarks.length
      ? subjectMarks.reduce((sum, item) => sum + item.score, 0)
      : legacyMarks;
    const rawTotalSubjects = headers.has('totalsubjects') ? cellValue('totalsubjects').trim() : '';
    const totalSubjects = rawTotalSubjects === '' ? subjectMarks.length : Number(rawTotalSubjects);

    if (!rollNo) errors.push('rollNo is required');
    if (!name) errors.push('name is required');
    if (!Number.isFinite(attendance) || attendance < 0 || attendance > 100) {
      errors.push('attendance must be a number from 0 to 100');
    }
    if (subjectMarks.length && (!Number.isInteger(totalSubjects) || totalSubjects !== subjectMarks.length)) {
      errors.push(`totalSubjects must equal the number of subject score columns (${subjectMarks.length})`);
    }
    if (!subjectMarks.length && (!Number.isFinite(legacyMarks) || legacyMarks < 0 || legacyMarks > 100)) {
      errors.push('marks must be a number from 0 to 100');
    }
    if (rollNo && seenRollNos.has(rollNo.toLowerCase())) errors.push(`duplicate rollNo "${rollNo}"`);
    if (errors.length) throw new HttpError(400, `Row ${rowNumber}: ${errors.join('; ')}.`);

    seenRollNos.add(rollNo.toLowerCase());
    rows.push({ rollNo, name, dateOfBirth, attendance, marks, totalMarks, totalSubjects, subjectMarks });
  });
  if (!rows.length) throw new HttpError(400, 'The first worksheet has no student rows.');
  return rows;
}

function isAtRisk(student) {
  return student.manuallyFlagged === true || student.attendance < 75 || student.marks < 50;
}

function getFlagReasons(student) {
  const reasons = [];
  if (student.attendance < 75) reasons.push('Attendance below 75%');
  if (student.marks < 50) reasons.push('Marks below 50');
  if (student.manuallyFlagged && student.manualFlagReason) reasons.push(student.manualFlagReason);
  else if (student.manuallyFlagged) reasons.push('Flagged by mentor');
  return reasons;
}

module.exports = { parseStudentWorkbook, isAtRisk, getFlagReasons };
