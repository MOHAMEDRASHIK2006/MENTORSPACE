# MentorSpace — Student Mentoring & Counselling Management

MentorSpace is a MERN application for managing student academic progress, attendance, mentor remarks, counseling sessions, intervention history, and student support requests.

## Requirements

- Node.js 18 or newer
- MongoDB 6 or newer

## Run locally

1. Start MongoDB.
2. In `backend`, install dependencies and copy `.env.example` to `.env`. Replace `JWT_SECRET` with a random secret of at least 32 characters.
3. Create the first mentor account and start the API:

   ```powershell
   cd backend
   npm install
   npm run create-mentor
   npm start
   ```

   The mentor-creation command asks for mentor profile details, a Mentor ID, and a password. It stores a bcrypt password hash, not the password.

   Mentors may also register using the **Create an account** button on the login page; they choose a unique Mentor ID and can receive student requests immediately. Students register independently and do not need to be on an imported roster. After signing in, they use a mentor's ID to request access to that mentor's roster.

4. In a second terminal, start the web application:

   ```powershell
   cd frontend
   npm install
   npm start
   ```

   Open <http://localhost:3000>. The React development server forwards `/api` requests to the API on port 5050.

For production, set `NODE_ENV=production`, configure a random `JWT_SECRET` (at least 32 characters), `MONGO_URI`, and `FRONTEND_ORIGIN`. Serve the frontend and API over HTTPS. The API refuses production startup without a valid JWT secret.

### Password recovery email

Password recovery requires an SMTP mail account. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and `FRONTEND_URL` in the backend environment. Students and mentors request a reset link using their account email; the single-use link expires after 30 minutes. A password cannot be reset without access to that email link.

## Import student data

Mentors can import `.xlsx` spreadsheets from the mentor dashboard. The first worksheet must have a student name, registration ID (also accepted as `rollNo` or `registrationNumber`), attendance, and either a `marks` column or one numeric score column for each subject. `dateOfBirth` is optional.

| registrationId | name | Mathematics | Physics | totalSubjects | attendance |
|---|---|---:|---:|---:|---:|
| 101 | Jamie Lee | 86 | 74 | 2 | 88 |
| 102 | Morgan Ray | 55 | 45 | 2 | 68 |

Header matching ignores case, spaces, underscores, and hyphens. Subject score columns are identified by their headers; the optional `totalSubjects` value must match the number of subject columns. Subject scores may be between 0 and 1,000. The mentor roster displays their sum as total marks and shows the individual scores in each student profile; the average subject score (capped at 100) is used for the existing academic progress indicator. Attendance must be between 0 and 100. Imports are limited to 1,000 students and 10 MB per file; invalid rows reject the whole import. Imported students are assigned to the importing mentor. Re-importing an existing roll number updates the name, attendance, and academic data without resetting that student's password or removing a manual flag. A registration number may use any format, but must be unique.

New student accounts receive a randomly generated temporary password. The mentor can download the new credentials as a CSV immediately after import. Share each credential privately: students are required to change the temporary password when they first sign in. The plaintext credentials are not stored in MongoDB.

Students are automatically flagged when attendance is below 75% or marks are below 50. Mentors may add or remove an additional manual flag and optional reason; clearing a manual flag does not clear an automatic academic flag.

## Roles and records

- **Mentor:** Reviews all student profiles, filters the roster, imports academic data, flags students, and adds counseling sessions, mentor remarks, and intervention records. Mentors can record daily attendance for the 8:00–10:00 AM, 10:30 AM–12:30 PM, and 1:30–3:30 PM class slots as Present, Absent, or OD. Present and OD count toward the attendance percentage.
- **Assessments:** Mentors create named tests (for example, Unit Test 1), add between 1 and 20 subjects, set each subject's maximum marks, and enter corrected marks per student. Marks can be edited later; blank marks remain unentered.
- **Student:** Views only their own attendance history, test and subject marks, flags, and shared support history. Students can submit a counseling request visible to their mentor; they cannot edit attendance, academic marks, or mentor records.
- **Sign-up and mentor requests:** Both roles can register without spreadsheet or roster data. Each mentor chooses a unique Mentor ID (no specific format). A student enters the ID from their dashboard to request a mentor; the request stays pending until the mentor accepts or rejects it. Students appear in a mentor's dashboard only after acceptance or when directly imported by that mentor.
- Counseling and support records are dated, attributed to their author, and limited to the student's and mentors' authenticated sessions.

## Tests and production build

```powershell
cd backend
npm test
```

```powershell
cd frontend
npm run build
```
