import React, { useEffect, useState } from 'react';
import api from './api';
import MentorDashboard from './components/MentorDashboard';
import StudentDashboard from './components/StudentDashboard';
import './styles.css';

function App() {
  const [theme, setTheme] = useState(() => {
    try {
      const savedTheme = localStorage.getItem('mentoring.theme');
      return savedTheme === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('mentoring.session')) || null;
    } catch {
      localStorage.removeItem('mentoring.session');
      return null;
    }
  });
  const [checkingSession, setCheckingSession] = useState(Boolean(session));
  const [error, setError] = useState('');
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const [authView, setAuthView] = useState(() => new URLSearchParams(window.location.search).has('token') ? 'reset' : 'login');
  const [forgotRole, setForgotRole] = useState('student');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('mentoring.theme', theme);
    } catch {
      // The theme remains applied for this session when storage is unavailable.
    }
  }, [theme]);

  const toggleTheme = () => setTheme((current) => current === 'dark' ? 'light' : 'dark');

  useEffect(() => {
    const validateSession = async () => {
      if (!session?.token) {
        setCheckingSession(false);
        return;
      }
      try {
        const { data } = await api.get('/auth/me');
        setSession((current) => {
          const next = { ...current, user: data.user };
          localStorage.setItem('mentoring.session', JSON.stringify(next));
          return next;
        });
      } catch {
        localStorage.removeItem('mentoring.session');
        setSession(null);
      } finally {
        setCheckingSession(false);
      }
    };
    validateSession();
  }, []);

  useEffect(() => {
    const expireSession = () => {
      localStorage.removeItem('mentoring.session');
      setSession(null);
      setError('Your session expired. Please sign in again.');
    };
    window.addEventListener('mentoring:session-expired', expireSession);
    return () => window.removeEventListener('mentoring:session-expired', expireSession);
  }, []);

  const saveSession = (data) => {
    const next = { token: data.token, user: data.user };
    localStorage.setItem('mentoring.session', JSON.stringify(next));
    setSession(next);
  };

  const handleLogin = async (credentials) => {
    setError('');
    try {
      const { data } = await api.post('/auth/login', credentials);
      saveSession(data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || (
        requestError.request
          ? 'Could not reach the sign-in service. Check that the backend is running, then try again.'
          : 'Unable to sign in. Please try again.'
      ));
    }
  };

  const handleSignup = async (profile) => {
    setError('');
    try {
      const { data } = await api.post('/auth/signup', profile);
      saveSession(data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to create your account. Please try again.');
    }
  };

  const handlePasswordReset = () => {
    setResetToken('');
    setAuthView('login');
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  const handleLogout = () => {
    localStorage.removeItem('mentoring.session');
    setSession(null);
    setError('');
  };

  const handlePasswordChanged = () => {
    setSession((current) => {
      const next = { ...current, user: { ...current.user, mustChangePassword: false } };
      localStorage.setItem('mentoring.session', JSON.stringify(next));
      return next;
    });
  };

  if (checkingSession) {
    return (
      <>
        <ThemeToggle theme={theme} onToggle={toggleTheme} floating />
        <main className="loading-screen">
          <span className="brand-mark">M</span>
          <p>Opening your mentoring workspace…</p>
        </main>
      </>
    );
  }

  if (resetToken) {
    return (
      <>
        <ThemeToggle theme={theme} onToggle={toggleTheme} floating />
        <ResetPasswordPage token={resetToken} onComplete={handlePasswordReset} />
      </>
    );
  }

  if (!session) {
    return (
      <>
        <ThemeToggle theme={theme} onToggle={toggleTheme} floating />
        {authView === 'signup'
          ? <SignupPage onSignup={handleSignup} error={error} onShowLogin={() => { setError(''); setAuthView('login'); }} />
          : authView === 'forgot'
            ? <ForgotPasswordPage onShowLogin={() => { setError(''); setAuthView('login'); }} initialRole={forgotRole} />
            : <LoginPage onLogin={handleLogin} error={error} onShowSignup={() => { setError(''); setAuthView('signup'); }} onShowForgot={(role) => { setError(''); setAuthView('forgot'); setForgotRole(role); }} />}
      </>
    );
  }

  if (session.user.mustChangePassword) {
    return (
      <>
        <ThemeToggle theme={theme} onToggle={toggleTheme} floating />
        <ChangePasswordPage
          onComplete={handlePasswordChanged}
          onLogout={handleLogout}
        />
      </>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="MentorSpace home">
          <span className="brand-mark">M</span>
          <span>Mentor<span className="brand-light">Space</span></span>
        </a>
        <div className="topbar-user">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <div className="avatar">{session.user.name?.charAt(0)?.toUpperCase() || 'M'}</div>
          <div className="user-meta">
            <strong>{session.user.name}</strong>
            <span>{session.user.role === 'mentor' ? `Mentor · ${session.user.mentorId || ''}` : `Student · ${session.user.rollNo}`}</span>
          </div>
          <button className="button button-quiet logout-button" onClick={handleLogout}>Sign out</button>
        </div>
      </header>
      <main className="page-content">
        {session.user.role === 'mentor'
          ? <MentorDashboard user={session.user} />
          : <StudentDashboard user={session.user} />}
      </main>
      <footer className="app-footer">MentorSpace <span>·</span> Student progress, supported together</footer>
    </div>
  );
}

function ThemeToggle({ theme, onToggle, floating = false }) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      className={`button button-quiet theme-toggle${floating ? ' theme-toggle-floating' : ''}`}
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
      <span>{theme === 'dark' ? 'Light' : 'Dark'} theme</span>
    </button>
  );
}

