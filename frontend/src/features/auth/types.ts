export interface SessionUser { id: string; displayName: string; email: string }
export interface SignInInput { email: string; password: string; remember: boolean }
export interface SignUpInput { name: string; email: string; password: string }
export type SignUpResult = { status: 'complete'; user: SessionUser } | { status: 'verification-required'; email: string };
export interface AuthService {
  readSession(): Promise<SessionUser | null>;
  signIn(input: SignInInput): Promise<SessionUser>;
  signUp(input: SignUpInput): Promise<SignUpResult>;
  signOut(): Promise<void>;
  /** Provider expiry/account-change events; callers must clear private state. */
  subscribe(listener: (user: SessionUser | null) => void): () => void;
}
export class AuthError extends Error {
  constructor(message: string, public fields: Partial<Record<'name' | 'email' | 'password', string>> = {}) { super(message); }
}
