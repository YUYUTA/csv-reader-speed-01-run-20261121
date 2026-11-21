# make.fun CSV Reader Speed

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/YUYUTA/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/YUYUTA/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

壊れた CSV を make.fun の `csv-reader 1.0.0` と同じ結果に変換し、CPU時間を競う課題です。全ケースで列・行・エラーが一致してから速度が評価されます。[公式課題](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

- 締切は 2026-11-23 11:42 JST。
- 実装はルートの `solve.js`（依存なしのESモジュール）と `main.ts`（Node.js 22）。`/input/cases.json` を読み、`/output/answers.json` に書きます。
- 採点時はネットワークなし、1 CPU、1024 MB、最大64プロセス、壁時計時間10秒の制限があります。提出コードは合計1 MiB以下です。

## Docker で公式ベースラインを実行

公式キットは `_local/makefun/` に展開します。配布キット、練習データ、実行出力と認証情報は Git の管理外に置きます。取得時はアーカイブ内のファイルを [公式 manifest](https://make.fun/api/competitions/csv-reader-speed-01-run-20261121/kit) の SHA-256 と照合します。

```sh
slug=csv-reader-speed-01-run-20261121
mkdir -p _local/makefun
curl --proto '=https' -fL "https://make.fun/c/$slug/kit" -o _local/makefun/kit.tar.gz
tar -tzf _local/makefun/kit.tar.gz
```

確認したキットを `_local/makefun/` に展開したら、リポジトリのルートで実行します。

```sh
kit="$PWD/_local/makefun/csv-reader-speed-01-run-20261121-kit"
out="$PWD/_local/makefun/baseline-output"
mkdir -p "$out"
docker build -t makefun-csv:local .
docker run --rm --network none --cpus 1 --memory 1024m --memory-swap 1024m \
  --pids-limit 64 --read-only --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$kit/baselines/csv-reader,dst=/bot,readonly" \
  --mount "type=bind,src=$kit/practice/input,dst=/input,readonly" \
  --mount "type=bind,src=$out,dst=/output" \
  makefun-csv:local /bot/main.ts
```

公開の期待値はキットの `practice/reference/expected.json` にあります。実装後は `/bot` にリポジトリをマウントして同じ入力で比較できます。公式 CLI による照合と計測は、キットの `RULES.txt` にある `grade-local` を使います。
