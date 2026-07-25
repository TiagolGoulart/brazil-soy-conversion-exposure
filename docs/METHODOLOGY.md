# Methodology

## 1. Purpose and unit of analysis

This dashboard provides a consistent jurisdictional view of deforestation and
conversion exposure associated with Brazilian soy production in 2024. The base
unit is the municipality. Municipality records are subsequently aggregated to
state, predominant biome and Brazil.

The analysis does not identify individual farms, polygons, suppliers or legal
responsibility. “Linked” describes the relationship produced by the Trase
spatial-allocation method at municipality level.

## 2. Conceptual model

Three complementary measures are presented because no single denominator
answers every relevant question.

| Measure | Numerator | Denominator | Interpretation |
|---|---|---|---|
| Share of recent deforestation linked to soy | Soy-linked deforestation/conversion | Territorial deforestation, 2019–2023 | Contribution of soy-linked area to recent jurisdictional deforestation |
| Soy exposure intensity | Soy-linked deforestation/conversion | IBGE-reported 2024 soy harvested area | Scale of linked area relative to reported soy production area |
| Absolute linked area | Soy-linked deforestation/conversion | None | Magnitude in hectares |

### 2.1 Primary metric

For a geographic selection \(G\):

\[
S_G =
100 \times
\frac{\sum_{i \in G} L_i}
{\sum_{i \in G} T_i}
\]

where:

- \(L_i\) is the area of deforestation and conversion linked by Trase to 2024
  soy in municipality \(i\);
- \(T_i\) is territorial deforestation in municipality \(i\), summed over
  2019–2023.

This metric reverses the denominator originally proposed for the dashboard. It
does not ask what percentage of soy land is deforested. It asks what percentage
of recent deforestation is linked to soy. Because numerator and denominator are
derived from the corresponding Trase spatial framework and temporal window, it
is the preferred bounded percentage.

### 2.2 Secondary exposure index

\[
E_G =
100 \times
\frac{\sum_{i \in G} L_i}
{\sum_{i \in G} A_i}
\]

where \(A_i\) is 2024 soy harvested area reported through IBGE PAM and
distributed by Trase.

This is labelled **exposure intensity**, not “percentage of soy area
deforested”. Its numerator results from spatial processing while its denominator
is an agricultural statistic. They are not identical spatial surfaces.

### 2.3 Absolute measure

\[
H_G = \sum_{i \in G} L_i
\]

Displaying \(H_G\) is essential for interpreting undefined or unstable
percentages. A high index based on a small denominator may represent fewer
hectares than a modest index in a major soy-producing municipality.

## 3. Trase temporal logic

The Trase soy-deforestation five-year-total indicator links a soy production
year with deforestation and conversion detected during the preceding
allocation period. The 2024 observation therefore does not mean
calendar-year-2024 deforestation.

The analysis uses:

- production year: 2024;
- linked deforestation/conversion: Trase five-year-total for 2024 soy;
- territorial denominator: annual territorial deforestation summed over
  2019–2023;
- allocation convention: five years with a one-year lag, as described by
  Trase.

A deforestation event can be linked to more than one production year in annual
Trase outputs. Summing soy-deforestation values across production years would
therefore risk double counting and is outside this dashboard.

## 4. Trase spatial logic

According to the Trase Brazil soy methodology, soy deforestation is estimated
by overlaying annual soy maps with territorial-deforestation layers. The
underlying sources differ by region, including GLAD and MapBiomas soy maps and
PRODES or MapBiomas deforestation information.

The dashboard consumes Trase's published municipality-level results. It does
not reproduce the original raster overlay or claim a new remote-sensing
classification.

For authoritative detail, consult:

