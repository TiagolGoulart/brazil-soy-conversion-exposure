#!/usr/bin/env python3
"""Download pinned public inputs and record an auditable source manifest."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
MANIFEST = RAW / "source_manifest.json"
CHECKSUMS = ROOT / "data" / "source_checksums.json"

SOURCES = {
    "spatial-metrics-brazil-soy-soy_area_municipality.csv": (
        "https://resources.trase.earth/20260703/data/spatial-metrics/"
        "spatial-metrics-brazil-soy-soy_area_municipality.csv"
    ),
    "spatial-metrics-brazil-soy-soy_deforestation_5_year_total_municipality.csv": (
        "https://resources.trase.earth/20260703/data/spatial-metrics/"
        "spatial-metrics-brazil-soy-soy_deforestation_5_year_total_municipality.csv"
    ),
    "spatial-metrics-brazil-territorial_deforestation_municipality.csv": (
        "https://resources.trase.earth/20260703/data/spatial-metrics/"
        "spatial-metrics-brazil-territorial_deforestation_municipality.csv"
    ),
    "bioma_predominante_2024.xlsx": (
        "https://geoftp.ibge.gov.br/informacoes_ambientais/estudos_ambientais/"
        "biomas/documentos/Bioma_Predominante_por_Municipio_2024.xlsx"
    ),
    "BR_Municipios_2022.zip": (
        "https://geoftp.ibge.gov.br/organizacao_do_territorio/"
        "malhas_territoriais/malhas_municipais/municipio_2022/"
        "Brasil/BR/BR_Municipios_2022.zip"
    ),
}

MINIMUM_BYTES = {
    "spatial-metrics-brazil-soy-soy_area_municipality.csv": 100_000,
    "spatial-metrics-brazil-soy-soy_deforestation_5_year_total_municipality.csv": 100_000,
    "spatial-metrics-brazil-territorial_deforestation_municipality.csv": 100_000,
    "bioma_predominante_2024.xlsx": 50_000,
    "BR_Municipios_2022.zip": 1_000_000,
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, destination: Path) -> None:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "brazil-soy-conversion-exposure/0.1"},
    )
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.",
        dir=destination.parent,
    )
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            with temporary.open("wb") as target:
                while chunk := response.read(1024 * 1024):
                    target.write(chunk)
        temporary.replace(destination)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    expected = json.loads(CHECKSUMS.read_text(encoding="utf-8"))
    manifest = {
        "release": "20260703",
        "files": [],
    }

    for filename, url in SOURCES.items():
        destination = RAW / filename
        if not destination.exists():
            print(f"Downloading {filename}")
            download(url, destination)
        else:
            print(f"Using existing {filename}")

        size = destination.stat().st_size
        if size < MINIMUM_BYTES[filename]:
            raise ValueError(
                f"{filename} is unexpectedly small ({size} bytes); "
                "delete it and retry"
            )
        digest = sha256(destination)
        expected_digest = expected["files"].get(filename)
        if digest != expected_digest:
            raise ValueError(
                f"SHA-256 mismatch for {filename}: expected "
                f"{expected_digest}, found {digest}"
            )
        manifest["files"].append(
            {
                "filename": filename,
                "url": url,
                "bytes": size,
                "sha256": digest,
            }
        )

    MANIFEST.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {MANIFEST}")


if __name__ == "__main__":
    main()
