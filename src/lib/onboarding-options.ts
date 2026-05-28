export const HEARD_ABOUT_OPTIONS = [
  "Google search",
  "Friend or colleague",
  "Social media",
  "Event or demo",
  "Other",
] as const;

export type HeardAboutOption = (typeof HEARD_ABOUT_OPTIONS)[number];
