# Brazil Soy Deforestation & Conversion Exposure

[![Data year: 2024](https://img.shields.io/badge/data-2024-e94e2c)](#data-sources)
[![Municipalities: 5,563](https://img.shields.io/badge/municipalities-5%2C563-3c3c3b)](#validation-reference)
[![GitHub Pages](https://img.shields.io/badge/deployment-GitHub%20Pages-456b56)](#deployment)

An interactive, one-page dashboard for exploring how much recent deforestation
and conversion in Brazil is linked to 2024 soy production. Results can be
filtered and compared at national, predominant-biome, state and municipality
levels.

## Dashboard scope

- Default map view by **predominant municipal biome**
- Brazil, biome, state and municipality results
- Filters for biome, state, municipality, soy area and linked area
- Top 5 states and Top 10 municipalities for the active metric
- Municipality benchmark against Brazil, biome or state, depending on filters
- Absolute hectares alongside percentages
- Explicit handling of undefined rates and exposure values above 100%
- Download of the active filtered municipality dataset
- Static build suitable for free hosting on GitHub Pages

## Analytical framework

The dashboard deliberately separates two different questions.

### 1. Share of recent territorial deforestation linked to soy

This is the primary, bounded percentage:

```text
100 × Σ soy-linked deforestation/conversion area (ha)
      ───────────────────────────────────────────────
      Σ territorial deforestation area, 2019–2023 (ha)
```

It asks: **of all recent territorial deforestation and conversion in the
selected geography, what share is linked by Trase to 2024 soy?**

The numerator and denominator come from the Trase spatial-metrics framework and
use the same five-year reference window. No municipality in the validated
dataset exceeds 100% under this metric.

### 2. Soy exposure intensity

This is a diagnostic index:

```text
100 × Σ soy-linked deforestation/conversion area (ha)
      ───────────────────────────────────────────────
      Σ IBGE-reported 2024 soy harvested area (ha)
```

It asks: **how large is the linked area relative to the reported soy area in
the selected geography?**

This index compares IBGE agricultural statistics with an area estimated through
Trase spatial processing. The two measures are not spatially identical.
Consequently:

- a municipality with zero reported soy area and positive linked area is shown
  as `N/A`;
- a value above 100% is retained, marked with an information symbol and never
  capped;
- the result must not be described as the physical percentage of soy fields
  deforested.

### 3. Absolute linked area

The dashboard also reports the numerator in hectares. This makes the magnitude
behind `N/A`, small-denominator and high-percentage cases visible.

## Important temporal interpretation

“2024” refers to the **soy production year**, not to deforestation occurring
only during calendar year 2024. Trase links 2024 soy to deforestation and
conversion detected during the preceding five-year allocation period, with a
one-year lag. For this dashboard, the corresponding territorial-deforestation
window is 2019–2023.

The same deforestation event may appear in more than one annual soy metric.
Annual Trase soy-deforestation indicators must therefore not be summed across
production years.

## Aggregation and comparison rules

Every displayed percentage for Brazil, a biome, a state or a filtered selection
is calculated as a **ratio of sums**:

```text
group percentage = 100 × Σ numerator / Σ denominator
```

Municipal percentages are never averaged. This avoids giving small and large
municipalities equal statistical weight.

For a municipality, the comparison benchmark follows the most specific active
geographic filter:

1. state, when a state is selected;
2. predominant biome, when a biome but no state is selected;
3. Brazil, when neither is selected.

The difference is expressed in percentage points.

## Predominant-biome rule

Each municipality is assigned to the single biome classified as predominant by
IBGE in 2024. Municipalities that cross biome boundaries are not split by their
actual biome fractions. Biome results are therefore jurisdictional aggregates
based on predominant classification, not pixel-level biome totals.

## Municipality ranking eligibility

The Top 10 municipality ranking includes only municipalities with at least
**5,000 ha of reported soy area**. This threshold is aligned with the analytical
logic used for Earthworm Foundation ZDC screening and reduces instability from
very small denominators.

The rule applies only to the municipal ranking. All municipalities remain in
the map, detail table, filters and CSV download.

In the validated national dataset, the eligible group contains 1,191
municipalities and retains approximately 95.49% of reported soy area and 95.83%
of linked area.

## Validation reference

The prepared dataset is checked against the following expected totals:

| Check | Expected result |
|---|---:|
| Municipalities | 5,563 |
| Reported 2024 soy area | 45,906,902 ha |
| Soy-linked deforestation/conversion area | 844,456.2649 ha |
| Territorial deforestation, 2019–2023 | 14,210,694.5824 ha |
| National share of recent deforestation linked to soy | 5.9424% |
| National exposure intensity | 1.8395% |
| Zero soy denominator with positive linked area | 119 municipalities |
| Finite exposure intensity above 100% | 3 municipalities |
| Primary deforestation shares above 100% | 0 municipalities |

Automated tests verify unique municipality IDs, national reconciliation,
quality flags, the five-year window, ranking coverage and biome reconciliation.

## Data sources

| Dataset | Role | Publisher |
|---|---|---|
| Brazil soy area, municipality, 2024 | Exposure denominator | [Trase](https://trase.earth/open-data/datasets/spatial-metrics-brazil-soy-soy-area) / IBGE PAM |
| Brazil soy deforestation, five-year total, municipality, 2024 | Numerator | [Trase](https://trase.earth/open-data/datasets/spatial-metrics-brazil-soy-soy-deforestation-5-year-total) |
| Brazil territorial deforestation, municipality, 2019–2023 | Primary denominator | [Trase](https://trase.earth/open-data/datasets/spatial-metrics-brazil-territorial-deforestation) |
| Predominant Biome by Municipality, 2024 | Biome assignment | [IBGE](https://geoftp.ibge.gov.br/informacoes_ambientais/estudos_ambientais/biomas/documentos/Bioma_Predominante_por_Municipio_2024.xlsx) |
| Digital Municipal Boundaries, 2022 | Map geometry | [IBGE](https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2022/Brasil/BR/) |

The Trase files are pinned to the dated `20260703` resource release in the
download script. See [Methodology](docs/METHODOLOGY.md) for the full conceptual
basis and [Data dictionary](docs/DATA_DICTIONARY.md) for field definitions.

## Reproduce the analysis

Requirements:

- Node.js 22.13 or later
- Python 3.11 or later
- `pip`
- `unzip`

```bash
git clone https://github.com/TiagolGoulart/brazil-soy-conversion-exposure.git
cd brazil-soy-conversion-exposure

npm ci
python -m pip install -r requirements-data.txt
npm run data:all
npm test
npm run dev
```

`npm run data:all` downloads the pinned public sources, creates the analytical
JSON and simplifies the IBGE municipal boundaries into TopoJSON. Raw and
generated datasets are intentionally excluded from Git because they are
reproducible and substantially larger than the application source.

For a detailed, auditable sequence, read
[Reproducibility](docs/REPRODUCIBILITY.md).

## Project structure

```text
.
├── .github/workflows/       GitHub Pages deployment
├── app/                     shared layout and styles
├── components/              dashboard interaction and calculations
├── data/                    source manifest and preparation notes
├── docs/                    methodology, dictionary and reproducibility
├── pages-src/               static GitHub Pages entry point
├── public/                  favicon and generated browser data
├── scripts/                 download, transformation and validation
└── tests/                   data and rendered-output checks
```

## Available commands

| Command | Purpose |
|---|---|
| `npm run data:download` | Download pinned Trase and IBGE sources |
| `npm run data:prepare` | Build the analytical municipality dataset |
| `npm run data:geometry` | Build simplified municipal TopoJSON |
| `npm run data:all` | Run all three data steps |
| `npm run dev` | Start local development |
| `npm run lint` | Run static code checks |
| `npm test` | Build both targets and run automated tests |
| `npm run build:pages` | Create the static GitHub Pages bundle |

## Deployment

Pushes to `main` trigger
`.github/workflows/deploy-pages.yml`. The workflow installs both runtimes,
rebuilds the data from the pinned public sources, validates it, creates
`dist-pages/` and deploys the artifact to GitHub Pages.

In the repository settings, select **Settings → Pages → Source → GitHub
Actions** once if Pages is not already enabled.

## Limitations and responsible use

- Results indicate jurisdictional exposure, not farm-level causation,
  ownership, legal non-compliance or supply-chain attribution.
- Predominant biome simplifies municipalities that span more than one biome.
- IBGE harvested area and Trase spatial processing differ in source,
  representation and potentially temporal treatment.
- The 5,000 ha threshold is an analytical ranking rule, not a legal threshold.
- Trase and IBGE remain the authoritative sources. Users should review their
  current metadata, methods and licences before redistributing source data.

## Documentation

- [Full methodology](docs/METHODOLOGY.md)
- [Data dictionary](docs/DATA_DICTIONARY.md)
- [Reproducibility and audit trail](docs/REPRODUCIBILITY.md)
- [Contributing](CONTRIBUTING.md)

## Citation

If this repository supports a publication or presentation, cite both this
dashboard and the underlying Trase and IBGE datasets. Machine-readable citation
metadata is available in [CITATION.cff](CITATION.cff).
