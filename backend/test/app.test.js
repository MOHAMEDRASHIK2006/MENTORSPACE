const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp, passwordError, validateHomeworkInput, validateProfile } = require('../app');

test('password validation enforces the account policy', () => {
  assert.equal(passwordError('short'), 'Password must be at least 10 characters.');
  assert.equal(passwordError('a'.repeat(73)), 'Password must be no longer than 72 bytes.');
  assert.equal(passwordError('proper-long-passphrase'), null);
});

test('homework validation requires a student, title, instructions, and valid optional due date', () => {
  assert.equal(validateHomeworkInput({}), 'Choose a student from your roster.');
  assert.equal(validateHomeworkInput({ rollNo: 'S-100' }), 'Enter a homework title up to 120 characters.');
  assert.equal(validateHomeworkInput({ rollNo: 'S-100', title: 'Read chapter 2' }), 'Enter homework instructions up to 5,000 characters.');
  assert.equal(validateHomeworkInput({ rollNo: 'S-100', title: 'Read chapter 2', instructions: 'Complete questions 1-5.', dueDate: '2026-02-30' }), 'Enter a valid homework due date.');
  assert.equal(validateHomeworkInput({ rollNo: ' S-100 ', title: ' Read chapter 2 ', instructions: ' Complete questions 1-5. ', dueDate: '2026-10-30' }), null);
});

test('mentor and student sign-up profiles validate required personal details', () => {
  const common = {
    name: 'Jamie Lee',
    mentorId: 'The Lab / Mentor #1',
    dateOfBirth: '2005-04-17',
    email: 'jamie@example.edu',
    mobileNumber: '+1 555 123 4567',
    department: 'Computer Science'
  };
  assert.equal(
    validateProfile({ ...common, gender: 'female' }, { mentor: true }),
    null
  );
  assert.equal(
    validateProfile({ ...common, gender: 'female', mentorId: '  ' }, { mentor: true }),
    'Enter a Mentor ID between 1 and 60 characters.'
  );
  assert.equal(
    validateProfile({ ...common, section: 'A' }),
    null
  );
  assert.equal(
    validateProfile({ ...common, gender: 'invalid' }, { mentor: true }),
    'Choose a gender.'
  );
  assert.equal(
    validateProfile({ ...common, section: '' }),
    'Enter a section of 1-40 characters.'
  );
});

test('health and protected routes respond with the expected access policy', async (context) => {
  const server = createApp().listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { status: 'ok' });

  for (const path of ['/api/students', '/api/attendance?date=2026-10-13', '/api/assessments', '/api/assessments/me', '/api/homework?rollNo=S-100', '/api/homework/me']) {
    const protectedResponse = await fetch(`${baseUrl}${path}`);
    assert.equal(protectedResponse.status, 401);
    assert.deepEqual(await protectedResponse.json(), { error: 'Please sign in to continue.' });
  }

  const secret = process.env.JWT_SECRET || 'local-development-only-change-me';
  const studentToken = jwt.sign({ sub: 'student-test-id', role: 'student' }, secret);
  const mentorToken = jwt.sign({ sub: 'mentor-test-id', role: 'mentor' }, secret);
  const mentorOnlyResponse = await fetch(`${baseUrl}/api/homework?rollNo=S-100`, {
    headers: { Authorization: `Bearer ${studentToken}` }
  });
  assert.equal(mentorOnlyResponse.status, 403);
  const studentOnlyResponse = await fetch(`${baseUrl}/api/homework/me`, {
    headers: { Authorization: `Bearer ${mentorToken}` }
  });
  assert.equal(studentOnlyResponse.status, 403);

  const resetRequest = await fetch(`${baseUrl}/api/auth/password-reset/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'invalid', email: 'not-an-email' })
  });
  assert.equal(resetRequest.status, 400);
  assert.deepEqual(await resetRequest.json(), {
    error: 'Choose your account type and enter a valid account email address.'
  });

  const resetConfirm = await fetch(`${baseUrl}/api/auth/password-reset/confirm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'not-a-reset-token', newPassword: 'new-long-password' })
  });
  assert.equal(resetConfirm.status, 400);
  assert.deepEqual(await resetConfirm.json(), {
    error: 'This password reset link is invalid or expired. Request a new link.'
  });
});
