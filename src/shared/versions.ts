export const VERSIONS = {
  rules: 1,
  contentSchema: 1,
  protocol: 1
} as const

export type Versions = typeof VERSIONS