function LoginPage({ onLogin, error, onShowSignup, onShowForgot }) {
  const [role, setRole] = useState('student');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onLogin({ role, identifier: identifier.trim(), password });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-screen">
      <section className="login-panel">
        <a className="brand login-brand" href="/">
          <span className="brand-mark">M</span>
          <span>Mentor<span className="brand-light">Space</span></span>
        </a>
        <div className="login-copy">
          <span className="eyebrow">A better way to grow</span>
          <h1>Progress starts<br />with a conversation.</h1>
          <p>Track learning, celebrate progress, and make sure every student gets the support they need.</p>
        </div>
        <div className="login-note">
          <span className="note-icon">✦</span>
          <span>Academic progress and student support, all in one place.</span>
        </div>
      </section>
      <section className="login-form-wrap">
        <form className="login-card" onSubmit={submit}>
          <div className="mobile-brand brand">
            <span className="brand-mark">M</span>
            <span>Mentor<span className="brand-light">Space</span></span>
          </div>
          <span className="eyebrow">WELCOME BACK</span>
          <h2>Sign in to your account</h2>
          <p className="muted">Choose your workspace to continue.</p>
          <div className="role-picker" role="group" aria-label="Choose account type">
            <button type="button" className={role === 'student' ? 'role-option selected' : 'role-option'} onClick={() => { setRole('student'); setIdentifier(''); }}>
              <span className="role-icon">◎</span>
              <span><strong>Student</strong><small>My progress</small></span>
            </button>
            <button type="button" className={role === 'mentor' ? 'role-option selected' : 'role-option'} onClick={() => { setRole('mentor'); setIdentifier(''); }}>
              <span className="role-icon">✳</span>
              <span><strong>Mentor</strong><small>Student support</small></span>
            </button>
          </div>
          <label className="field-label" htmlFor="identifier">{role === 'mentor' ? 'Email address or Mentor ID' : 'Student registration number'}</label>
          <input
            id="identifier"
            className="text-input"
            autoComplete={role === 'mentor' ? 'email' : 'username'}
            type="text"
            placeholder={role === 'mentor' ? 'Enter email or Mentor ID' : 'Enter your registration number'}
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
          />
          <label className="field-label" htmlFor="password">Password</label>
          <input
            id="password"
            className="text-input"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <div className="forgot-password-row">
            <button type="button" onClick={() => onShowForgot(role)}>Forgot password?</button>
          </div>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <button className="button button-primary button-block" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'} <span aria-hidden="true">→</span>
          </button>
          {role === 'student' && <p className="login-help">Students can create an account without being on a mentor-imported roster. Enter a mentor’s ID after signing in to request mentorship.</p>}
          {role === 'mentor' && <p className="login-help">New mentor? Create an account. Mentor registration grants access to student records.</p>}
          <p className="auth-switch">New here? <button type="button" onClick={onShowSignup}>Create an account</button></p>
        </form>
      </section>
    </main>
  );
}

