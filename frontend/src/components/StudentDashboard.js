import React, { useEffect, useState } from 'react';
import api from '../api';

const recordNames = {
  counseling_session: 'Counseling session',
  mentor_remark: 'Mentor remark',
  intervention: 'Intervention',
  student_request: 'Counseling request'
};

const attendanceSlotNames = {
  '08:00-10:00': '8:00 AM – 10:00 AM',
  '10:30-12:30': '10:30 AM – 12:30 PM',
  '13:30-15:30': '1:30 PM – 3:30 PM'
};

function StudentDashboard({ user }) {
  const [student, setStudent] = useState(null);
  const [records, setRecords] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [homework, setHomework] = useState([]);
  const [remarks, setRemarks] = useState('');
  const [mentorId, setMentorId] = useState('');
  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadDashboard = async () => {
    setError('');
    try {
      const [profile, history, mentorAssignment, attendanceHistory, assessmentHistory, homeworkList] = await Promise.all([
        api.get('/students/me'),
        api.get('/records'),
        api.get('/mentorship-requests/me'),
        api.get('/attendance/me'),
        api.get('/assessments/me'),
        api.get('/homework/me')
      ]);
      setStudent(profile.data.student);
      setRecords(history.data);
      setAssignment(mentorAssignment.data.assignment);
      setAttendance(attendanceHistory.data);
      setAssessments(assessmentHistory.data);
      setHomework(homeworkList.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not load your student dashboard.');
    } finally {
      setLoading(false);
    }
  };

  const requestMentor = async (event) => {
    event.preventDefault();
    setSending(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.post('/mentorship-requests', { mentorId });
      setAssignment(data.request);
      setMentorId('');
      setNotice(`Request sent to ${data.request.mentor.name}. You’ll see your mentor in your dashboard after they accept.`);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Your mentor request could not be sent.');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => { loadDashboard(); }, []);

  const requestCounseling = async (event) => {
    event.preventDefault();
    setSending(true);
    setError('');
    setNotice('');
    try {
      await api.post('/records', {
        studentRollNo: user.rollNo,
        type: 'student_request',
        remarks
      });
      setRemarks('');
      setNotice('Your request has been shared with your mentor.');
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Your request could not be sent.');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="loading-card">Loading your progress…</div>;

  return (
    <>
      <section className="student-welcome">
        <div className="student-welcome-copy">
          <span className="eyebrow">YOUR STUDENT SPACE</span>
          <h1>Keep going, {student?.name?.split(' ')[0] || user.name}.</h1>
          <p>Your progress is a journey. Here’s where you are today.</p>
        </div>
        <div className="student-connection-visual" role="img" aria-label={`Student ${student?.name || user.name} and ${assignment?.status === 'accepted' ? `mentor ${assignment.mentor?.name || 'assigned'}` : 'a future mentor'}`}>
          <span className="connection-label">YOUR MENTORING CONNECTION</span>
          <div className="connection-people">
            <div className="connection-person">
              <span className="connection-avatar student-avatar">{getInitials(student?.name || user.name)}</span>
              <span>YOU</span>
            </div>
            <span className={`connection-line${assignment?.status === 'accepted' ? ' connection-active' : ''}`} aria-hidden="true"><i /></span>
            <div className="connection-person">
              <span className="connection-avatar mentor-avatar">{assignment?.status === 'accepted' ? getInitials(assignment.mentor?.name || 'Mentor') : 'M'}</span>
              <span>{assignment?.status === 'accepted' ? 'MENTOR' : 'YOUR MENTOR'}</span>
            </div>
          </div>
          <strong>{assignment?.status === 'accepted' ? assignment.mentor?.name || 'Mentor assigned' : assignment?.status === 'pending' ? 'Request in progress' : 'A partner in your progress'}</strong>
          <span className="connection-caption">{assignment?.status === 'accepted' ? 'Learning and support, together' : assignment?.status === 'pending' ? 'Your mentor will respond soon' : 'Connect with a mentor to get started'}</span>
        </div>
        <div className="roll-card"><span>STUDENT ID</span><strong>{student?.rollNo || user.rollNo}</strong></div>
      </section>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      {student?.isFlagged && (
        <section className="student-support-banner">
          <span className="support-symbol">✳</span>
          <div><strong>Your mentor is keeping an eye out for you.</strong><p>Support is here to help you move forward. Reach out whenever you need a conversation.</p></div>
        </section>
      )}
      <section className="student-metrics">
        <ProgressCard title="Attendance" value={student?.attendance || 0} suffix="%" threshold={75} description="Showing up is a great first step." tone="blue" />
        <ProgressCard title="Academic marks" value={student?.marks || 0} suffix="/ 100" threshold={50} description="Every effort adds up." tone="mint" />
      </section>
      <section className="student-academics-grid">
        <div className="panel student-attendance-panel">
          <div className="panel-header"><div><span className="eyebrow">DAILY CLASSES</span><h2>Attendance history</h2><p>Your attendance for each class slot.</p></div></div>
          {attendance.length ? (
            <div className="student-attendance-list">
              {attendance.map((entry) => (
                <article className="student-attendance-entry" key={entry._id}>
                  <div><strong>{formatDate(entry.date)}</strong><span>{attendanceSlotNames[entry.slot] || entry.slot}</span></div>
                  <span className={`attendance-status status-${entry.status}`}>{entry.status === 'od' ? 'OD' : entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}</span>
                </article>
              ))}
            </div>
          ) : <div className="empty-state"><strong>No class attendance recorded yet</strong><span>Your mentor’s daily attendance will appear here.</span></div>}
        </div>
        <div className="panel student-assessment-panel">
          <div className="panel-header"><div><span className="eyebrow">TESTS & EXAMS</span><h2>Subject marks</h2><p>Marks shared by your mentor after correction.</p></div></div>
          {assessments.length ? (
            <div className="student-assessment-list">
              {assessments.map((assessment) => (
                <article className="student-assessment-card" key={assessment._id}>
                  <h3>{assessment.name}</h3>
                  <div className="student-subject-marks">
                    {assessment.marks.map((mark) => (
                      <div className="student-subject-mark" key={mark.subjectId}>
                        <span>{mark.subject}</span>
                        <strong>{mark.score === null ? 'Not entered' : `${mark.score} / ${mark.maxMarks}`}</strong>
                        <span className="subject-mark-track" role="img" aria-label={mark.score === null ? `${mark.subject} mark not entered` : `${mark.subject} ${Math.round(mark.score / mark.maxMarks * 100)} percent`}>
                          {mark.score !== null && <i style={{ width: `${Math.min(100, Math.max(0, mark.score / mark.maxMarks * 100))}%` }} />}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : <div className="empty-state"><strong>No test marks shared yet</strong><span>Your mentor’s tests and corrected marks will appear here.</span></div>}
        </div>
      </section>
      <section className="panel student-homework-panel">
        <div className="panel-header"><div><span className="eyebrow">YOUR NEXT STEPS</span><h2>Homework</h2><p>Assignments from your mentor.</p></div><span className="count-pill">{homework.length}</span></div>
        {homework.length ? (
          <div className="homework-list student-homework-list">
            {homework.map((item) => (
              <article className="homework-item" key={item._id}>
                <div className="homework-title-row"><strong>{item.title}</strong>{item.dueDate && <time>Due {formatDate(item.dueDate)}</time>}</div>
                <p>{item.instructions}</p>
                <span className="homework-assigned-date">Assigned {formatDate(item.createdAt)}</span>
              </article>
            ))}
          </div>
        ) : <div className="empty-state"><strong>No homework assigned yet</strong><span>New assignments from your mentor will appear here.</span></div>}
      </section>
      {assignment?.status === 'accepted' ? (
        <section className="student-mentor-status">
          <span className="mentor-id-icon">✓</span>
          <div><strong>Your mentor: {assignment.mentor?.name || 'Assigned'}</strong><p>Mentor ID: {assignment.mentor?.mentorId}</p></div>
        </section>
      ) : (
        <div className="student-link-grid">
          <form className="panel link-mentor-panel" onSubmit={requestMentor}>
            <span className="request-icon">✳</span>
            <span className="eyebrow">CONNECT WITH A MENTOR</span>
            <h2>Join your mentor’s roster</h2>
            <p>Enter the Mentor ID they shared with you. Your mentor will need to accept your request before your academic progress is shared.</p>
            {assignment?.status === 'pending' && (
              <div className="mentor-request-pending">
                <strong>Request pending</strong>
                <span>Waiting for {assignment.mentor?.name || 'your mentor'} to respond to your request.</span>
              </div>
            )}
            {assignment?.status === 'rejected' && (
              <div className="alert alert-error">Your previous request was declined. Check the Mentor ID and try again.</div>
            )}
            {assignment?.status !== 'pending' && (
              <>
                <label className="field-label" htmlFor="mentorId">Mentor ID</label>
                <input id="mentorId" className="text-input" placeholder="Enter the ID your mentor shared" value={mentorId} onChange={(event) => setMentorId(event.target.value)} maxLength="40" required />
                <button className="button button-primary button-block" type="submit" disabled={sending || !mentorId.trim()}>{sending ? 'Sending…' : 'Request to join'} <span aria-hidden="true">→</span></button>
              </>
            )}
          </form>
        </div>
      )}
      <section className="student-content-grid">
        <div className="panel history-panel">
          <div className="panel-header"><div><span className="eyebrow">YOUR STORY</span><h2>Mentoring & support history</h2><p>Notes and check-ins shared with you and your mentor.</p></div></div>
          {records.length ? (
            <ol className="record-list student-record-list">
              {records.map((record) => (
                <li className="record-item" key={record._id}>
                  <span className={`record-dot dot-${record.type}`} />
                  <div className="record-copy">
                    <div className="record-title-row"><strong>{recordNames[record.type] || 'Student record'}</strong><time>{formatDate(record.date)}</time></div>
                    {record.interventionType && <span className="intervention-label">{record.interventionType}</span>}
                    <p>{record.remarks}</p>
                    <span className="record-author">Shared by {record.createdByName || 'your mentor'}</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-state history-empty-state"><span className="empty-icon">✳</span><strong>Your story starts here</strong><span>When you meet with your mentor, your shared notes will appear here.</span></div>
          )}
        </div>
        {student?.isAssignedToMentor && <form className="panel request-panel" onSubmit={requestCounseling}>
          <span className="request-icon">✉</span>
          <span className="eyebrow">WE’RE HERE FOR YOU</span>
          <h2>Ask for a conversation</h2>
          <p>Want to talk something through? Send your mentor a private request to connect.</p>
          <label className="field-label" htmlFor="requestMessage">What would you like help with?</label>
          <textarea id="requestMessage" className="text-input text-area request-textarea" placeholder="Share as much or as little as you like…" value={remarks} onChange={(event) => setRemarks(event.target.value)} maxLength="5000" required />
          <button className="button button-primary button-block" type="submit" disabled={sending || !remarks.trim()}>{sending ? 'Sending…' : 'Send a request'} <span aria-hidden="true">→</span></button>
          <span className="privacy-note">Your message is only visible to your mentor.</span>
        </form>}
      </section>
    </>
  );
}

function ProgressCard({ title, value, suffix, threshold, description, tone }) {
  const isLow = value < threshold;
  const progress = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <article className={`progress-card progress-${tone}${isLow ? ' progress-low' : ''}`}>
      <div className="progress-heading"><span className="stat-icon">{title === 'Attendance' ? '▥' : '↗'}</span><span>{title}</span></div>
      <div className="progress-visual-row">
        <div className="progress-ring" role="progressbar" aria-label={`${title} ${progress}%`} aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100" style={{ '--ring-progress': `${progress}%` }}>
          <span>{progress}<small>%</small></span>
        </div>
        <div className="progress-visual-copy">
          <strong className={isLow ? 'progress-value metric-warning' : 'progress-value'}>{value}<small>{suffix}</small></strong>
          <span>{isLow ? `Below ${threshold}% target` : `Target: ${threshold}%`}</span>
        </div>
      </div>
      <div className="progress-track" role="progressbar" aria-label={`${title} progress bar`} aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${progress}%` }} /></div>
      <p>{isLow ? 'A little extra support can make a difference.' : description}</p>
    </article>
  );
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getInitials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
}

export default StudentDashboard;
