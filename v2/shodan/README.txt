バイオリン初段（https://ngmt4amtk-web.github.io/violin-shodan/ gh-pages 419c977）のマイク判定を、そのまま写したもの。
ここのファイルは書き換えない。初段の判定が変わったら、写し直す。
engine.mjs       音の高さの検出（PitchDetector）・判定（MicJudge）・音の再生・マイク
intonation.mjs   音程の目標（弦の開放弦から決める旋律の音程）と許容幅（±15・±8・±5セント）
instrument.mjs   弦の定義（engine と intonation が使う）
mic-status.mjs   マイクの状態の札と音程の目盛り
mic-status.css   同じものの見た目
