// Mirrors firebase/firestore.rules: the email domain decides the role.
export type Domains = { student: string; organiser: string };
export const DOMAINS: Domains = {
  student: process.env.EXPO_PUBLIC_STUDENT_DOMAIN || 'vitstudent.ac.in',
  organiser: process.env.EXPO_PUBLIC_ORGANISER_DOMAIN || 'vit.ac.in',
};

export function useDomains(): Domains {
  return DOMAINS;
}

export function roleForEmail(email: string, domains: Domains = DOMAINS): 'student' | 'organiser' | null {
  const domain = email.trim().toLowerCase().split('@')[1];
  if (!domain) return null;
  if (domain === domains.student) return 'student';
  if (domain === domains.organiser) return 'organiser';
  return null;
}

/** True once the user has typed past the @ so we can show a verdict without nagging. */
export function hasDomainPart(email: string) {
  const d = email.split('@')[1];
  return !!d && d.includes('.');
}
