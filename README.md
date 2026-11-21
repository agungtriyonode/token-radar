# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/agungtriyonode/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/agungtriyonode/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar: a ranked board of the pre-token protocols in a sealed DefiLlama snapshot (14 Nov 2026), scored by what their launch would be worth. Every protocol that passes the watchlist's own eligibility rule — TVL on record, no token recorded, not a wrapped, staked or bridged product of one that trades — is ranked by an implied value computed from the snapshot's own figures: TVL, seven-day growth (falls hurt 1.5x as much as rises help), time running with no token (square-root maturity, young protocols discounted), and where its TVL sits inside its own category. The dashboard is a static, no-network page: a sortable, filterable board, a detail view for every protocol with the model's full arithmetic and a seven-step farm plan, and a separate Live token view for the protocols whose token already trades.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input token-radar-01-kit/input/snapshot.json
```

Then open `out/dashboard/index.html` in a browser (it reads `out/data.js`, written beside it). Node.js 22.18 or later, standard library only, no network. The program runs twice and writes the same bytes both times.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
