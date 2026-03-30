import { redirect } from 'next/navigation';
import { LoginForm } from '../../components/login-form';
import { SignupForm } from '../../components/signup-form';
import { demoCredentials, getOptionalSession, getRoleHomePath } from '../../lib/auth';
import { getSignupOptions } from '../../lib/auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getOptionalSession();
  if (session) {
    redirect(getRoleHomePath(session.role));
  }
  const signupOptions = getSignupOptions();

  return (
    <main className="shell">
      <div className="frame authLayout">
        <section className="hero stack">
          <span className="metric">Recovery Radar Access</span>
          <h1>Role-based sign in</h1>
          <p>
            Sign in as patient, caregiver, or doctor. Each role only sees its allowed workspace,
            and the persistent assistant follows the signed-in user across the app.
          </p>
        </section>

        <section className="grid">
          <LoginForm />
          <SignupForm doctors={signupOptions.doctors} caregivers={signupOptions.caregivers} />
        </section>

        <section className="panel stack">
          <strong>Starter demo accounts</strong>
          <span className="muted">
            You can now create real persisted accounts below, but these starter users still exist
            so you can test the full workflow immediately.
          </span>
          <div className="grid">
            {demoCredentials.map((credential) => (
              <div key={credential.email} className="formCard stack">
                <span className="pill">{credential.role}</span>
                <strong>{credential.displayName}</strong>
                <span className="muted">{credential.email}</span>
                <span className="muted">{credential.password}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
