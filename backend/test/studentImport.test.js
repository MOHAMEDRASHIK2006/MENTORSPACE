const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { parseStudentWorkbook, isAtRisk, getFlagReasons } = require('../lib/studentImport');

async function workbookBuffer(rows) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Students');
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  worksheet.addRow(headers);
  const normalize = (value) => value.toLowerCase().replace(/[\s_-]/g, '');
  for (const row of rows) {
    worksheet.addRow(headers.map((header) => {
      const key = Object.keys(row).find((candidate) => normalize(candidate) === normalize(header));
      return key === undefined ? '' : row[key];
    }));
  }
  return workbook.xlsx.writeBuffer();
}

test('parses student rows and normalizes spreadsheet headers', async () => {
  const rows = await parseStudentWorkbook(await workbookBuffer([
    { 'Roll No': ' 001 ', Name: 'Jamie Lee', 'Date Of Birth': '2005-04-17', Attendance: 88, Marks: 71 },
    { roll_no: '002', name: 'Morgan Ray', date_of_birth: '2004-02-29', attendance: 72, marks: 49 }
  ]));

  assert.deepEqual(rows, [
    {
      rollNo: '001',
      name: 'Jamie Lee',
      dateOfBirth: new Date('2005-04-17T00:00:00.000Z'),
      attendance: 88,
      marks: 71,
      totalMarks: 71,
      totalSubjects: 0,
      subjectMarks: []
    },
    {
      rollNo: '002',
      name: 'Morgan Ray',
      dateOfBirth: new Date('2004-02-29T00:00:00.000Z'),
      attendance: 72,
      marks: 49,
      totalMarks: 49,
      totalSubjects: 0,
      subjectMarks: []
    }
  ]);
});

test('imports registration ID and subject marks without requiring date of birth', async () => {
  const rows = await parseStudentWorkbook(await workbookBuffer([
    {
      'Registration ID': ' STU-007 ',
      Name: 'Taylor Rivers',
      Mathematics: 86,
      Physics: 74,
      'Total Subjects': 2,
      Attendance: 92
    }
  ]));

  assert.deepEqual(rows, [{
    rollNo: 'STU-007',
    name: 'Taylor Rivers',
    dateOfBirth: null,
    attendance: 92,
    marks: 80,
    totalMarks: 160,
    totalSubjects: 2,
    subjectMarks: [
      { subject: 'Mathematics', score: 86 },
      { subject: 'Physics', score: 74 }
    ]
  }]);
});

test('rejects a subject count that does not match score columns', async () => {
  await assert.rejects(
    () => workbookBuffer([
      { registrationId: 'STU-008', name: 'Morgan Ray', Mathematics: 86, Physics: 74, totalSubjects: 3, attendance: 92 }
    ]).then(parseStudentWorkbook),
    { status: 400, message: 'Row 2: totalSubjects must equal the number of subject score columns (2).' }
  );
});

test('rejects a row with invalid marks before import', async () => {
  await assert.rejects(
    () => workbookBuffer([
      { rollNo: '101', name: 'Avery', dateOfBirth: '2005-06-14', attendance: 90, marks: 101 }
    ]).then(parseStudentWorkbook),
    { status: 400, message: 'Row 2: marks must be a number from 0 to 100.' }
  );
});

test('rejects blank values and duplicate roll numbers', async () => {
  await assert.rejects(
    () => workbookBuffer([
      { rollNo: '101', name: 'Avery', dateOfBirth: '2005-06-14', attendance: '', marks: 68 }
    ]).then(parseStudentWorkbook),
    { status: 400, message: 'Row 2: attendance must be a number from 0 to 100.' }
  );
  await assert.rejects(
    () => workbookBuffer([
      { rollNo: '101', name: 'Avery', dateOfBirth: '2005-06-14', attendance: 90, marks: 68 },
      { rollNo: '101', name: 'Avery Updated', dateOfBirth: '2005-06-14', attendance: 92, marks: 71 }
    ]).then(parseStudentWorkbook),
    { status: 400, message: 'Row 3: duplicate rollNo "101".' }
  );
});

test('rejects an invalid date of birth', async () => {
  await assert.rejects(
    () => workbookBuffer([
      { rollNo: '101', name: 'Avery', dateOfBirth: '2005-02-29', attendance: 90, marks: 68 }
    ]).then(parseStudentWorkbook),
    { status: 400, message: 'Row 2: dateOfBirth must be a valid date in YYYY-MM-DD format.' }
  );
});

test('flags students below a threshold and returns actionable reasons', () => {
  const student = { attendance: 74, marks: 60, manuallyFlagged: true, manualFlagReason: 'Check in this week' };
  assert.equal(isAtRisk(student), true);
  assert.deepEqual(getFlagReasons(student), ['Attendance below 75%', 'Check in this week']);
  assert.equal(isAtRisk({ attendance: 75, marks: 50, manuallyFlagged: false }), false);
});
