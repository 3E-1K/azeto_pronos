# Test de rentabilité

```
node scripts/backtest/predict.mjs . /tmp/preds.json   # rejoue le modèle match par match
node scripts/backtest/analyze.mjs /tmp/preds.json     # ROI par stratégie, championnat, cote
node scripts/backtest/analyze2.mjs /tmp/preds.json    # comparaison avec les cotes Pinnacle
```

Historique : workflow « Historique pour le test de rentabilité » (data/hist).
