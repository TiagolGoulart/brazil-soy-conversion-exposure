# Data workspace

This directory is the local staging area for the public source files used by
the dashboard.

## Automated route

From the repository root:

```bash
npm ci
python -m pip install -r requirements-data.txt
npm run data:all
```

The pipeline creates:

```text
data/raw/
├── BR_Municipios_2022.zip
├── bioma_predominante_2024.xlsx
├── source_manifest.json
├── spatial-metrics-brazil-soy-soy_area_municipality.csv
├── spatial-metrics-brazil-soy-soy_deforestation_5_year_total_municipality.csv
└── spatial-metrics-brazil-territorial_deforestation_municipality.csv

public/data/
├── municipalities.topo.json
└── soy_exposure_2024.json
```

`source_manifest.json` records the exact URL, byte size and SHA-256 digest of
each downloaded input. Trase resource URLs are pinned to the dated `20260703`
release rather than a moving “latest” endpoint. Downloads are verified against
the committed `data/source_checksums.json`; an upstream change fails the
pipeline and requires explicit review.

## Manual route

If automated download is unavailable, place files with the exact names shown
above in `data/raw/`, then run:

```bash
npm run data:prepare
npm run data:geometry
```

## Processing rules

- Soy production year: 2024
- Territorial-deforestation window: 2019–2023
- Municipality join key: seven-digit IBGE geocode
- Biome assignment: IBGE 2024 predominant biome
- Group percentages: ratio of summed numerators to summed denominators
- Municipal ranking eligibility: reported soy area of at least 5,000 ha
- Undefined exposure: zero soy denominator
- Exposure above 100%: retained and flagged, never capped

Raw and generated datasets are excluded from Git because they can be rebuilt
from the pinned public sources. See the repository methodology and
reproducibility documents before changing any transformation rule.
