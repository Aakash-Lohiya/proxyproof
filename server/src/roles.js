// Role is decided by the institutional email domain, never by the client.
//   xyz@vitstudent.ac.in -> student
//   xyz@vit.ac.in        -> organiser
export const STUDENT_DOMAIN = (process.env.STUDENT_EMAIL_DOMAIN || 'vitstudent.ac.in').toLowerCase();
export const ORGANISER_DOMAIN = (process.env.ORGANISER_EMAIL_DOMAIN || 'vit.ac.in').toLowerCase();

export function roleForEmail(email) {
  const domain = String(email || '').toLowerCase().split('@')[1];
  if (!domain) return null;
  if (domain === STUDENT_DOMAIN) return 'student';
  if (domain === ORGANISER_DOMAIN) return 'organiser';
  return null;
}

export function domainHelp() {
  return `Use your institute email: @${STUDENT_DOMAIN} for students, @${ORGANISER_DOMAIN} for organisers`;
}
