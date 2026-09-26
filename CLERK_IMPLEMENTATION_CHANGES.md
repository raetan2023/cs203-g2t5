# Clerk Authentication Implementation Changes

## Overview

The React frontend now uses Clerk for real authentication instead of loading the mock authentication preview. Clerk handles account registration, sign-in, email verification, password recovery, Google/Microsoft authentication, sessions and logout.

For protected purchase-plan requests, the frontend retrieves the current Clerk session token and sends it to Spring Boot as:

```http
Authorization: Bearer <Clerk session token>
```

Spring Boot verifies the token and uses its `sub` claim, which contains the Clerk user ID, to find the matching `clerk_user_id` in the Supabase `users` table.

## Files added

### `frontend/src/app/ClerkApp.tsx`

This is the connection between Clerk and the existing application.

It:

- Reads Clerk's current authentication and user state.
- Maps the Clerk user into the existing `SessionUser` format.
- Uses the Clerk user ID as the frontend session user's ID.
- Supplies the user's name and primary email to the application.
- Handles logout through Clerk and redirects to `/login`.
- Fetches the backend scenario date after a user signs in.
- Supplies Clerk's `getToken()` function to the purchase-plan API service.
- Displays loading and retry screens while Clerk or backend configuration is loading.

### `frontend/src/features/auth/ClerkAuthPage.tsx`

This mounts Clerk's authentication screens inside the existing Bunker Buddy design.

It provides:

- Email/password sign-in and registration.
- Google authentication.
- Microsoft authentication for Outlook users.
- Email verification.
- Password recovery.
- Clerk's validation and error handling.
- Redirects to `/home` after successful authentication.

Clerk uses hash routing internally so its multi-step screens can work alongside the project's small History API router.

### `frontend/.env.example`

This documents the frontend environment variables without storing real credentials:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_replace_with_your_clerk_publishable_key
VITE_API_URL=http://127.0.0.1:8000
VITE_API_KEY=replace_with_the_backend_api_key
```

Each developer should copy this file to `.env.local` and insert their local values. `.env.local` is ignored by Git.

## Files updated

### `frontend/src/main.tsx`

- Added `ClerkProvider` around the application.
- Reads `VITE_CLERK_PUBLISHABLE_KEY` from `.env.local`.
- Reports a clear error when the publishable key is missing.
- Configures `/login`, `/signup`, `/home` and `/login` after logout.
- Mounts the real `ClerkApp` in development and production.
- Removed the old mock-preview and temporary Clerk smoke-test entry.

### `frontend/src/app/App.tsx`

- Added an optional `renderAuthPage` property.
- The real application uses it to render Clerk's sign-in and sign-up screens.
- Existing mock authentication tests can continue using the original `AuthPage` and `AuthService` interface.

### `frontend/src/features/auth/auth.css`

- Added sizing for Clerk's authentication component so it fits the existing responsive authentication layout.

### `frontend/package.json` and `frontend/package-lock.json`

- Added the supported Clerk React package:

```text
@clerk/react
```

The deprecated `@clerk/clerk-react` package is not used.

### `frontend/.gitignore`

- Ensures `.env.local` is not committed.

### `frontend/README.md`

- Updated setup instructions for Clerk and the Spring Boot backend.
- Documented the session-token handoff.
- Replaced outdated mock-authentication notes.
- Added current verification results and remaining checks.

## File removed

### `frontend/src/ClerkTest.tsx`

The temporary smoke-test panel was removed after it successfully confirmed that:

1. Clerk could authenticate a user.
2. The frontend could retrieve a Clerk session token.
3. Spring Boot could verify the token.
4. Spring Boot could connect the authenticated user to Supabase.
5. The protected endpoint returned `200: {"plan":null}`.

The real application now performs this token handoff through the purchase-plan API service.

## Authentication flow

```text
User
  -> Clerk sign-in/sign-up screen
  -> Clerk creates and maintains the session
  -> React calls Clerk getToken()
  -> React sends Authorization: Bearer <token>
  -> Spring Boot verifies the token with Clerk issuer/JWKS
  -> Spring Boot reads the Clerk user ID from the sub claim
  -> Spring Boot matches users.clerk_user_id in Supabase
  -> Spring Boot uses the related UUID user_id for plans and ownership
```

The frontend never sends the user's password to Spring Boot. Clerk handles passwords and external provider login.

## Local configuration

Create `frontend/.env.local`:

```env
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
VITE_API_URL=http://127.0.0.1:8000
VITE_API_KEY=your_backend_api_key
```

Start Spring Boot with its Supabase and Clerk environment variables, then start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173/login
```

## Database and backend expectations

The frontend implementation expects the existing backend and database setup to provide:

- `users.user_id`: UUID primary key with `gen_random_uuid()` as its default.
- `users.clerk_user_id`: required and unique text field.
- `users.email`: optional and unique text field.
- Spring Security OAuth2 Resource Server configured with the Clerk issuer URL.
- Protected purchase-plan endpoints that accept Clerk Bearer tokens.
- User lookup or creation using the token's `sub` claim.
- Ownership checks using the internal UUID `user_id`.
- Invalid, missing or expired tokens returning `401 Unauthorized`.

These backend and database requirements are documented here for integration context; this frontend change did not modify them.

## Verification completed

- `npm run build` passed.
- `npm test` passed all 30 tests across four test files.
- `/login` rendered successfully in a real browser.
- `/signup` rendered successfully in a real browser.
- Google, Microsoft and email/password options were visible.
- The earlier protected-backend smoke test returned `200: {"plan":null}`.
- `git diff --check` passed.

## Remaining manual checks

Before merging or releasing, test:

1. Registering a new account through Google.
2. Registering a new account through Microsoft/Outlook.
3. Email/password registration and email verification.
4. Password recovery.
5. Logout and return to `/login`.
6. Creating, editing, loading and deleting a purchase plan.
7. Confirming a new row is created in the Supabase `users` table.
8. Confirming two different Clerk accounts cannot access each other's purchase plans.
9. Responsive layout on desktop and mobile.

## Suggested commit

After the manual checks pass:

```bash
git add frontend CLERK_IMPLEMENTATION_CHANGES.md
git commit -m "Integrate Clerk authentication"
```
