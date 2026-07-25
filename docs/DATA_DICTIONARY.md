# Data dictionary

The browser-ready analytical file is generated at
`public/data/soy_exposure_2024.json`.

## Metadata

| Field | Type | Definition |
|---|---|---|
| `title` | string | Dashboard dataset title |
| `metricDefinition` | string | Short methodological description |
| `year` | integer | Soy production year |
| `territorialWindow.startYear` | integer | First annual territorial-deforestation year |
| `territorialWindow.endYear` | integer | Last annual territorial-deforestation year |
| `rankingMinimumSoyAreaHa` | number | Municipal ranking eligibility threshold |
| `municipalityCount` | integer | Number of joined municipality records |
| `national.soyAreaHa` | number | Sum of reported soy area |
| `national.linkedAreaHa` | number | Sum of linked deforestation/conversion area |
| `national.territorialDeforestationHa` | number | Sum of territorial deforestation |
| `national.deforestationSharePct` | number | National primary percentage |
| `national.ratePct` | number | National exposure intensity |

## Municipality record

| Field | Type | Unit | Definition |
|---|---|---:|---|
| `id` | string | — | Seven-digit IBGE municipality geocode |
| `name` | string | — | Municipality name from IBGE |
| `state` | string | — | Full state name |
| `stateCode` | string | — | Two-letter state code |
| `biome` | string | — | English name of IBGE predominant biome |
| `soyAreaHa` | number | ha | 2024 harvested soy area reported by IBGE and distributed by Trase |
| `linkedAreaHa` | number | ha | Deforestation/conversion linked by Trase to 2024 soy |
| `territorialDeforestationHa` | number | ha | Territorial deforestation summed over 2019–2023 |
| `deforestationSharePct` | number or null | % | `100 × linkedAreaHa / territorialDeforestationHa` |
| `ratePct` | number or null | % | `100 × linkedAreaHa / soyAreaHa` |
| `rateStatus` | string | — | `valid`, `undefined`, or `above_100` |

## Status rules

| Status | Rule |
|---|---|
| `valid` | Soy area is positive and exposure intensity is at most 100% |
| `undefined` | Soy area is zero; exposure denominator is unavailable |
| `above_100` | Soy area is positive and exposure intensity is greater than 100% |

## Baseline aggregate fields

`baselineAggregates.biomes` and `baselineAggregates.states` are generated as
validation and initial-load summaries. Their snake-case fields contain summed
areas, ratio-of-sums percentages, municipality counts and quality-flag counts.
The interactive dashboard recalculates equivalent aggregates after filters are
applied.

## Geometry

`public/data/municipalities.topo.json` contains simplified IBGE 2022 municipal
boundaries. Each geometry retains only:

| Property | Definition |
|---|---|
| `CD_MUN` | Seven-digit IBGE municipality code used to join analytical data |

The geometry must not be used for area measurement or precise GIS analysis.

