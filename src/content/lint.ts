export const BANNED_WORDS = [
  'astral',
  'nexus',
  'realm',
  'chronicle',
  'shadow-weaver',
  'mystic',
  'arcane',
  'runic',
  'elder',
  'chosen one',
  'destiny',
  'void-lord'
] as const

const escape = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const MATCHERS = BANNED_WORDS.map((word) => ({ word, pattern: new RegExp(`(?<![\\p{L}])${escape(word)}s?(?![\\p{L}])`, 'iu') }))

export function findBannedWords(text: string): readonly string[] {
  return MATCHERS.filter((matcher) => matcher.pattern.test(text)).map((matcher) => matcher.word)
}