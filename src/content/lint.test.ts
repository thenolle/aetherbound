import { describe, expect, test } from 'bun:test'
import { findBannedWords } from './lint'

describe('findBannedWords', () => {
  test('flags banned cliché words case-insensitively', () => {
    expect(findBannedWords('The Astral Nexus awaits')).toEqual(['astral', 'nexus'])
    expect(findBannedWords('a Shadow-Weaver and the CHOSEN ONE')).toEqual(['shadow-weaver', 'chosen one'])
  })

  test('accepts tactile, grounded text', () => {
    expect(findBannedWords('Frost creeps across the copper valves; the wax seal weeps.')).toEqual([])
  })

  test('does not flag words that merely contain a banned word', () => {
    expect(findBannedWords('The elderly bailiff signed the vellum.')).toEqual([])
  })
})