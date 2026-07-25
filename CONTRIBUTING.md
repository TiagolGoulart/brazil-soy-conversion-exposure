# Contributing

Contributions are welcome when they preserve methodological transparency and
reproducibility.

## Before opening a pull request

```bash
npm ci
python -m pip install -r requirements-data.txt
npm run data:all
npm test
npm run lint
```

## Methodology changes

A pull request that changes a source, year, metric, join, threshold or
aggregation rule must also update:

- `README.md`;
- `docs/METHODOLOGY.md`;
- `docs/DATA_DICTIONARY.md`, when fields change;
- automated tests and expected totals;
- source URLs or dependency locks, where applicable.

Do not cap anomalous values, silently drop failed joins, average municipality
percentages or replace the 5,000 ha ranking rule without documenting the
analytical consequence.

## Visual changes

Keep the dashboard on one page, in English, keyboard accessible and legible on
desktop and mobile. The current palette is defined as CSS variables in
`app/globals.css`.

