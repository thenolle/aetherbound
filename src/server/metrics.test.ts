import { describe, expect, test } from 'bun:test'
import { metricsAllowed, renderMetrics } from './metrics'

describe('metrics', () => {
  test('renders the prometheus text format with one header per metric and escaped labels', () => {
    const text = renderMetrics([
      { name: 'aetherbound_queue', help: 'Players waiting.', type: 'gauge', value: 2, labels: { mode: 'casual' } },
      { name: 'aetherbound_queue', help: 'Players waiting.', type: 'gauge', value: 1, labels: { mode: 'ranked' } },
      { name: 'aetherbound_matches_finished_total', help: 'Finished matches.', type: 'counter', value: 7 },
      { name: 'aetherbound_note', help: 'Escapes.', type: 'gauge', value: 1, labels: { text: 'a"b\\c\nd' } }
    ])
    expect(text).toBe([
      '# HELP aetherbound_queue Players waiting.',
      '# TYPE aetherbound_queue gauge',
      'aetherbound_queue{mode="casual"} 2',
      'aetherbound_queue{mode="ranked"} 1',
      '# HELP aetherbound_matches_finished_total Finished matches.',
      '# TYPE aetherbound_matches_finished_total counter',
      'aetherbound_matches_finished_total 7',
      '# HELP aetherbound_note Escapes.',
      '# TYPE aetherbound_note gauge',
      'aetherbound_note{text="a\\"b\\\\c\\nd"} 1',
      ''
    ].join('\n'))
  })

  test('rejects invalid names, labels and values', () => {
    expect(() => renderMetrics([{ name: 'bad name', help: 'x', type: 'gauge', value: 1 }])).toThrow()
    expect(() => renderMetrics([{ name: 'ok', help: 'x', type: 'gauge', value: Number.NaN }])).toThrow()
    expect(() => renderMetrics([{ name: 'ok', help: 'x', type: 'gauge', value: 1, labels: { 'bad-label': 'v' } }])).toThrow()
  })

  test('access needs the bearer token when one is set and loopback otherwise', () => {
    expect(metricsAllowed(null, '127.0.0.1', null)).toBe(true)
    expect(metricsAllowed(null, '10.0.0.5', null)).toBe(false)
    expect(metricsAllowed('Bearer secret-secret-secret', '10.0.0.5', 'secret-secret-secret')).toBe(true)
    expect(metricsAllowed('Bearer other-other-other-', '127.0.0.1', 'secret-secret-secret')).toBe(false)
    expect(metricsAllowed(null, '127.0.0.1', 'secret-secret-secret')).toBe(false)
  })
})