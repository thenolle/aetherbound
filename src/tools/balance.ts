import { CONTENDERS, SIM_REGISTRY } from '../sim/contenders'
import { formatReport } from '../sim/report'
import { runTournament } from '../sim/tournament'

const games = Number(process.argv[2] ?? 50)
const seed = Number(process.argv[3] ?? 1)

if (!Number.isInteger(games) || games < 1 || games > 2000 || !Number.isInteger(seed) || seed < 1) {
  console.error('usage: bun run balance [games per pairing, 1-2000] [first seed]')
  process.exit(1)
}

const started = performance.now()
const result = runTournament(CONTENDERS, SIM_REGISTRY, games, seed)
console.log(formatReport(result))
console.log(`\n${result.total} matches in ${((performance.now() - started) / 1000).toFixed(1)}s`)