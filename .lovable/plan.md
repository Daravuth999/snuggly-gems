# Restore admin password access

## What will change
- Add a **Forgot password?** action to the private sign-in page.
- Send a secure recovery link to the entered admin email.
- Add a public reset page where the link holder can choose a new password.
- Improve sign-in messages so wrong passwords and recovery-link problems are clear.

## Verification
- Confirm the recovery request succeeds without exposing whether an email is registered.
- Confirm the reset page accepts a valid recovery session and returns the admin to sign in.
- Check the sign-in and reset screens at phone size.

## Scope
This keeps the existing admin-only access rules. It does not create or reveal passwords, and it does not change who is an admin.
