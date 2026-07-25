"use client";

import {
  AlertTriangle,
  Database,
  Download,
  Filter,
  Info,
  Leaf,
  Map as MapIcon,
  RotateCcw,
  Search,
} from "lucide-react";
import { geoMercator, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import { useEffect, useMemo, useState } from "react";
import type { Feature, FeatureCollection, Geometry } from "geojson";

type ViewLevel = "biome" | "state" | "municipality";
type Metric = "deforestationShare" | "exposure" | "absolute";

type Municipality = {
  id: string;
  name: string;
  state: string;
  stateCode: string;
  biome: string;
  soyAreaHa: number;
  linkedAreaHa: number;
  territorialDeforestationHa: number;
  deforestationSharePct: number | null;
  ratePct: number | null;
  rateStatus: "valid" | "undefined" | "above_100";
};

type Source = { name: string; url: string };

type DashboardData = {
  metadata: {
    title: string;
    metricDefinition: string;
    year: number;
    municipalityCount: number;
    territorialWindow: {
      startYear: number;
      endYear: number;
    };
    rankingMinimumSoyAreaHa: number;
    national: {
      soyAreaHa: number;
      linkedAreaHa: number;
      territorialDeforestationHa: number;
      deforestationSharePct: number;
      ratePct: number;
    };
    quality: {
      zeroSoyAreaPositiveLinkedArea: number;
      ratesAbove100: number;
      linkedAreaWithZeroDenominatorHa: number;
      deforestationSharesAbove100: number;
      rankingCoverage: {
        municipalities: number;
        soyAreaPct: number;
        linkedAreaPct: number;
      };
    };
    sources: Source[];
  };
  municipalities: Municipality[];
};

type Aggregate = {
  key: string;
  label: string;
  secondary: string;
  soyAreaHa: number;
  linkedAreaHa: number;
  territorialDeforestationHa: number;
  deforestationSharePct: number | null;
  ratePct: number | null;
  municipalityCount: number;
  undefinedCount: number;
  above100Count: number;
};

type TopologyObject = {
  type: string;
  geometries: Array<{
    type: string;
    properties?: { CD_MUN?: string };
    arcs: unknown;
  }>;
};

type TopologyData = {
  type: "Topology";
  objects: Record<string, TopologyObject>;
  arcs: unknown;
  transform?: unknown;
};

const EXPOSURE_THRESHOLDS = [0, 0.5, 1, 2, 5, 10];
const DEFORESTATION_SHARE_THRESHOLDS = [0, 1, 5, 10, 25, 50];
const RATE_COLORS = [
  "#f5f3ef",
  "#f9cdc4",
  "#f7b9ad",
  "#ee8b74",
  "#e94e2c",
  "#cd3615",
  "#792917",
];
const MUTED_FILL = "#deddd7";

const number = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});
const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});
const decimal = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function assetUrl(file: string) {
  if (typeof window === "undefined") return file;
  return new URL(file, window.location.href).toString();
}