function ForgotPasswordPage({ onShowLogin, initialRole }) {
  const [role, setRole] = useState(initialRole);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSending(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/auth/password-reset/request', { role, email: email.trim() });
      setMessage(data.message);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not contact the password recovery service.');
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="password-screen">
      <form className="password-card recovery-card" onSubmit={submit}>
        <span className="brand-mark">M</span>
        <span className="eyebrow">ACCOUNT RECOVERY</span>
        <h1>Reset your password</h1>
        <p className="muted">We’ll email a one-time reset link if the address matches an account. The link expires in 30 minutes.</p>
        <label className="field-label" htmlFor="recoveryRole">Account type</label>
        <select id="recoveryRole" className="text-input" value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="student">Student</option>
          <option value="mentor">Mentor</option>
        </select>
        <label className="field-label" htmlFor="recoveryEmail">Account email address</label>
        <input id="recoveryEmail" className="text-input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {message && <div className="alert alert-success" role="status">{message}</div>}
        <button className="button button-primary button-block" type="submit" disabled={sending}>{sending ? 'Sending…' : 'Email reset link'}</button>
        <button className="button button-quiet button-block" type="button" onClick={onShowLogin}>Back to sign in</button>
      </form>
    </main>
  );
}

function ResetPasswordPage({ token, onComplete }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (newPassword !== confirmation) {
      setError('The new passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/auth/password-reset/confirm', { token, newPassword });
      setSuccess(data.message);
      setTimeout(onComplete, 1200);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not reset the password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="password-screen">
      <form className="password-card recovery-card" onSubmit={submit}>
        <span className="brand-mark">M</span>
        <span className="eyebrow">SECURE PASSWORD RESET</span>
        <h1>Choose a new password</h1>
        <p className="muted">Use at least 10 characters. This one-time reset link expires after 30 minutes.</p>
        <label className="field-label" htmlFor="resetNewPassword">New password</label>
        <input id="resetNewPassword" className="text-input" type="password" autoComplete="new-password" minLength="10" maxLength="72" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
        <label className="field-label" htmlFor="resetConfirmation">Confirm new password</label>
        <input id="resetConfirmation" className="text-input" type="password" autoComplete="new-password" minLength="10" maxLength="72" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {success && <div className="alert alert-success" role="status">{success}</div>}
        <button className="button button-primary button-block" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Reset password'}</button>
      </form>
    </main>
  );
}

