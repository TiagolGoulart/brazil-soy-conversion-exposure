import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const datasetUrl = new URL(
  "../public/data/soy_exposure_2024.json",
  import.meta.url,
);
const dataset = JSON.parse(await readFile(datasetUrl, "utf8"));
const rows = dataset.municipalities;

test("municipality dataset is complete and uniquely keyed", () => {
  assert.equal(rows.length, 5563);
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  assert.equal(rows.filter((row) => !row.biome).length, 0);
  assert.equal(rows.filter((row) => !row.stateCode).length, 0);
});

test("national aggregate reconciles to municipality sums", () => {
  const soyAreaHa = rows.reduce((sum, row) => sum + row.soyAreaHa, 0);
  const linkedAreaHa = rows.reduce((sum, row) => sum + row.linkedAreaHa, 0);
  const territorialDeforestationHa = rows.reduce(
    (sum, row) => sum + row.territorialDeforestationHa,
    0,
  );
  const ratePct = (100 * linkedAreaHa) / soyAreaHa;
  const deforestationSharePct =
    (100 * linkedAreaHa) / territorialDeforestationHa;

  assert.equal(soyAreaHa, dataset.metadata.national.soyAreaHa);
  assert.ok(
    Math.abs(linkedAreaHa - dataset.metadata.national.linkedAreaHa) < 1e-8,
  );
  assert.ok(Math.abs(ratePct - dataset.metadata.national.ratePct) < 1e-12);
  assert.ok(
    Math.abs(
      territorialDeforestationHa -
        dataset.metadata.national.territorialDeforestationHa,
    ) < 1e-6,
  );
  assert.ok(
    Math.abs(
      deforestationSharePct -
        dataset.metadata.national.deforestationSharePct,
    ) < 1e-12,
  );
});

test("quality flags are retained rather than capped or discarded", () => {
  const positiveUndefined = rows.filter(
    (row) => row.soyAreaHa === 0 && row.linkedAreaHa > 0,
  );
  const above100 = rows.filter((row) => (row.ratePct ?? 0) > 100);

  assert.equal(positiveUndefined.length, 119);
  assert.ok(positiveUndefined.every((row) => row.ratePct === null));
  assert.equal(above100.length, 3);
  assert.ok(above100.every((row) => row.rateStatus === "above_100"));
});

test("territorial deforestation share is bounded and uses the five-year window", () => {
  assert.deepEqual(dataset.metadata.territorialWindow, {
    startYear: 2019,
    endYear: 2023,
  });
  assert.equal(
    rows.filter((row) => (row.deforestationSharePct ?? 0) > 100).length,
    0,
  );
  assert.ok(
    Math.abs(dataset.metadata.national.deforestationSharePct - 5.942399648670641) <
      1e-12,
  );
});

test("5,000 ha municipal ranking rule has documented national coverage", () => {
  const minimum = dataset.metadata.rankingMinimumSoyAreaHa;
  const eligible = rows.filter((row) => row.soyAreaHa >= minimum);
  const soyAreaHa = rows.reduce((sum, row) => sum + row.soyAreaHa, 0);
  const linkedAreaHa = rows.reduce((sum, row) => sum + row.linkedAreaHa, 0);
  const eligibleSoyAreaHa = eligible.reduce(
    (sum, row) => sum + row.soyAreaHa,
    0,
  );
  const eligibleLinkedAreaHa = eligible.reduce(
    (sum, row) => sum + row.linkedAreaHa,
    0,
  );

  assert.equal(minimum, 5000);
  assert.equal(eligible.length, 1191);
  assert.ok(
    Math.abs(
      (100 * eligibleSoyAreaHa) / soyAreaHa -
        dataset.metadata.quality.rankingCoverage.soyAreaPct,
    ) < 1e-12,
  );
  assert.ok(
    Math.abs(
      (100 * eligibleLinkedAreaHa) / linkedAreaHa -
        dataset.metadata.quality.rankingCoverage.linkedAreaPct,
    ) < 1e-12,
  );
  assert.equal(
    eligible.filter((row) => (row.ratePct ?? 0) > 100).length,
    0,
  );
});

test("baseline biome aggregates reconcile to the national total", () => {
  const biomes = dataset.baselineAggregates.biomes;
  const soyAreaHa = biomes.reduce((sum, row) => sum + row.soy_area_ha, 0);
  const linkedAreaHa = biomes.reduce(
    (sum, row) => sum + row.linked_area_ha,
    0,
  );
  const territorialDeforestationHa = biomes.reduce(
    (sum, row) => sum + row.territorial_deforestation_ha,
    0,
  );

  assert.equal(soyAreaHa, dataset.metadata.national.soyAreaHa);
  assert.ok(
    Math.abs(linkedAreaHa - dataset.metadata.national.linkedAreaHa) < 1e-8,
  );
  assert.ok(
    Math.abs(
      territorialDeforestationHa -
        dataset.metadata.national.territorialDeforestationHa,
    ) < 1e-6,
  );
});
