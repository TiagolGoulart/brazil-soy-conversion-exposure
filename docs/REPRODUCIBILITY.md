# Reproducibility and audit trail

## 1. Environment

The tested application runtime is Node.js 22. The data preparation pipeline uses
Python 3.11+ with pinned versions in `requirements-data.txt`.

```bash
node --version
python --version
npm ci
python -m pip install -r requirements-data.txt
```

## 2. Download source inputs

```bash
npm run data:download
```

The script:

1. creates `data/raw/`;
2. downloads three dated Trase CSVs and two IBGE files;
3. writes each file atomically;
4. rejects empty or implausibly small downloads;
5. verifies SHA-256 against `data/source_checksums.json`;
6. records URL, size and SHA-256 in `data/raw/source_manifest.json`.

To verify a later run, compare its manifest with the manifest retained for the
analysis being audited. Dated URLs improve reproducibility but publishers remain
the authoritative custodians.

## 3. Build the analytical dataset

```bash
npm run data:prepare
```

The Python transformation:

1. filters soy area and soy-linked deforestation to production year 2024;
2. filters territorial deforestation to 2019–2023 and sums it by municipality;
3. normalizes municipality IDs;
4. joins the three Trase tables one-to-one;
5. joins IBGE predominant biome one-to-one;
6. calculates municipality status and both percentages;
7. creates state, biome and national ratio-of-sums aggregates;
8. writes compact UTF-8 JSON.

The script fails on duplicate identifiers, incomplete joins or unexpected
production years.

## 4. Build map geometry

```bash
npm run data:geometry
```

The script extracts the official IBGE 2022 municipality shapefile and uses the
project-pinned `mapshaper` dependency to:

- clean topology;
- retain municipality shapes;
- simplify geometry to 4% of removable detail;
- retain only `CD_MUN`;
- export quantized TopoJSON.

This output is intended exclusively for the web map.

## 5. Run validation

```bash
npm test
npm run lint
```

`npm test` builds the hosted and static targets and runs the data and rendered
HTML tests. The reference numbers in `tests/data.test.mjs` make unexpected
source or transformation changes visible.

If a publisher legitimately revises a source, do not simply replace expected
totals. First:

1. preserve the old source manifest;
2. document the new source release;
3. compare municipality-level and aggregate changes;
4. review all anomalous values;
5. update documentation and tests in the same pull request.

## 6. Run locally

```bash
npm run dev
```

The terminal displays the local URL. The GitHub Pages variant can be checked
with:

```bash
npm run build:pages
npx vite preview --config vite.pages.config.ts
```

## 7. Reproduce only the numerical analysis

For users who do not need the map or application:

```bash
python -m pip install -r requirements-data.txt
npm run data:download
npm run data:prepare
node --test tests/data.test.mjs
```

The resulting `public/data/soy_exposure_2024.json` contains all municipality
records and national, state and biome validation aggregates.

## 8. GitHub Pages automation

The deployment workflow repeats the full public-data route on a clean Ubuntu
runner. It does not rely on locally generated JSON committed to the repository.
This makes the published dashboard traceable to the repository's source URLs,
transformation code and dependency locks.
