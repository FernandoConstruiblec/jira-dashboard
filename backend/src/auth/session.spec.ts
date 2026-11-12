import { checkPassword, issueSession, verifySession } from './session';

describe('sesiones', () => {
  beforeEach(() => {
    process.env.DASHBOARD_PASSWORD = 'clave';
    process.env.SESSION_SECRET = 'secreto';
    process.env.SESSION_HOURS = '1';
  });

  it('valida la contraseña', () => {
    expect(checkPassword('clave')).toBe(true);
    expect(checkPassword('otra')).toBe(false);
    expect(checkPassword(undefined)).toBe(false);
  });

  it('acepta una sesión vigente y rechaza una vencida o alterada', () => {
    const now = Date.now();
    const { token } = issueSession(now);
    expect(verifySession(token, now + 1000)).toBe(true);
    expect(verifySession(token, now + 2 * 3_600_000)).toBe(false);
    expect(verifySession(token.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')), now)).toBe(false);
    expect(verifySession(undefined, now)).toBe(false);
  });

  it('rechaza sesiones firmadas con otro secreto', () => {
    const { token } = issueSession();
    process.env.SESSION_SECRET = 'otro';
    expect(verifySession(token)).toBe(false);
  });
});