function parseBound(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function percentLabel(value: number | null) {
  return value === null ? "N/A" : `${decimal.format(value)}%`;
}

function statusLabel(item: Municipality | Aggregate) {
  if (item.ratePct === null) return "Undefined rate";
  if (item.ratePct > 100) return "Rate above 100%";
  return null;
}

function aggregateRows(rows: Municipality[], level: Exclude<ViewLevel, "municipality">) {
  const groups = new Map<string, Aggregate>();

  for (const row of rows) {
    const key = level === "biome" ? row.biome : row.stateCode;
    const label = level === "biome" ? row.biome : row.state;
    const secondary =
      level === "biome" ? "Predominant-biome aggregation" : row.stateCode;
    const current = groups.get(key) ?? {
      key,
      label,
      secondary,
    soyAreaHa: 0,
    linkedAreaHa: 0,
    territorialDeforestationHa: 0,
    deforestationSharePct: null,
    ratePct: null,
      municipalityCount: 0,
      undefinedCount: 0,
      above100Count: 0,
    };
    current.soyAreaHa += row.soyAreaHa;
    current.linkedAreaHa += row.linkedAreaHa;
    current.territorialDeforestationHa += row.territorialDeforestationHa;
    current.municipalityCount += 1;
    current.undefinedCount += row.rateStatus === "undefined" ? 1 : 0;
    current.above100Count += row.rateStatus === "above_100" ? 1 : 0;
    groups.set(key, current);
  }

  for (const group of groups.values()) {
    group.ratePct =
      group.soyAreaHa > 0
        ? (100 * group.linkedAreaHa) / group.soyAreaHa
        : null;
    group.deforestationSharePct =
      group.territorialDeforestationHa > 0
        ? (100 * group.linkedAreaHa) / group.territorialDeforestationHa
        : null;
  }
  return [...groups.values()];
}

function municipalityAsAggregate(row: Municipality): Aggregate {
  return {
    key: row.id,
    label: row.name,
    secondary: `${row.stateCode} · ${row.biome}`,
    soyAreaHa: row.soyAreaHa,
    linkedAreaHa: row.linkedAreaHa,
    territorialDeforestationHa: row.territorialDeforestationHa,
    deforestationSharePct: row.deforestationSharePct,
    ratePct: row.ratePct,
    municipalityCount: 1,
    undefinedCount: row.rateStatus === "undefined" ? 1 : 0,
    above100Count: row.rateStatus === "above_100" ? 1 : 0,
  };
}

function absoluteThresholds(level: ViewLevel) {
  return level === "municipality"
    ? [0, 10, 100, 1_000, 5_000, 20_000]
    : [0, 1_000, 10_000, 50_000, 100_000, 250_000];
}

function colorFor(value: number | null, metric: Metric, level: ViewLevel) {
  if (value === null) return MUTED_FILL;
  const thresholds = metric === "deforestationShare"
    ? DEFORESTATION_SHARE_THRESHOLDS
    : metric === "exposure"
      ? EXPOSURE_THRESHOLDS
      : absoluteThresholds(level);
  let index = 0;
  while (index < thresholds.length && value > thresholds[index]) index += 1;
  return RATE_COLORS[Math.min(index, RATE_COLORS.length - 1)];
}

function valueForMetric(item: Aggregate | Municipality, metric: Metric) {
  if (metric === "deforestationShare") return item.deforestationSharePct;
  if (metric === "exposure") return item.ratePct;
  return item.linkedAreaHa;
}

function metricLabel(metric: Metric) {
  if (metric === "deforestationShare") return "Deforestation share";
  if (metric === "exposure") return "Exposure intensity";
  return "Linked area";
}

function displayMetric(value: number | null, metric: Metric) {
  return metric === "absolute"
    ? `${compact.format(value ?? 0)} ha`
    : percentLabel(value);
}

function percentagePointDelta(
  value: number | null,
  benchmarkValue: number | null,
) {
  if (value === null || benchmarkValue === null) return "N/A";
  const difference = value - benchmarkValue;
  return `${difference >= 0 ? "+" : ""}${decimal.format(difference)} pp`;
}

const EXPOSURE_COMPARABILITY_NOTE =
  "This value compares IBGE-reported harvested soy area with Trase's spatially processed soy-deforestation estimate. Because the two sources are not spatially identical, the ratio can exceed 100%. It is an exposure intensity, not a physical land share.";

function ComparabilityInfo() {
  return (
    <span
      aria-label={EXPOSURE_COMPARABILITY_NOTE}
      className="info-tooltip"
      data-tooltip={EXPOSURE_COMPARABILITY_NOTE}
      role="img"
      tabIndex={0}
      title={EXPOSURE_COMPARABILITY_NOTE}
    >
      <Info size={13} aria-hidden="true" />
    </span>
  );
}

function aggregateForView(
  row: Municipality,
  level: ViewLevel,
  biomeMap: Map<string, Aggregate>,
  stateMap: Map<string, Aggregate>,
) {
  if (level === "biome") return biomeMap.get(row.biome) ?? null;
  if (level === "state") return stateMap.get(row.stateCode) ?? null;
  return municipalityAsAggregate(row);
}

function buildCsv(rows: Municipality[]) {
  const escape = (value: string | number | null) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  const header = [
    "ibge_code",
    "municipality",
    "state",
    "state_code",
    "predominant_biome",
    "soy_area_ha_2024",
    "soy_linked_deforestation_conversion_ha",
    "territorial_deforestation_2019_2023_ha",
    "share_of_recent_deforestation_linked_to_soy_pct",
    "exposure_intensity_vs_reported_soy_area_pct",
    "rate_status",
  ];
  return [
    header.join(","),
    ...rows.map((row) =>
      [
        row.id,
        row.name,
        row.state,
        row.stateCode,
        row.biome,
        row.soyAreaHa,
        row.linkedAreaHa,
        row.territorialDeforestationHa,
        row.deforestationSharePct,
        row.ratePct,
        row.rateStatus,
      ]
        .map(escape)
        .join(","),
    ),
  ].join("\n");
}

function Ranking({
  title,
  subtitle,
  items,
  limit,
  metric,
  minimumSoyAreaHa = 0,
  onSelect,
}: {
  title: string;
  subtitle: string;
  items: Aggregate[];
  limit: number;
  metric: Metric;
  minimumSoyAreaHa?: number;
  onSelect: (item: Aggregate) => void;
}) {
  const ranked = items
    .filter(
      (item) =>
        item.soyAreaHa >= minimumSoyAreaHa &&
        valueForMetric(item, metric) !== null,
    )
    .sort(
      (a, b) =>
        (valueForMetric(b, metric) ?? 0) -
        (valueForMetric(a, metric) ?? 0),
    )
    .slice(0, limit);
  const maximum = Math.max(
    ...ranked.map((item) => valueForMetric(item, metric) ?? 0),
    1,
  );

  return (
    <section className="ranking-card">
      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">{subtitle}</p>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="ranking-list">
        {ranked.length === 0 ? (
          <p className="empty-state">No eligible values under the active filters.</p>
        ) : (
          ranked.map((item, index) => (
            <button
              className="ranking-row"
              key={item.key}
              onClick={() => onSelect(item)}
              type="button"
            >
              <span className="rank-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="rank-content">
                <span className="rank-label-line">
                  <strong>{item.label}</strong>
                  <b>
                    {displayMetric(valueForMetric(item, metric), metric)}
                    {metric === "exposure" && (item.ratePct ?? 0) > 100 ? (
                      <ComparabilityInfo />
                    ) : null}
                  </b>
                </span>
                <span className="rank-detail">
                  {compact.format(item.linkedAreaHa)} ha linked ·{" "}
                  {compact.format(item.soyAreaHa)} ha soy
                </span>
                <span className="bar-track" aria-hidden="true">
                  <span
                    className="bar-fill"
                    style={{
                      width: `${Math.max(
                        2,
                        ((valueForMetric(item, metric) ?? 0) / maximum) * 100,
                      )}%`,
                    }}
                  />
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [topology, setTopology] = useState<TopologyData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewLevel, setViewLevel] = useState<ViewLevel>("biome");
  const [metric, setMetric] = useState<Metric>("deforestationShare");
  const [biome, setBiome] = useState("All");
  const [stateCode, setStateCode] = useState("All");
  const [search, setSearch] = useState("");
  const [soyMin, setSoyMin] = useState("");
  const [soyMax, setSoyMax] = useState("");
  const [linkedMin, setLinkedMin] = useState("");
  const [linkedMax, setLinkedMax] = useState("");
  const [hovered, setHovered] = useState<Aggregate | null>(null);
  const [selectedMunicipality, setSelectedMunicipality] =
    useState<Municipality | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(assetUrl("data/soy_exposure_2024.json")).then((response) => {
        if (!response.ok) throw new Error("Could not load the analytical dataset.");
        return response.json();
      }),
      fetch(assetUrl("data/municipalities.topo.json")).then((response) => {
        if (!response.ok) throw new Error("Could not load the map geometry.");
        return response.json();
      }),
    ])
      .then(([dataset, mapData]) => {
        if (!active) return;
        setData(dataset as DashboardData);
        setTopology(mapData as TopologyData);
      })
      .catch((error: Error) => {
        if (active) setLoadError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);

  const municipalities = useMemo(
    () => data?.municipalities ?? [],
    [data],
  );
  const municipalityById = useMemo(
    () => new Map(municipalities.map((row) => [row.id, row])),
    [municipalities],
  );

  const biomes = useMemo(
    () => [...new Set(municipalities.map((row) => row.biome))].sort(),
    [municipalities],
  );
  const states = useMemo(
    () =>
      [...new Map(municipalities.map((row) => [row.stateCode, row.state])).entries()]
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [municipalities],
  );

  const filtered = useMemo(() => {
    const minimumSoy = parseBound(soyMin);
    const maximumSoy = parseBound(soyMax);
    const minimumLinked = parseBound(linkedMin);
    const maximumLinked = parseBound(linkedMax);
    const query = normalize(search.trim());

    return municipalities.filter((row) => {
      if (biome !== "All" && row.biome !== biome) return false;
      if (stateCode !== "All" && row.stateCode !== stateCode) return false;
      if (minimumSoy !== null && row.soyAreaHa < minimumSoy) return false;
      if (maximumSoy !== null && row.soyAreaHa > maximumSoy) return false;
      if (minimumLinked !== null && row.linkedAreaHa < minimumLinked) return false;
      if (maximumLinked !== null && row.linkedAreaHa > maximumLinked) return false;
      if (
        query &&
        !normalize(`${row.name} ${row.state} ${row.stateCode}`).includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [
    municipalities,
    biome,
    stateCode,
    soyMin,
    soyMax,
    linkedMin,
    linkedMax,
    search,
  ]);

  const filteredIds = useMemo(
    () => new Set(filtered.map((row) => row.id)),
    [filtered],
  );
  const biomeAggregates = useMemo(
    () => aggregateRows(filtered, "biome"),
    [filtered],
  );
  const stateAggregates = useMemo(
    () => aggregateRows(filtered, "state"),
    [filtered],
  );
  const biomeMap = useMemo(
    () => new Map(biomeAggregates.map((item) => [item.key, item])),
    [biomeAggregates],
  );
  const stateMap = useMemo(
    () => new Map(stateAggregates.map((item) => [item.key, item])),
    [stateAggregates],
  );

  const summary = useMemo(() => {
    const soyAreaHa = filtered.reduce((sum, row) => sum + row.soyAreaHa, 0);
    const linkedAreaHa = filtered.reduce(
      (sum, row) => sum + row.linkedAreaHa,
      0,
    );
    const territorialDeforestationHa = filtered.reduce(
      (sum, row) => sum + row.territorialDeforestationHa,
      0,
    );
    return {
      soyAreaHa,
      linkedAreaHa,
      territorialDeforestationHa,
      deforestationSharePct:
        territorialDeforestationHa > 0
          ? (100 * linkedAreaHa) / territorialDeforestationHa
          : null,
      ratePct: soyAreaHa > 0 ? (100 * linkedAreaHa) / soyAreaHa : null,
      undefinedCount: filtered.filter((row) => row.ratePct === null).length,
      positiveUndefinedCount: filtered.filter(
        (row) => row.ratePct === null && row.linkedAreaHa > 0,
      ).length,
    };
  }, [filtered]);

  const benchmark = useMemo(() => {
    const benchmarkRows =
      stateCode !== "All"
        ? municipalities.filter((row) => row.stateCode === stateCode)
        : biome !== "All"
          ? municipalities.filter((row) => row.biome === biome)
          : municipalities;
    const linkedAreaHa = benchmarkRows.reduce(
      (sum, row) => sum + row.linkedAreaHa,
      0,
    );
    const territorialDeforestationHa = benchmarkRows.reduce(
      (sum, row) => sum + row.territorialDeforestationHa,
      0,
    );
    const selectedState = states.find((item) => item.code === stateCode);
    return {
      label:
        stateCode !== "All"
          ? `${selectedState?.name ?? stateCode} benchmark`
          : biome !== "All"
            ? `${biome} benchmark`
            : "Brazil benchmark",
      value:
        territorialDeforestationHa > 0
          ? (100 * linkedAreaHa) / territorialDeforestationHa
          : null,
    };
  }, [municipalities, stateCode, biome, states]);

  const mapObject = topology
    ? topology.objects[Object.keys(topology.objects)[0]]
    : null;

  const mapFeatures = useMemo(() => {
    if (!topology || !mapObject) return null;
    return feature(
      topology as never,
      mapObject as never,
    ) as unknown as FeatureCollection<Geometry, { CD_MUN?: string }>;
  }, [topology, mapObject]);

  const pathGenerator = useMemo(() => {
    if (!mapFeatures) return null;
    const projection = geoMercator().fitExtent(
      [
        [18, 16],
        [742, 618],
      ],
      mapFeatures,
    );
    return geoPath(projection);
  }, [mapFeatures]);

  const paths = useMemo(() => {
    if (!mapFeatures || !pathGenerator) return [];
    return mapFeatures.features
      .map((mapFeature) => {
        const id = mapFeature.properties?.CD_MUN ?? "";
        return {
          id,
          d: pathGenerator(mapFeature as Feature<Geometry>) ?? "",
        };
      })
      .filter((item) => item.d);
  }, [mapFeatures, pathGenerator]);

  const boundaryPath = useMemo(() => {
    if (!topology || !mapObject || !pathGenerator || viewLevel === "municipality") {
      return "";
    }
    const boundary = mesh(
      topology as never,
      mapObject as never,
      (left: { properties?: { CD_MUN?: string } }, right: { properties?: { CD_MUN?: string } }) => {
        const leftRow = municipalityById.get(left.properties?.CD_MUN ?? "");
        const rightRow = municipalityById.get(right.properties?.CD_MUN ?? "");
        if (!leftRow || !rightRow) return false;
        return viewLevel === "biome"
          ? leftRow.biome !== rightRow.biome
          : leftRow.stateCode !== rightRow.stateCode;
      },
    );
    return pathGenerator(boundary as never) ?? "";
  }, [topology, mapObject, pathGenerator, viewLevel, municipalityById]);

  const outlinePath = useMemo(() => {
    if (!topology || !mapObject || !pathGenerator) return "";
    const outline = mesh(
      topology as never,
      mapObject as never,
      (left: unknown, right: unknown) => left === right,
    );
    return pathGenerator(outline as never) ?? "";
  }, [topology, mapObject, pathGenerator]);

  const tableRows = useMemo(() => {
    return [...filtered]
      .sort(
        (a, b) =>
          (valueForMetric(b, metric) ?? -1) -
          (valueForMetric(a, metric) ?? -1),
      )
      .slice(0, 20);
  }, [filtered, metric]);

  function resetFilters() {
    setBiome("All");
    setStateCode("All");
    setSearch("");
    setSoyMin("");
    setSoyMax("");
    setLinkedMin("");
    setLinkedMax("");
    setSelectedMunicipality(null);
  }

  function downloadFiltered() {
    const blob = new Blob([buildCsv(filtered)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "brazil_soy_exposure_filtered_2024.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function selectRanking(item: Aggregate, level: "state" | "municipality") {
    if (level === "state") {
      setStateCode(item.key);
      setViewLevel("state");
    } else {
      const row = municipalityById.get(item.key);
      if (row) {
        setSelectedMunicipality(row);
        setViewLevel("municipality");
      }
    }
  }

  const legendThresholds =
    metric === "deforestationShare"
      ? DEFORESTATION_SHARE_THRESHOLDS
      : metric === "exposure"
        ? EXPOSURE_THRESHOLDS
        : absoluteThresholds(viewLevel);
  const activeFilters = [
    biome !== "All",
    stateCode !== "All",
    search !== "",
    soyMin !== "",
    soyMax !== "",
    linkedMin !== "",
    linkedMax !== "",
  ].filter(Boolean).length;

  if (loadError) {
    return (
      <main className="loading-screen">
        <AlertTriangle size={28} />
        <h1>Dashboard unavailable</h1>
        <p>{loadError}</p>
      </main>
    );
  }

  if (!data || !topology) {
    return (
      <main className="loading-screen">
        <span className="loader" aria-hidden="true" />
        <p>Preparing Brazil soy exposure data…</p>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="hero">
        <div className="hero-kicker">
          <span className="worm-mark" aria-hidden="true">
            <i />
            <i />
          </span>
          <span>Brazil · Soy · 2024</span>
        </div>
        <div className="hero-grid">
          <div>
            <p className="eyebrow light">Nature & supply chain analytics</p>
            <h1>Brazil Soy Deforestation &amp; Conversion Exposure</h1>
          </div>
          <p className="hero-summary">
            A jurisdictional view of recent native-vegetation loss linked to
            2024 soy under Trase&apos;s five-year allocation method.
          </p>
        </div>
      </header>

      <section className="disclaimer" aria-label="Important interpretation note">
        <Info size={20} aria-hidden="true" />
        <div>
          <strong>This is not calendar-year 2024 deforestation.</strong>
          <span>
            The numerator captures deforestation and conversion associated with
            2024 soy through a five-year allocation period and a one-year lag.
            It should be interpreted as exposure, not property-level causation.
          </span>
        </div>
        <a href="#methodology">Read methodology</a>
      </section>

      <section className="filter-panel" aria-label="Dashboard filters">
        <div className="filter-panel-heading">
          <div>
            <span className="filter-title">
              <Filter size={17} /> Analysis controls
            </span>
            <span className="filter-count">
              {activeFilters} active filter{activeFilters === 1 ? "" : "s"}
            </span>
          </div>
          <button className="text-button" onClick={resetFilters} type="button">
            <RotateCcw size={15} /> Reset
          </button>
        </div>

        <div className="control-grid">
          <fieldset className="segmented-field">
            <legend>Map view</legend>
            <div className="segmented-control">
              {(["biome", "state", "municipality"] as ViewLevel[]).map((level) => (
                <button
                  className={viewLevel === level ? "active" : ""}
                  key={level}
                  onClick={() => setViewLevel(level)}
                  type="button"
                >
                  {level === "biome"
                    ? "Biome"
                    : level === "state"
                      ? "State"
                      : "Municipality"}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="segmented-field metric-field">
            <legend>Map metric</legend>
            <div className="segmented-control">
              <button
                className={metric === "deforestationShare" ? "active" : ""}
                onClick={() => setMetric("deforestationShare")}
                type="button"
              >
                Deforestation share
              </button>
              <button
                className={metric === "exposure" ? "active" : ""}
                onClick={() => setMetric("exposure")}
                type="button"
              >
                Exposure intensity
              </button>
              <button
                className={metric === "absolute" ? "active" : ""}
                onClick={() => setMetric("absolute")}
                type="button"
              >
                Linked area
              </button>
            </div>
          </fieldset>

          <label className="select-field">
            <span>Predominant biome</span>
            <select value={biome} onChange={(event) => setBiome(event.target.value)}>
              <option value="All">All biomes</option>
              {biomes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="select-field">
            <span>State</span>
            <select
              value={stateCode}
              onChange={(event) => setStateCode(event.target.value)}
            >
              <option value="All">All states</option>
              {states.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name} ({item.code})
                </option>
              ))}
            </select>
          </label>

          <label className="search-field">
            <span>Municipality search</span>
            <span className="input-with-icon">
              <Search size={16} />
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search municipality"
                type="search"
                value={search}
              />
            </span>
          </label>

          <fieldset className="range-field">
            <legend>Soy area (ha)</legend>
            <div>
              <input
                min="0"
                onChange={(event) => setSoyMin(event.target.value)}
                placeholder="Min"
                type="number"
                value={soyMin}
              />
              <span>to</span>
              <input
                min="0"
                onChange={(event) => setSoyMax(event.target.value)}
                placeholder="Max"
                type="number"
                value={soyMax}
              />
            </div>
          </fieldset>

          <fieldset className="range-field">
            <legend>Linked area (ha)</legend>
            <div>
              <input
                min="0"
                onChange={(event) => setLinkedMin(event.target.value)}
                placeholder="Min"
                step="0.1"
                type="number"
                value={linkedMin}
              />
              <span>to</span>
              <input
                min="0"
                onChange={(event) => setLinkedMax(event.target.value)}
                placeholder="Max"
                step="0.1"
                type="number"
                value={linkedMax}
              />
            </div>
          </fieldset>
        </div>
      </section>

      <section className="kpi-grid" aria-label="Filtered summary">
        <article className="kpi-card primary-kpi">
          <span className="kpi-icon">
            <Leaf size={18} />
          </span>
          <p>Share of recent deforestation linked to soy</p>
          <strong>{percentLabel(summary.deforestationSharePct)}</strong>
          <small>
            {benchmark.label}: {percentLabel(benchmark.value)}
          </small>
        </article>
        <article className="kpi-card">
          <span className="kpi-icon">
            <Database size={18} />
          </span>
          <p>2024 soy area</p>
          <strong>{compact.format(summary.soyAreaHa)} ha</strong>
          <small>{number.format(summary.soyAreaHa)} hectares</small>
        </article>
        <article className="kpi-card">
          <span className="kpi-icon">
            <MapIcon size={18} />
          </span>
          <p>Linked deforestation &amp; conversion</p>
          <strong>{compact.format(summary.linkedAreaHa)} ha</strong>
          <small>{number.format(summary.linkedAreaHa)} hectares</small>
        </article>
        <article className="kpi-card">
          <span className="kpi-icon">
            <Filter size={18} />
          </span>
          <p>Territorial deforestation, 2019–2023</p>
          <strong>{compact.format(summary.territorialDeforestationHa)} ha</strong>
          <small>{number.format(filtered.length)} municipalities included</small>
        </article>
      </section>

      <section className="quality-strip">
        <AlertTriangle size={18} />
        <p>
          <strong>Data comparability note:</strong> Exposure intensity compares
          IBGE-reported harvested soy area with Trase&apos;s spatially processed
          soy-deforestation estimate. The sources are not spatially identical,
          so {data.metadata.quality.ratesAbove100} municipal values exceed 100%
          and {data.metadata.quality.zeroSoyAreaPositiveLinkedArea} are N/A.
          Values are retained, never capped, and flagged with an information icon.
        </p>
      </section>

      <section className="analysis-grid">
        <article className="map-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Geographic distribution</p>
              <h2>
                {viewLevel === "biome"
                  ? "Predominant biome view"
                  : viewLevel === "state"
                    ? "State view"
                    : "Municipality view"}
              </h2>
            </div>
            <div className="map-stat">
              <span>{metricLabel(metric)}</span>
              <strong>
                {displayMetric(
                  metric === "deforestationShare"
                    ? summary.deforestationSharePct
                    : metric === "exposure"
                      ? summary.ratePct
                      : summary.linkedAreaHa,
                  metric,
                )}
              </strong>
            </div>
          </div>

          <div className="map-layout">
            <div className="map-visual">
              <svg
                aria-label={`Choropleth map of Brazil by ${viewLevel}`}
                role="img"
                viewBox="0 0 760 640"
              >
                <g aria-hidden="true">
                  {paths.map((shape) => {
                    const row = municipalityById.get(shape.id);
                    const active = row ? filteredIds.has(row.id) : false;
                    const item =
                      row && active
                        ? aggregateForView(row, viewLevel, biomeMap, stateMap)
                        : null;
                    const value = item ? valueForMetric(item, metric) : null;
                    const label = item?.label ?? row?.name ?? "No data";
                    const fill = active
                      ? colorFor(value, metric, viewLevel)
                      : "#efeee9";
                    return (
                      <path
                        className={`municipality-shape ${
                          active ? "is-active" : "is-muted"
                        }`}
                        d={shape.d}
                        fill={fill}
                        key={shape.id}
                        onClick={() => {
                          if (!row || !item) return;
                          if (viewLevel === "biome") setBiome(row.biome);
                          else if (viewLevel === "state") setStateCode(row.stateCode);
                          else setSelectedMunicipality(row);
                        }}
                        onMouseEnter={() => item && setHovered(item)}
                        onMouseLeave={() => setHovered(null)}
                      >
                        <title>
                          {label}: {displayMetric(value, metric)} ·{" "}
                          {number.format(item?.linkedAreaHa ?? 0)} ha linked
                        </title>
                      </path>
                    );
                  })}
                  {boundaryPath ? (
                    <path className="group-boundary" d={boundaryPath} />
                  ) : null}
                  {outlinePath ? <path className="country-outline" d={outlinePath} /> : null}
                </g>
              </svg>

              <div className="map-legend">
                <span>
                  {metric === "deforestationShare"
                    ? "Share of recent deforestation linked to soy (%)"
                    : metric === "exposure"
                      ? "Exposure intensity (%)"
                      : "Linked area (ha)"}
                </span>
                <div className="legend-scale">
                  {RATE_COLORS.slice(0, legendThresholds.length + 1).map(
                    (color, index) => (
                      <i key={`${color}-${index}`} style={{ background: color }} />
                    ),
                  )}
                </div>
                <div className="legend-labels">
                  {legendThresholds.map((threshold) => (
                    <span key={threshold}>
                      {metric !== "absolute"
                        ? threshold
                        : compact.format(threshold)}
                    </span>
                  ))}
                  <span>+</span>
                </div>
              </div>
            </div>

            <aside className="map-inspector" aria-live="polite">
              {hovered ? (
                <>
                  <p className="eyebrow">Map selection</p>
                  <h3>{hovered.label}</h3>
                  <span className="inspector-secondary">{hovered.secondary}</span>
                  {statusLabel(hovered) ? (
                    <span className="status-badge warning">
                      {statusLabel(hovered)}
                      {hovered.ratePct !== null && hovered.ratePct > 100 ? (
                        <ComparabilityInfo />
                      ) : null}
                    </span>
                  ) : null}
                  <dl>
                    <div>
                      <dt>Deforestation share</dt>
                      <dd>{percentLabel(hovered.deforestationSharePct)}</dd>
                    </div>
                    {viewLevel === "municipality" ? (
                      <>
                        <div>
                          <dt>{benchmark.label}</dt>
                          <dd>{percentLabel(benchmark.value)}</dd>
                        </div>
                        <div>
                          <dt>Difference vs benchmark</dt>
                          <dd>
                            {percentagePointDelta(
                              hovered.deforestationSharePct,
                              benchmark.value,
                            )}
                          </dd>
                        </div>
                      </>
                    ) : null}
                    <div>
                      <dt>Exposure intensity</dt>
                      <dd>
                        {percentLabel(hovered.ratePct)}
                        {hovered.ratePct !== null && hovered.ratePct > 100 ? (
                          <ComparabilityInfo />
                        ) : null}
                      </dd>
                    </div>
                    <div>
                      <dt>Linked area</dt>
                      <dd>{number.format(hovered.linkedAreaHa)} ha</dd>
                    </div>
                    <div>
                      <dt>2024 soy area</dt>
                      <dd>{number.format(hovered.soyAreaHa)} ha</dd>
                    </div>
                    <div>
                      <dt>Territorial deforestation</dt>
                      <dd>
                        {number.format(hovered.territorialDeforestationHa)} ha
                      </dd>
                    </div>
                  </dl>
                  {hovered.ratePct === null ? (
                    <p className="inspector-note">
                      The rate is undefined because the denominator is 0 ha.
                      The absolute linked area remains visible.
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="inspector-placeholder">
                  <MapIcon size={24} />
                  <h3>Explore the map</h3>
                  <p>
                    Hover for values. Click a biome or state to filter, or a
                    municipality to inspect it.
                  </p>
                </div>
              )}
            </aside>
          </div>

          {selectedMunicipality ? (
            <div className="selection-callout">
              <div>
                <p className="eyebrow">Selected municipality</p>
                <h3>
                  {selectedMunicipality.name}, {selectedMunicipality.stateCode}
                </h3>
                <span>{selectedMunicipality.biome} · predominant biome</span>
              </div>
              <dl>
                <div>
                  <dt>Deforestation share</dt>
                  <dd>
                    {percentLabel(selectedMunicipality.deforestationSharePct)}
                  </dd>
                </div>
                <div>
                  <dt>{benchmark.label}</dt>
                  <dd>{percentLabel(benchmark.value)}</dd>
                </div>
                <div>
                  <dt>Difference vs benchmark</dt>
                  <dd>
                    {percentagePointDelta(
                      selectedMunicipality.deforestationSharePct,
                      benchmark.value,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Exposure intensity</dt>
                  <dd>
                    {percentLabel(selectedMunicipality.ratePct)}
                    {selectedMunicipality.ratePct !== null &&
                    selectedMunicipality.ratePct > 100 ? (
                      <ComparabilityInfo />
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt>Linked</dt>
                  <dd>{number.format(selectedMunicipality.linkedAreaHa)} ha</dd>
                </div>
              </dl>
              <button onClick={() => setSelectedMunicipality(null)} type="button">
                Close
              </button>
            </div>
          ) : null}
        </article>

        <aside className="rankings-column">
          <Ranking
            items={stateAggregates}
            limit={5}
            metric={metric}
            onSelect={(item) => selectRanking(item, "state")}
            subtitle={`Highest ${metricLabel(metric).toLowerCase()}`}
            title="Top 5 states"
          />
          <Ranking
            items={filtered.map(municipalityAsAggregate)}
            limit={10}
            metric={metric}
            minimumSoyAreaHa={data.metadata.rankingMinimumSoyAreaHa}
            onSelect={(item) => selectRanking(item, "municipality")}
            subtitle={`Highest ${metricLabel(metric).toLowerCase()} · ≥5,000 ha soy`}
            title="Top 10 eligible municipalities"
          />
        </aside>
      </section>

      <section className="table-card">
        <div className="section-heading table-heading">
          <div>
            <p className="eyebrow">Municipal detail</p>
            <h2>Highest values under active filters</h2>
            <span className="section-subtitle">
              Showing 20 of {number.format(filtered.length)} municipalities,
              ordered by the active map metric.
            </span>
          </div>
          <button className="download-button" onClick={downloadFiltered} type="button">
            <Download size={16} /> Download filtered CSV
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Municipality</th>
                <th>State</th>
                <th>Predominant biome</th>
                <th className="numeric">Soy area (ha)</th>
                <th className="numeric">Linked area (ha)</th>
                <th className="numeric">Territorial deforestation (ha)</th>
                <th className="numeric">Deforestation share</th>
                <th className="numeric">Exposure intensity</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.name}</strong>
                    <span className="table-id">IBGE {row.id}</span>
                  </td>
                  <td>{row.stateCode}</td>
                  <td>{row.biome}</td>
                  <td className="numeric">{number.format(row.soyAreaHa)}</td>
                  <td className="numeric">{number.format(row.linkedAreaHa)}</td>
                  <td className="numeric">
                    {number.format(row.territorialDeforestationHa)}
                  </td>
                  <td className="numeric">
                    <span className="rate-pill">
                      {percentLabel(row.deforestationSharePct)}
                    </span>
                  </td>
                  <td className="numeric">
                    <span
                      className={`rate-pill ${
                        row.rateStatus === "valid" ? "" : "warning"
                      }`}
                    >
                      {percentLabel(row.ratePct)}
                      {row.rateStatus === "above_100" ? (
                        <ComparabilityInfo />
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tableRows.length === 0 ? (
            <p className="empty-state table-empty">
              No municipalities match the active filters.
            </p>
          ) : null}
        </div>
      </section>

      <section className="methodology-card" id="methodology">
        <div className="methodology-intro">
          <p className="eyebrow">Methods &amp; interpretation</p>
          <h2>Two percentages answer two different questions</h2>
          <p>
            The primary percentage uses Trase&apos;s territorial-deforestation
            denominator for 2019–2023. Exposure intensity compares the same
            linked area with IBGE-reported 2024 soy area. Neither metric is
            evidence of property-level causation or calendar-year 2024 clearance.
          </p>
        </div>
        <div className="method-grid">
          <article>
            <span>01</span>
            <h3>Deforestation share</h3>
            <p>
              Soy-linked hectares divided by all territorial deforestation from
              2019–2023. This bounded percentage asks how much recent
              deforestation was subsequently linked to 2024 soy.
            </p>
          </article>
          <article>
            <span>02</span>
            <h3>Exposure intensity</h3>
            <p>
              Soy-linked hectares divided by IBGE-reported harvested soy area.
              IBGE statistics and Trase spatial processing are not spatially
              identical, so this diagnostic ratio may exceed 100%.
            </p>
          </article>
          <article>
            <span>03</span>
            <h3>Aggregation &amp; benchmark</h3>
            <p>
              All group percentages are ratios of sums, never averages. A
              municipality is compared with Brazil, the selected predominant
              biome or the selected state, using the most specific active
              geographic filter.
            </p>
          </article>
          <article>
            <span>04</span>
            <h3>ZDC ranking rule</h3>
            <p>
              The municipal Top 10 includes only jurisdictions with at least
              5,000 ha of reported soy, consistent with the Earthworm ZDC
              screening logic. The map, table and downloads retain every
              municipality.
            </p>
          </article>
        </div>
        <div className="sources">
          <h3>Sources</h3>
          <div>
            {data.metadata.sources.map((source) => (
              <a href={source.url} key={source.name} rel="noreferrer" target="_blank">
                {source.name}
              </a>
            ))}
          </div>
          <p>
            Trase data visualisations are attributed under CC BY 4.0. Municipal
            boundaries are for statistical visualisation and do not imply
            property-level precision.
          </p>
        </div>
      </section>

      <footer>
        <span>Brazil Soy Exposure · 2024 metric</span>
        <span>Data: Trase · Geography: IBGE</span>
      </footer>
    </main>
  );
}
