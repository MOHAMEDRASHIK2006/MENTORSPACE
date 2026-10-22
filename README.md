MentorSpace — Student Mentoring & Counselling Management

MentorSpace is a MERN application for managing student academic progress, attendance, mentor remarks, counselling sessions, intervention history, and student support requests.

Requirements
Node.js 18 or newer
MongoDB 6 or newer
Run Locally
Start MongoDB.
In the backend folder, install dependencies and copy .env.example to .env.
Configure the environment variables in backend/.env, including a random JWT_SECRET of at least 32 characters and your MongoDB connection string.

Start the backend:

cd backend
npm install
npm run create-mentor
npm start

The mentor-creation command asks for mentor profile details, a Mentor ID, and a password. It stores a bcrypt password hash, not the password.

Mentors may also register using the Create an account button on the login page. Students can register independently and request access to a mentor using that mentor's ID.

Open a second terminal and start the frontend:

cd frontend
npm install
npm start
Open http://localhost:3000 in your browser.

The React development server forwards /api requests to the backend on port 5050.

Production Configuration

Configure the following environment variables for the backend:

NODE_ENV=production
JWT_SECRET — a random secret of at least 32 characters
MONGO_URI — your MongoDB connection string
FRONTEND_ORIGIN — the deployed frontend's origin

Serve the frontend and API over HTTPS. The API refuses production startup without a valid JWT secret.

Password Recovery Email

Password recovery requires an SMTP mail account. Configure these backend environment variables:

SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASS
SMTP_FROM
FRONTEND_URL

Students and mentors can request a password-reset link using their account email. The single-use link expires after 30 minutes.

Import Student Data

Mentors can import .xlsx spreadsheets from the mentor dashboard.

The first worksheet must contain:

Student name
Registration ID (also accepted as rollNo or registrationNumber)
Attendance
Either a marks column or one numeric score column for each subject

dateOfBirth is optional.

Example spreadsheet:

registrationId	name	Mathematics	Physics	totalSubjects	attendance
101	Jamie Lee	86	74	2	88
102	Morgan Ray	55	45	2	68

Header matching ignores case, spaces, underscores, and hyphens. Subject score columns are identified by their headers. The optional totalSubjects value must match the number of subject columns.

Subject scores may be between 0 and 1,000. The mentor roster displays their sum as total marks and shows individual scores in each student profile. The average subject score, capped at 100, is used for the academic progress indicator.

Attendance must be between 0 and 100. Imports are limited to 1,000 students and 10 MB per file. Invalid rows reject the entire import.

Imported students are assigned to the importing mentor. Re-importing an existing roll number updates the student's name, attendance, and academic data without resetting their password or removing a manual flag. Registration numbers must be unique.

New student accounts receive randomly generated temporary passwords. Mentors can download the new credentials as a CSV immediately after import. Students must change their temporary password when they first sign in. Plaintext credentials are not stored in MongoDB.

Students are automatically flagged when attendance is below 75% or marks are below 50. Mentors can add or remove an additional manual flag and an optional reason. Clearing a manual flag does not clear an automatic academic flag.

Roles and Records
Mentor

Mentors can:

Review student profiles and filter the roster.
Import academic data.
Flag students.
Add counselling sessions, mentor remarks, and intervention records.
Record daily attendance for the following class slots:
8:00–10:00 AM
10:30 AM–12:30 PM
1:30–3:30 PM

Attendance can be recorded as Present, Absent, or OD. Present and OD count toward the attendance percentage.

Assessments

Mentors can create named tests, such as Unit Test 1, add between 1 and 20 subjects, set maximum marks for each subject, and enter corrected marks for each student.

Marks can be edited later. Blank marks remain unentered.

Student

Students can view only their own:

Attendance history
Test and subject marks
Flags
Shared support history

Students can submit counselling requests to their mentor. They cannot edit attendance, academic marks, or mentor records.

Sign-up and Mentor Requests

Both mentors and students can register without spreadsheet or roster data.

Each mentor chooses a unique Mentor ID. Students use a mentor's ID to request access. Requests remain pending until the mentor accepts or rejects them.

Students appear on a mentor's dashboard only after the mentor accepts their request or imports them directly.

Counselling and support records are dated, attributed to their author, and restricted to authenticated users with appropriate access.

Tests and Production Build

Run backend tests:

cd backend
npm test

Build the frontend:

cd frontend
npm run build