function SignupPage({ onSignup, error, onShowLogin }) {
  const [role, setRole] = useState('student');
  const [profile, setProfile] = useState({
    name: '',
    dateOfBirth: '',
    gender: '',
    mentorId: '',
    department: '',
    section: '',
    registrationNumber: '',
    mobileNumber: '',
    email: '',
    password: '',
    confirmation: '',
    confirmationError: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const update = (field) => (event) => setProfile((current) => ({ ...current, [field]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    if (profile.password !== profile.confirmation) {
      setProfile((current) => ({ ...current, confirmationError: 'Passwords do not match.' }));
      return;
    }
    setProfile((current) => ({ ...current, confirmationError: '' }));
    setSubmitting(true);
    const { confirmation, confirmationError, ...fields } = profile;
    try {
      await onSignup({ ...fields, role });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="signup-screen">
      <section className="signup-card">
        <a className="brand signup-brand" href="/">
          <span className="brand-mark">M</span>
          <span>Mentor<span className="brand-light">Space</span></span>
        </a>
        <span className="eyebrow">JOIN MENTORSPACE</span>
        <h1>Create your account</h1>
        <p className="muted">Tell us a little about yourself to get started.</p>
        <div className="role-picker signup-role-picker" role="group" aria-label="Choose account type">
          <button type="button" className={role === 'student' ? 'role-option selected' : 'role-option'} onClick={() => { setRole('student'); setProfile((current) => ({ ...current, confirmationError: '' })); }}>
            <span className="role-icon">◎</span><span><strong>Student</strong><small>My progress</small></span>
          </button>
          <button type="button" className={role === 'mentor' ? 'role-option selected' : 'role-option'} onClick={() => { setRole('mentor'); setProfile((current) => ({ ...current, confirmationError: '' })); }}>
            <span className="role-icon">✳</span><span><strong>Mentor</strong><small>Student support</small></span>
          </button>
        </div>
        {role === 'mentor' && <div className="alert alert-info">Choose a unique Mentor ID and share it with students who want to request your mentorship.</div>}
        {role === 'student' && <div className="alert alert-info">Create your account now. After signing in, enter your mentor’s ID to request to join their roster.</div>}
        <form className="signup-form" onSubmit={submit}>
          {role === 'student' && (
            <Field label="Registration number" htmlFor="signupRegistration">
              <input id="signupRegistration" className="text-input" value={profile.registrationNumber} onChange={update('registrationNumber')} autoComplete="off" required />
            </Field>
          )}
          {role === 'mentor' && (
            <Field label="Mentor ID" htmlFor="signupMentorId">
              <input id="signupMentorId" className="text-input" value={profile.mentorId} onChange={update('mentorId')} maxLength="60" autoComplete="off" required />
              <span className="field-hint">Choose an ID students can enter to send you a request.</span>
            </Field>
          )}
          <Field label="Full name" htmlFor="signupName">
            <input id="signupName" className="text-input" value={profile.name} onChange={update('name')} autoComplete="name" minLength="2" maxLength="120" required />
          </Field>
          <Field label="Date of birth" htmlFor="signupDob">
            <input id="signupDob" className="text-input" type="date" max={new Date().toISOString().slice(0, 10)} value={profile.dateOfBirth} onChange={update('dateOfBirth')} autoComplete="bday" required />
          </Field>
          {role === 'mentor' && (
            <Field label="Gender" htmlFor="signupGender">
              <select id="signupGender" className="text-input" value={profile.gender} onChange={update('gender')} required>
                <option value="">Select an option</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="non_binary">Non-binary</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </Field>
          )}
          <Field label="Department" htmlFor="signupDepartment">
            <input id="signupDepartment" className="text-input" value={profile.department} onChange={update('department')} maxLength="120" required />
          </Field>
          {role === 'student' && (
            <Field label="Section" htmlFor="signupSection">
              <input id="signupSection" className="text-input" value={profile.section} onChange={update('section')} maxLength="40" required />
            </Field>
          )}
          <Field label="Mobile number" htmlFor="signupMobile">
            <input id="signupMobile" className="text-input" type="tel" value={profile.mobileNumber} onChange={update('mobileNumber')} autoComplete="tel" maxLength="20" required />
          </Field>
          <Field label="Email address" htmlFor="signupEmail">
            <input id="signupEmail" className="text-input" type="email" value={profile.email} onChange={update('email')} autoComplete="email" maxLength="254" required />
          </Field>
          <Field label="Password" htmlFor="signupPassword">
            <input id="signupPassword" className="text-input" type="password" value={profile.password} onChange={update('password')} autoComplete="new-password" minLength="10" maxLength="72" required />
            <span className="field-hint">Use at least 10 characters.</span>
          </Field>
          <Field label="Confirm password" htmlFor="signupConfirmation">
            <input id="signupConfirmation" className="text-input" type="password" value={profile.confirmation} onChange={(event) => setProfile((current) => ({ ...current, confirmation: event.target.value, confirmationError: '' }))} autoComplete="new-password" minLength="10" maxLength="72" required />
            {profile.confirmationError && <span className="field-error">{profile.confirmationError}</span>}
          </Field>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <button className="button button-primary button-block" type="submit" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'} <span aria-hidden="true">→</span>
          </button>
        </form>
        <p className="auth-switch">Already have an account? <button type="button" onClick={onShowLogin}>Sign in</button></p>
      </section>
    </main>
  );
}

function Field({ label, htmlFor, children }) {
  return <div className="form-field"><label className="field-label" htmlFor={htmlFor}>{label}</label>{children}</div>;
}

function ChangePasswordPage({ onComplete, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmation) {
      setError('The new passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      onComplete();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to update your password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="password-screen">
      <form className="password-card" onSubmit={submit}>
        <span className="brand-mark">M</span>
        <span className="eyebrow">ONE LAST STEP</span>
        <h1>Set your personal password</h1>
        <p className="muted">For your security, replace the temporary password before opening your student dashboard.</p>
        <label className="field-label" htmlFor="currentPassword">Temporary password</label>
        <input id="currentPassword" className="text-input" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
        <label className="field-label" htmlFor="newPassword">New password</label>
        <input id="newPassword" className="text-input" type="password" autoComplete="new-password" minLength="10" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
        <label className="field-label" htmlFor="confirmation">Confirm new password</label>
        <input id="confirmation" className="text-input" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <button className="button button-primary button-block" type="submit" disabled={saving}>{saving ? 'Updating…' : 'Save new password'}</button>
        <button className="button button-quiet button-block" type="button" onClick={onLogout}>Sign out</button>
      </form>
    </main>
  );
}

export default App;