- [Brazil soy data method, version 2.6](https://resources.trase.earth/documents/data_methods/SEI_PCS_Brazil_soy_2.6._EN.pdf)
- [January 2025 revision](https://resources.trase.earth/documents/data_methods/SEI_PCS_Brazil_soy_2.6_External_January%202025%20Revision.pdf)

## 5. Why exposure intensity can exceed 100%

An exposure index greater than 100% is mathematically possible when
\(L_i > A_i\). This does not establish that more physical soy land was
deforested than exists.

Plausible methodological contributors include:

1. the denominator is IBGE-reported harvested area rather than the raster crop
   mask used in the spatial overlap;
2. small-denominator sensitivity;
3. differences in spatial allocation, reporting and temporal representation;
4. a positive linked-area estimate where reported soy area is zero.

The dashboard therefore:

- does not cap values at 100%;
- assigns `N/A` when \(A_i=0\);
- flags finite values above 100% with a common explanatory tooltip;
- always shows absolute soy and linked hectares;
- excludes municipalities below 5,000 ha from the Top 10 ranking only.

The true physical share of soy fields overlapping recent deforestation would
require the same spatial crop mask in both numerator and denominator. That
municipality-level metric is not available as a ready Trase CSV in the sources
used here.

## 6. Aggregation

All group percentages use a ratio of sums:

\[
R_G = 100 \times \frac{\sum_i N_i}{\sum_i D_i}
\]

An arithmetic mean of municipality percentages is not used because it would
give equal weight to municipalities with very different areas.

Filters are applied to municipality records first. The active selection is then
re-aggregated, so headline cards, map, rankings, table and download remain
internally consistent.

## 7. Geographic classification

### Municipality

The seven-digit IBGE municipality code is the canonical join key. Trase IDs
formatted as `BR-XXXXXXX` are normalized to `XXXXXXX` for map joins.

### State

State is inherited from the municipality record and identified by the official
two-letter code.

### Predominant biome

The IBGE 2024 predominant-biome table assigns one biome to each municipality.
This supports a clear one-to-one classification but simplifies municipalities
that contain more than one biome. Biome totals must be described as
predominant-biome jurisdictional totals.

### Brazil

The national result is the sum of all valid municipality records in the joined
dataset.

## 8. Benchmark logic

Municipality comparisons use the most specific active geography:

| Active geographic filter | Benchmark |
|---|---|
| State selected | Selected state |
| Biome selected, no state | Selected predominant biome |
| No biome or state | Brazil |

The comparison is the municipality rate minus the benchmark rate and is
reported in percentage points. It is descriptive, not a significance test.

## 9. Ranking rule

The municipal Top 10 requires at least 5,000 ha of reported soy area. The rule
is intended to reduce denominator instability and maintain consistency with the
Earthworm Foundation ZDC screening logic selected for this analysis.

It does not remove municipalities from the dataset. State rankings have no
equivalent eligibility threshold.

## 10. Missing and anomalous values

| Condition | Treatment |
|---|---|
| Soy area = 0 and linked area > 0 | Exposure shown as `N/A`; absolute values retained |
| Soy area > 0 and exposure > 100% | Value retained; `above_100` flag and explanation |
| Territorial deforestation = 0 | Primary percentage would be undefined |
| Missing municipality join | Pipeline fails rather than silently dropping the record |
| Duplicate municipality ID | Pipeline fails |

## 11. Validation

The pipeline validates:

- uniqueness of input municipality identifiers;
- one-to-one joins;
- presence of linked area, territorial deforestation and predominant biome;
- the 2024 production-year filter;
- reconciliation of municipality sums to national metadata;
- expected undefined and above-100 exposure cases;
- zero primary values above 100%;
- 5,000 ha ranking coverage;
- reconciliation of biome aggregates.

Reference totals are documented in the main README and encoded in automated
tests.

## 12. Limitations

1. This is jurisdictional exposure, not farm-level attribution.
2. No legal conclusion should be inferred from a municipality's result.
3. Predominant biome does not reproduce within-municipality biome fractions.
4. Source revisions can change historical results.
5. Simplified map geometry is for visual navigation, not GIS measurement.
6. The dashboard does not analyse satellite imagery directly.
7. The chosen 5,000 ha rule affects rankings and should be disclosed whenever a
   ranking is reproduced.

