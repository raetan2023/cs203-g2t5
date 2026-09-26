import { AuthError, type AuthService, type SessionUser } from '../features/auth/types';

export const DEMO_USER: SessionUser = { id: 'demo-john', displayName: 'John', email: 'john@example.com' };
type Operation = 'session' | 'login' | 'signup' | 'logout';
export function createMockAuthService(options: { user?: SessionUser | null; delayMs?: number; failOnce?: Operation } = {}): AuthService & { expire(): void } {
  let user = options.user ?? null;
  let failure = options.failOnce;
  const listeners = new Set<(user: SessionUser | null) => void>();
  async function wait(operation: Operation) {
    await new Promise(resolve => setTimeout(resolve, options.delayMs ?? 650));
    if (failure === operation) {
      failure = undefined;
      throw new AuthError({ session: 'Your session could not be loaded. Please try again.', login: 'Sign-in failed. Check your details and try again.', signup: 'We could not create your account. Please try again.', logout: 'Sign-out failed. Please try again.' }[operation]);
    }
  }
  return {
    async readSession() { await wait('session'); return user; },
    async signIn(input) {
      await wait('login');
      // UI simulation only. No passwords, tokens or account records are retained.
      user = { ...DEMO_USER, email: input.email };
      return user;
    },
    async signUp(input) {
      await wait('signup');
      user = { id: crypto.randomUUID(), displayName: input.name, email: input.email };
      return { status: 'complete', user };
    },
    async signOut() { await wait('logout'); user = null; },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    expire() { user = null; listeners.forEach(listener => listener(null)); },
  };
}
