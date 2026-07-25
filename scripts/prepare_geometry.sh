#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_zip="$project_root/data/raw/BR_Municipios_2022.zip"
geometry_dir="$project_root/data/raw/ibge-municipalities-2022"
output_file="$project_root/public/data/municipalities.topo.json"

if [[ ! -f "$source_zip" ]]; then
  echo "Missing required source file: $source_zip" >&2
  echo "Run npm run data:download first." >&2
  exit 1
fi

mkdir -p "$geometry_dir" "$(dirname "$output_file")"
unzip -oq "$source_zip" -d "$geometry_dir"

shape_file="$(find "$geometry_dir" -type f -name 'BR_Municipios_2022.shp' -print -quit)"
if [[ -z "$shape_file" ]]; then
  echo "BR_Municipios_2022.shp was not found in the IBGE archive." >&2
  exit 1
fi

"$project_root/node_modules/.bin/mapshaper" \
  "$shape_file" \
  -clean \
  -simplify 4% keep-shapes \
  -filter-fields CD_MUN \
  -o format=topojson quantization=100000 "$output_file"

node - "$output_file" <<'NODE'
const fs = require("node:fs");
const file = process.argv[2];
const topology = JSON.parse(fs.readFileSync(file, "utf8"));
const object = Object.values(topology.objects)[0];
if (!object || object.type !== "GeometryCollection") {
  throw new Error("Unexpected TopoJSON object");
}
if (object.geometries.length !== 5572) {
  throw new Error(
    `Expected 5,572 IBGE geometries, found ${object.geometries.length}`,
  );
}
if (object.geometries.some((item) => !item.properties?.CD_MUN)) {
  throw new Error("At least one geometry is missing CD_MUN");
}
console.log(`Wrote ${file} with ${object.geometries.length} geometries`);
NODE

