import React, { useCallback, useEffect, useState } from 'react';
import api from '../api';

const recordTypes = [
  { value: 'counseling_session', label: 'Counseling session' },
  { value: 'mentor_remark', label: 'Mentor remark' },
  { value: 'intervention', label: 'Intervention' }
];

const attendanceSlots = [
  { value: '08:00-10:00', label: '8:00 AM – 10:00 AM' },
  { value: '10:30-12:30', label: '10:30 AM – 12:30 PM' },
  { value: '13:30-15:30', label: '1:30 PM – 3:30 PM' }
];

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function attendanceKey(rollNo, slot) {
  return `${rollNo}::${slot}`;
}

function MentorDashboard({ user }) {
  const [students, setStudents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [records, setRecords] = useState([]);
  const [requests, setRequests] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [credentials, setCredentials] = useState([]);
  const [attendanceDate, setAttendanceDate] = useState(() => today());
  const [attendance, setAttendance] = useState({});
  const [assessments, setAssessments] = useState([]);
  const [assessmentId, setAssessmentId] = useState('');
  const [assessmentRows, setAssessmentRows] = useState([]);
  const [testName, setTestName] = useState('');
  const [subjects, setSubjects] = useState([{ name: '', maxMarks: '100' }]);
  const [homework, setHomework] = useState([]);
  const [homeworkForm, setHomeworkForm] = useState({ title: '', instructions: '', dueDate: '' });
  const [form, setForm] = useState({ type: 'counseling_session', remarks: '', interventionType: '' });

  const loadStudents = useCallback(async () => {
    const { data } = await api.get('/students', { params: { search, status: filter } });
    setStudents(data);
    setSelected((current) => current ? data.find((student) => student.rollNo === current.rollNo) || null : current);
  }, [filter, search]);

  const loadSummary = useCallback(async () => {
    const { data } = await api.get('/dashboard/summary');
    setSummary(data);
  }, []);

  const loadRequests = useCallback(async () => {
    const { data } = await api.get('/mentorship-requests');
    setRequests(data);
  }, []);

  const loadAttendance = useCallback(async () => {
    const { data } = await api.get('/attendance', { params: { date: attendanceDate } });
    const values = {};
    data.forEach((entry) => { values[attendanceKey(entry.studentRollNo, entry.slot)] = entry.status; });
    setAttendance(values);
  }, [attendanceDate]);

  const loadAssessments = useCallback(async () => {
    const { data } = await api.get('/assessments');
    setAssessments(data);
    setAssessmentId((current) => data.some((assessment) => assessment._id === current) ? current : data[0]?._id || '');
  }, []);

  const loadAssessmentRows = useCallback(async (id) => {
    if (!id) {
      setAssessmentRows([]);
      return;
    }
    const { data } = await api.get(`/assessments/${id}/results`);
    setAssessmentRows(data.students);
  }, []);

  const loadRecords = useCallback(async (rollNo) => {
    if (!rollNo) {
      setRecords([]);
      return;
    }
    const { data } = await api.get('/records', { params: { rollNo } });
    setRecords(data);
  }, []);

  const loadHomework = useCallback(async (rollNo) => {
    if (!rollNo) {
      setHomework([]);
      return;
    }
    const { data } = await api.get('/homework', { params: { rollNo } });
    setHomework(data);
  }, []);

  const refresh = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      await Promise.all([loadStudents(), loadSummary(), loadRequests(), loadAssessments()]);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not load the mentor dashboard.');
    } finally {
      setLoading(false);
    }
  }, [loadAssessments, loadStudents, loadRequests, loadSummary]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    loadAttendance().catch((requestError) => setError(requestError.response?.data?.error || 'Could not load attendance.'));
  }, [loadAttendance]);
  useEffect(() => {
    loadAssessmentRows(assessmentId).catch((requestError) => setError(requestError.response?.data?.error || 'Could not load test marks.'));
  }, [assessmentId, loadAssessmentRows]);
  useEffect(() => {
    loadRecords(selected?.rollNo).catch((requestError) => {
      setError(requestError.response?.data?.error || 'Could not load this student’s records.');
    });
  }, [loadRecords, selected?.rollNo]);
  useEffect(() => {
    loadHomework(selected?.rollNo).catch((requestError) => {
      setError(requestError.response?.data?.error || 'Could not load this student’s homework.');
    });
  }, [loadHomework, selected?.rollNo]);

  const uploadSpreadsheet = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setNotice('');
    setCredentials([]);
    setBusy(true);
    const body = new FormData();
    body.append('file', file);
    try {
      const { data } = await api.post('/students/import', body);
      setCredentials(data.credentials);
      setNotice(`${data.imported} students imported: ${data.created} new accounts created, ${data.updated} existing records updated.`);
      await Promise.all([loadStudents(), loadSummary()]);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'The spreadsheet could not be imported.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const saveRecord = async (event) => {
    event.preventDefault();
    if (!selected) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await api.post('/records', { ...form, studentRollNo: selected.rollNo });
      setForm({ type: 'counseling_session', remarks: '', interventionType: '' });
      setNotice('Student record saved.');
      await Promise.all([loadRecords(selected.rollNo), loadSummary()]);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'The student record could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const assignHomework = async (event) => {
    event.preventDefault();
    if (!selected) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const { data } = await api.post('/homework', {
        rollNo: selected.rollNo,
        ...homeworkForm,
        dueDate: homeworkForm.dueDate || null
      });
      setHomework((current) => [data.homework, ...current]);
      setHomeworkForm({ title: '', instructions: '', dueDate: '' });
      setNotice(`Homework assigned to ${selected.name}.`);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not assign this homework.');
    } finally {
      setBusy(false);
    }
  };

  const saveAttendance = async () => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const entries = students.flatMap((student) => attendanceSlots.map((slot) => ({
        rollNo: student.rollNo,
        slot: slot.value,
        status: attendance[attendanceKey(student.rollNo, slot.value)] || null
      })));
      await api.put('/attendance', { date: attendanceDate, entries });
      setNotice(`Attendance saved for ${new Date(`${attendanceDate}T00:00:00`).toLocaleDateString()}.`);
      await Promise.all([loadStudents(), loadSummary()]);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not save attendance.');
    } finally {
      setBusy(false);
    }
  };

  const createAssessment = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const { data } = await api.post('/assessments', {
        name: testName,
        subjects: subjects.map((subject) => ({ name: subject.name, maxMarks: Number(subject.maxMarks) }))
      });
      setTestName('');
      setSubjects([{ name: '', maxMarks: '100' }]);
      setAssessmentId(data.assessment._id);
      await loadAssessments();
      setAssessmentId(data.assessment._id);
      setNotice(`${data.assessment.name} created with ${data.assessment.subjects.length} subjects.`);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not create the test.');
    } finally {
      setBusy(false);
    }
  };

  const updateAssessmentMark = (rollNo, subjectId, value) => {
    setAssessmentRows((current) => current.map((student) => student.rollNo !== rollNo ? student : ({
      ...student,
      marks: student.marks.map((mark) => mark.subjectId === subjectId
        ? { ...mark, score: value === '' ? null : value }
        : mark)
    })));
  };

  const saveAssessmentMarks = async (student) => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await api.put(`/assessments/${assessmentId}/students/${encodeURIComponent(student.rollNo)}/marks`, {
        marks: student.marks.map((mark) => ({
          subjectId: mark.subjectId,
          score: mark.score === null || mark.score === '' ? null : Number(mark.score)
        }))
      });
      setNotice(`Marks saved for ${student.name}.`);
      await Promise.all([loadAssessmentRows(assessmentId), loadStudents(), loadSummary()]);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not save test marks.');
    } finally {
      setBusy(false);
    }
  };

  const toggleFlag = async (student) => {
    const flagged = !student.manuallyFlagged;
    const reason = flagged ? window.prompt('Add a note for this manual flag (optional):', '') : '';
    if (reason === null) return;
    setError('');
    try {
      await api.patch(`/students/${encodeURIComponent(student.rollNo)}/flag`, { flagged, reason });
      setNotice(flagged ? `${student.name} was flagged for follow-up.` : `Manual flag removed for ${student.name}.`);
      await Promise.all([loadStudents(), loadSummary()]);
      if (selected?.rollNo === student.rollNo) {
        const { data } = await api.get(`/students/${encodeURIComponent(student.rollNo)}`);
        setSelected(data.student);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not update the student flag.');
    }
  };

  const resolveRequest = async (requestId, decision) => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const { data } = await api.patch(`/mentorship-requests/${requestId}`, { decision });
      setRequests((current) => current.filter((request) => request._id !== requestId));
      if (data.request.status === 'accepted') {
        setNotice('Student accepted. Their profile is now in your roster.');
        await Promise.all([loadStudents(), loadSummary()]);
      } else {
        setNotice('Mentorship request declined.');
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not update the mentorship request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="page-heading mentor-page-heading">
        <div className="mentor-heading-copy">
          <span className="eyebrow">MENTOR WORKSPACE</span>
          <h1>Good work starts with knowing your students.</h1>
          <p>Monitor progress, notice when someone needs support, and keep the whole story in one place.</p>
        </div>
        <div className="mentor-connection-visual" role="img" aria-label={`Mentor ${user.name} connected to ${summary?.totalStudents ?? 0} students`}>
          <div className="mentor-network">
            <span className="network-line network-line-one" aria-hidden="true" />
            <span className="network-line network-line-two" aria-hidden="true" />
            <span className="network-line network-line-three" aria-hidden="true" />
            <span className="network-mentor-avatar">{getInitials(user.name)}</span>
            <span className="network-student-avatar network-student-one">{getInitials(students[0]?.name || 'Student')}</span>
            <span className="network-student-avatar network-student-two">{getInitials(students[1]?.name || 'Student')}</span>
            <span className="network-student-avatar network-student-three">{getInitials(students[2]?.name || 'Student')}</span>
          </div>
          <div className="mentor-network-copy">
            <span>GROWING TOGETHER</span>
            <strong>{summary?.totalStudents ?? 0} {summary?.totalStudents === 1 ? 'student' : 'students'} in your circle</strong>
            <small>Progress starts with a connection</small>
          </div>
        </div>
        <label className={`button button-primary upload-button ${busy ? 'is-disabled' : ''}`}>
          <span aria-hidden="true">↑</span> {busy ? 'Working…' : 'Import spreadsheet'}
          <input type="file" accept=".xlsx,.xls" onChange={uploadSpreadsheet} disabled={busy} hidden />
        </label>
      </section>

      <section className="mentor-id-banner">
        <span className="mentor-id-icon">ID</span>
        <div>
          <strong>Your Mentor ID</strong>
          <p>Share this ID with students so they can request to join your mentoring roster.</p>
        </div>
        <span className="mentor-id-value">{user.mentorId}</span>
      </section>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      {requests.length > 0 && (
        <section className="panel mentorship-requests">
          <div className="panel-header">
            <div><h2>Mentorship requests</h2><p>Students asking to join your roster.</p></div>
            <span className="count-pill">{requests.length}</span>
          </div>
          <div className="mentorship-request-list">
            {requests.map((request) => (
              <article className="mentorship-request" key={request._id}>
                <div className="avatar">{request.student?.name?.charAt(0)?.toUpperCase() || 'S'}</div>
                <div className="mentorship-request-student">
                  <strong>{request.student?.name || 'Student'}</strong>
                  <span>{request.student?.rollNo} · {request.student?.department || 'Department not provided'} · Section {request.student?.section || '—'}</span>
                  <small>Requested {new Date(request.createdAt).toLocaleDateString()}</small>
                </div>
                <div className="mentorship-request-actions">
                  <button className="button button-quiet" type="button" onClick={() => resolveRequest(request._id, 'reject')} disabled={busy}>Decline</button>
                  <button className="button button-primary" type="button" onClick={() => resolveRequest(request._id, 'accept')} disabled={busy}>Accept student</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="stat-grid" aria-label="Student overview">
        <StatCard label="Students" value={summary?.totalStudents ?? '—'} detail="In your roster" icon="◉" tone="blue" />
        <StatCard label="Need support" value={summary?.flaggedStudents ?? '—'} detail="Flagged for follow-up" icon="⚑" tone="coral" />
        <StatCard label="Avg. attendance" value={summary ? `${summary.averageAttendance}%` : '—'} detail="Across all students" icon="▥" tone="mint" />
        <StatCard label="Avg. marks" value={summary?.averageMarks ?? '—'} detail="Out of 100" icon="↗" tone="violet" />
      </section>

      <section className="panel attendance-panel">
        <div className="panel-header">
          <div><h2>Daily class attendance</h2><p>Mark each student Present, Absent, or OD for each class slot.</p></div>
          <label className="attendance-date-control">Attendance date
            <input className="text-input" type="date" value={attendanceDate} max={today()} onChange={(event) => setAttendanceDate(event.target.value)} />
          </label>
        </div>
        {students.length ? (
          <>
            <div className="table-scroll">
              <table className="student-table attendance-table">
                <thead><tr><th>STUDENT</th>{attendanceSlots.map((slot) => <th key={slot.value}>{slot.label}</th>)}</tr></thead>
                <tbody>{students.map((student) => (
                  <tr key={student._id}>
                    <td><span className="student-name">{student.name}</span><span className="student-roll">{student.rollNo}</span></td>
                    {attendanceSlots.map((slot) => (
                      <td key={slot.value}>
                        <select className="text-input attendance-select" aria-label={`${student.name}, ${slot.label} attendance`} value={attendance[attendanceKey(student.rollNo, slot.value)] || ''} onChange={(event) => setAttendance((current) => ({ ...current, [attendanceKey(student.rollNo, slot.value)]: event.target.value }))}>
                          <option value="">Not marked</option><option value="present">Present</option><option value="absent">Absent</option><option value="od">OD</option>
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="attendance-actions"><span>OD counts as attended in the attendance percentage.</span><button className="button button-primary" type="button" onClick={saveAttendance} disabled={busy}>{busy ? 'Saving…' : 'Save attendance'}</button></div>
          </>
        ) : <div className="empty-state"><strong>No students in your roster yet</strong><span>Accept a student request or import your students before taking attendance.</span></div>}
      </section>

      <section className="assessment-workspace">
        <div className="panel assessment-create-panel">
          <div className="panel-header"><div><h2>Create a test</h2><p>Set a test name and add the subjects you want to assess.</p></div></div>
          <form className="assessment-create-form" onSubmit={createAssessment}>
            <label className="field-label" htmlFor="assessmentName">Test name</label>
            <input id="assessmentName" className="text-input" placeholder="e.g. Unit Test 1" value={testName} onChange={(event) => setTestName(event.target.value)} maxLength="120" required />
            <div className="assessment-subject-heading"><strong>Subjects</strong><button className="button button-quiet" type="button" onClick={() => setSubjects((current) => current.length < 20 ? [...current, { name: '', maxMarks: '100' }] : current)} disabled={subjects.length >= 20}>+ Add subject</button></div>
            {subjects.map((subject, index) => (
              <div className="assessment-subject-row" key={index}>
                <label className="sr-only" htmlFor={`subject-${index}`}>Subject {index + 1} name</label>
                <input id={`subject-${index}`} className="text-input" placeholder={`Subject ${index + 1}`} value={subject.name} onChange={(event) => setSubjects((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} maxLength="100" required />
                <label className="sr-only" htmlFor={`max-marks-${index}`}>Maximum marks for subject {index + 1}</label>
                <input id={`max-marks-${index}`} className="text-input max-marks-input" type="number" min="1" max="1000" value={subject.maxMarks} onChange={(event) => setSubjects((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, maxMarks: event.target.value } : item))} required />
                <button className="icon-button" type="button" aria-label={`Remove subject ${index + 1}`} onClick={() => setSubjects((current) => current.length > 1 ? current.filter((_, itemIndex) => itemIndex !== index) : current)} disabled={subjects.length === 1}>×</button>
              </div>
            ))}
            <button className="button button-primary button-block" type="submit" disabled={busy || !testName.trim()}>Create test</button>
          </form>
        </div>

        <div className="panel assessment-results-panel">
          <div className="panel-header"><div><h2>Enter test marks</h2><p>Record corrected marks for each student and subject.</p></div></div>
          {assessments.length ? (
            <>
              <div className="assessment-select-wrap"><label className="field-label" htmlFor="assessmentSelect">Test</label><select id="assessmentSelect" className="text-input" value={assessmentId} onChange={(event) => setAssessmentId(event.target.value)}>{assessments.map((assessment) => <option value={assessment._id} key={assessment._id}>{assessment.name}</option>)}</select></div>
              {assessmentRows.length ? <div className="table-scroll">
                <table className="student-table marks-table">
                  <thead><tr><th>STUDENT</th>{(assessments.find((item) => item._id === assessmentId)?.subjects || []).map((subject) => <th key={subject._id}>{subject.name}<span className="max-marks-hint"> / {subject.maxMarks}</span></th>)}<th>SAVE</th></tr></thead>
                  <tbody>{assessmentRows.map((student) => (
                    <tr key={student._id}>
                      <td><span className="student-name">{student.name}</span><span className="student-roll">{student.rollNo}</span></td>
                      {student.marks.map((mark, index) => {
                        const subject = assessments.find((item) => item._id === assessmentId)?.subjects[index];
                        return <td key={mark.subjectId}><input className="text-input marks-input" aria-label={`${student.name}, ${subject?.name || 'subject'} mark`} type="number" min="0" max={subject?.maxMarks || 100} step="0.01" placeholder="—" value={mark.score ?? ''} onChange={(event) => updateAssessmentMark(student.rollNo, mark.subjectId, event.target.value)} /></td>;
                      })}
                      <td><button className="button button-outline marks-save-button" type="button" onClick={() => saveAssessmentMarks(student)} disabled={busy}>Save</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div> : <div className="empty-state">No students in your roster to grade.</div>}
            </>
          ) : <div className="empty-state"><strong>No tests created yet</strong><span>Create a test to enter and share subject marks.</span></div>}
        </div>
      </section>

      {credentials.length > 0 && <CredentialNotice credentials={credentials} />}

      <section className="workspace-grid">
        <div className="panel student-panel">
          <div className="panel-header">
            <div><h2>Student roster</h2><p>Choose a student to review their progress and notes.</p></div>
            <span className="count-pill">{students.length}</span>
          </div>
          <div className="roster-controls">
            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <input aria-label="Search students" placeholder="Search name or roll number" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <select aria-label="Filter students" className="filter-select" value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">All students</option>
              <option value="flagged">Needs support</option>
              <option value="on_track">On track</option>
            </select>
          </div>
          {loading ? <div className="empty-state">Loading students…</div> : students.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">◉</span>
              <strong>{search ? 'No matches found' : 'Your roster is ready for its first student'}</strong>
              <span>{search ? 'Try another name or roll number.' : 'Import an Excel spreadsheet to get started.'}</span>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="student-table">
                <thead><tr><th>STUDENT</th><th>ATTENDANCE</th><th>MARKS (%)</th><th>TOTAL MARKS</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student._id} className={selected?.rollNo === student.rollNo ? 'active-row' : ''} onClick={() => setSelected(student)}>
                      <td><span className="student-name">{student.name}</span><span className="student-roll">{student.rollNo}</span></td>
                      <td><MetricBar label="Attendance" value={student.attendance} threshold={75} suffix="%" /></td>
                      <td><MetricBar label="Academic marks" value={student.marks} threshold={50} /></td>
                      <td><MetricValue value={student.totalMarks ?? student.marks} suffix="" /></td>
                      <td><span className={`status-badge ${student.isFlagged ? 'status-flagged' : 'status-good'}`}>{student.isFlagged ? 'Follow up' : 'On track'}</span></td>
                      <td><button className="icon-button" aria-label={student.manuallyFlagged ? `Remove manual flag from ${student.name}` : `Manually flag ${student.name}`} title={student.manuallyFlagged ? 'Remove manual flag' : 'Flag for follow-up'} onClick={(event) => { event.stopPropagation(); toggleFlag(student); }}>{student.manuallyFlagged ? '⚑' : '⚐'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="panel detail-panel">
          {selected ? (
            <>
              <div className="detail-heading">
                <div className="avatar avatar-large">{selected.name.charAt(0).toUpperCase()}</div>
                <div><span className="eyebrow">STUDENT PROFILE</span><h2>{selected.name}</h2><span className="student-roll">{selected.rollNo}</span></div>
              </div>
              <div className="detail-metrics">
                <MetricTile label="Attendance" value={`${selected.attendance}%`} tone={selected.attendance < 75 ? 'warning' : ''} />
                <MetricTile label="Academic marks" value={selected.marks} tone={selected.marks < 50 ? 'warning' : ''} />
                <MetricTile label="Total marks" value={selected.totalMarks ?? selected.marks} />
              </div>
              <div className="mentor-progress-charts" aria-label="Student attendance and academic marks charts">
                <MetricChart label="Attendance" value={selected.attendance} threshold={75} />
                <MetricChart label="Academic marks" value={selected.marks} threshold={50} />
              </div>
              {selected.subjectMarks?.length > 0 && (
                <div className="imported-subject-marks">
                  <strong>Imported subject marks</strong>
                  {selected.subjectMarks.map((item) => <span key={item.subject}>{item.subject}: {item.score}</span>)}
                </div>
              )}
              {selected.isFlagged && (
                <div className="flag-reasons"><strong>Follow-up reasons</strong>{selected.flagReasons?.map((reason) => <span key={reason}>• {reason}</span>)}</div>
              )}
              <div className="section-divider" />
              <div className="panel-header compact-header"><div><h3>Support history</h3><p>Counseling, remarks and interventions</p></div><span className="count-pill">{records.length}</span></div>
              <RecordList records={records} />
              <div className="homework-section">
                <div className="panel-header compact-header"><div><h3>Assigned homework</h3><p>Work assigned to {selected.name}</p></div><span className="count-pill">{homework.length}</span></div>
                {homework.length ? (
                  <div className="homework-list">
                    {homework.map((item) => (
                      <article className="homework-item" key={item._id}>
                        <div className="homework-title-row"><strong>{item.title}</strong>{item.dueDate && <time>Due {formatDate(item.dueDate)}</time>}</div>
                        <p>{item.instructions}</p>
                      </article>
                    ))}
                  </div>
                ) : <p className="homework-empty">No homework assigned to this student yet.</p>}
                <form className="homework-form" onSubmit={assignHomework}>
                  <h3>Assign homework</h3>
                  <label className="field-label" htmlFor="homeworkTitle">Title</label>
                  <input id="homeworkTitle" className="text-input" placeholder="e.g. Chapter 4 practice" value={homeworkForm.title} onChange={(event) => setHomeworkForm((current) => ({ ...current, title: event.target.value }))} maxLength="120" required />
                  <label className="field-label" htmlFor="homeworkInstructions">Instructions</label>
                  <textarea id="homeworkInstructions" className="text-input text-area" placeholder="Describe the work to complete…" value={homeworkForm.instructions} onChange={(event) => setHomeworkForm((current) => ({ ...current, instructions: event.target.value }))} maxLength="5000" required />
                  <label className="field-label" htmlFor="homeworkDueDate">Due date <span className="field-hint">Optional</span></label>
                  <input id="homeworkDueDate" className="text-input" type="date" value={homeworkForm.dueDate} onChange={(event) => setHomeworkForm((current) => ({ ...current, dueDate: event.target.value }))} />
                  <button className="button button-primary button-block" type="submit" disabled={busy || !homeworkForm.title.trim() || !homeworkForm.instructions.trim()}>{busy ? 'Assigning…' : 'Assign homework'}</button>
                </form>
              </div>
              <form className="record-form" onSubmit={saveRecord}>
                <h3>Add a note</h3>
                <label className="field-label" htmlFor="recordType">Record type</label>
                <select id="recordType" className="text-input" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
                  {recordTypes.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}
                </select>
                {form.type === 'intervention' && (
                  <>
                    <label className="field-label" htmlFor="interventionType">Intervention</label>
                    <input id="interventionType" className="text-input" placeholder="e.g. Study plan, parent meeting" value={form.interventionType} onChange={(event) => setForm({ ...form, interventionType: event.target.value })} />
                  </>
                )}
                <label className="field-label" htmlFor="recordRemarks">Session notes</label>
                <textarea id="recordRemarks" className="text-input text-area" placeholder="Add a helpful, factual note…" value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} maxLength="5000" required />
                <button className="button button-primary button-block" type="submit" disabled={busy || !form.remarks.trim()}>{busy ? 'Saving…' : 'Save student record'}</button>
              </form>
            </>
          ) : (
            <div className="empty-state detail-empty">
              <span className="empty-icon">✳</span>
              <strong>Select a student</strong>
              <span>Choose someone from the roster to see their progress and support history.</span>
            </div>
          )}
        </aside>
      </section>
    </>
  );
}

function StatCard({ label, value, detail, icon, tone }) {
  return (
    <article className="stat-card">
      <span className={`stat-icon icon-${tone}`}>{icon}</span>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-detail">{detail}</span>
    </article>
  );
}

function MetricValue({ value, suffix, warning }) {
  return <span className={warning ? 'metric-value metric-warning' : 'metric-value'}>{value}{suffix}</span>;
}

function MetricBar({ label, value, threshold, suffix = '' }) {
  const normalized = Math.min(100, Math.max(0, Number(value) || 0));
  const warning = normalized < threshold;
  return (
    <div className="roster-metric-chart" aria-label={`${label}: ${value}${suffix}`}>
      <span className={warning ? 'metric-value metric-warning' : 'metric-value'}>{value}{suffix}</span>
      <span className="roster-meter-track" role="img" aria-label={`${label} ${normalized}%`}>
        <span className={warning ? 'roster-meter-fill meter-warning' : 'roster-meter-fill'} style={{ width: `${normalized}%` }} />
      </span>
    </div>
  );
}

function MetricChart({ label, value, threshold }) {
  const normalized = Math.min(100, Math.max(0, Number(value) || 0));
  const warning = normalized < threshold;
  return (
    <div className={`metric-chart${warning ? ' metric-chart-warning' : ''}`}>
      <div className="metric-chart-heading"><span>{label}</span><strong>{value}%</strong></div>
      <div className="metric-chart-track" role="progressbar" aria-label={label} aria-valuenow={normalized} aria-valuemin="0" aria-valuemax="100">
        <span style={{ width: `${normalized}%` }} />
        <i style={{ left: `${threshold}%` }} aria-hidden="true" />
      </div>
      <small>Support threshold: {threshold}%</small>
    </div>
  );
}

function MetricTile({ label, value, tone }) {
  return <div className="metric-tile"><span>{label}</span><strong className={tone === 'warning' ? 'metric-warning' : ''}>{value}</strong></div>;
}

function RecordList({ records }) {
  if (!records.length) return <p className="history-empty">No support records yet.</p>;
  return (
    <ol className="record-list">
      {records.map((record) => (
        <li className="record-item" key={record._id}>
          <span className={`record-dot dot-${record.type}`} />
          <div className="record-copy">
            <div className="record-title-row"><strong>{recordTypeLabel(record.type)}</strong><time>{formatDate(record.date)}</time></div>
            {record.interventionType && <span className="intervention-label">{record.interventionType}</span>}
            <p>{record.remarks}</p>
            <span className="record-author">By {record.createdByName || 'Mentor'}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function CredentialNotice({ credentials }) {
  const safeCell = (value) => {
    const text = String(value).replace(/"/g, '""');
    return /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  };
  const download = () => {
    const lines = [
      ['rollNo', 'name', 'temporaryPassword'],
      ...credentials.map((credential) => [credential.rollNo, credential.name, credential.temporaryPassword])
    ];
    const csv = lines.map((row) => row.map((cell) => `"${safeCell(cell)}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'student-temporary-passwords.csv';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="credential-notice">
      <span className="credential-icon">!</span>
      <div><strong>Save these one-time student passwords now</strong><p>New passwords are shown only for this import. Share each one privately; students must change it when they first sign in.</p></div>
      <button type="button" className="button button-outline" onClick={download}>Download credentials</button>
    </section>
  );
}

function recordTypeLabel(type) {
  return {
    counseling_session: 'Counseling session',
    mentor_remark: 'Mentor remark',
    intervention: 'Intervention',
    student_request: 'Student request'
  }[type] || 'Student record';
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getInitials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
}

export default MentorDashboard;
