#!/usr/bin/env python3
"""Prepare auditable, browser-ready data for the soy exposure dashboard."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUTPUT = ROOT / "public" / "data" / "soy_exposure_2024.json"

AREA_FILE = RAW / "spatial-metrics-brazil-soy-soy_area_municipality.csv"
DEFORESTATION_FILE = (
    RAW / "spatial-metrics-brazil-soy-soy_deforestation_5_year_total_municipality.csv"
)
TERRITORIAL_FILE = (
    RAW / "spatial-metrics-brazil-territorial_deforestation_municipality.csv"
)
BIOME_FILE = RAW / "bioma_predominante_2024.xlsx"
TARGET_YEAR = 2024
TERRITORIAL_START_YEAR = 2019
TERRITORIAL_END_YEAR = 2023
RANKING_MIN_SOY_AREA_HA = 5_000

STATE_NAMES = {
    "AC": "Acre",
    "AL": "Alagoas",
    "AP": "Amapá",
    "AM": "Amazonas",
    "BA": "Bahia",
    "CE": "Ceará",
    "DF": "Distrito Federal",
    "ES": "Espírito Santo",
    "GO": "Goiás",
    "MA": "Maranhão",
    "MT": "Mato Grosso",
    "MS": "Mato Grosso do Sul",
    "MG": "Minas Gerais",
    "PA": "Pará",
    "PB": "Paraíba",
    "PR": "Paraná",
    "PE": "Pernambuco",
    "PI": "Piauí",
    "RJ": "Rio de Janeiro",
    "RN": "Rio Grande do Norte",
    "RS": "Rio Grande do Sul",
    "RO": "Rondônia",
    "RR": "Roraima",
    "SC": "Santa Catarina",
    "SP": "São Paulo",
    "SE": "Sergipe",
    "TO": "Tocantins",
}

BIOME_NAMES = {
    "Amazônia": "Amazon",
    "Mata Atlântica": "Atlantic Forest",
    "Caatinga": "Caatinga",
    "Cerrado": "Cerrado",
    "Pampa": "Pampa",
    "Pantanal": "Pantanal",
}


def finite_or_none(value: float) -> float | None:
    return float(value) if math.isfinite(value) else None


def aggregate(frame: pd.DataFrame, keys: list[str]) -> list[dict]:
    grouped = (
        frame.groupby(keys, dropna=False, as_index=False)
        .agg(
            soy_area_ha=("soy_area_ha", "sum"),
            linked_area_ha=("linked_area_ha", "sum"),
            territorial_deforestation_ha=(
                "territorial_deforestation_ha",
                "sum",
            ),
            municipalities=("municipality_id", "count"),
            undefined_rates=("rate_status", lambda s: int((s == "undefined").sum())),
            rates_above_100=("rate_status", lambda s: int((s == "above_100").sum())),
        )
        .sort_values(keys)
    )
    grouped["rate_pct"] = (
        100 * grouped["linked_area_ha"] / grouped["soy_area_ha"]
    )
    grouped["deforestation_share_pct"] = (
        100
        * grouped["linked_area_ha"]
        / grouped["territorial_deforestation_ha"]
    )
    result = []
    for row in grouped.to_dict("records"):
        row["rate_pct"] = finite_or_none(row["rate_pct"])
        row["deforestation_share_pct"] = finite_or_none(
            row["deforestation_share_pct"]
        )
        result.append(row)
    return result


def main() -> None:
    for path in (AREA_FILE, DEFORESTATION_FILE, TERRITORIAL_FILE, BIOME_FILE):
        if not path.exists():
            raise FileNotFoundError(f"Missing required source file: {path}")

    area = pd.read_csv(AREA_FILE, dtype={"region_trase_id": str})
    area = area.loc[area["year"] == TARGET_YEAR].rename(
        columns={"soy_area_hectares": "soy_area_ha"}
    )
    deforestation = pd.read_csv(
        DEFORESTATION_FILE, dtype={"region_trase_id": str}
    )
    deforestation = deforestation.loc[
        deforestation["year"] == TARGET_YEAR
    ].rename(columns={"soy_deforestation_hectares": "linked_area_ha"})
    territorial = pd.read_csv(
        TERRITORIAL_FILE, dtype={"region_trase_id": str}
    )
    territorial = (
        territorial.loc[
            territorial["year"].between(
                TERRITORIAL_START_YEAR,
                TERRITORIAL_END_YEAR,
            )
        ]
        .groupby("region_trase_id", as_index=False)
        .agg(
            territorial_deforestation_ha=(
                "deforestation_hectares",
                "sum",
            )
        )
    )
    biome = pd.read_excel(
        BIOME_FILE,
        sheet_name="Lista_Predominante",
        header=1,
        dtype={"Geocódigo": str},
    ).rename(
        columns={
            "Nome do município": "municipality_name",
            "Sigla da UF": "state_code",
            "Bioma predominante": "biome_pt",
        }
    )
    biome["municipality_id"] = "BR-" + biome["Geocódigo"].str.zfill(7)

    if area["region_trase_id"].duplicated().any():
        raise ValueError("Duplicate municipality IDs in the soy-area source")
    if deforestation["region_trase_id"].duplicated().any():
        raise ValueError("Duplicate municipality IDs in the deforestation source")
    if territorial["region_trase_id"].duplicated().any():
        raise ValueError("Duplicate municipality IDs in the territorial source")

    frame = (
        area[
            [
                "region_trase_id",
                "parent_region",
                "soy_area_ha",
                "year",
            ]
        ]
        .rename(columns={"region_trase_id": "municipality_id"})
        .merge(
            deforestation[["region_trase_id", "linked_area_ha"]].rename(
                columns={"region_trase_id": "municipality_id"}
            ),
            on="municipality_id",
            how="left",
            validate="one_to_one",
        )
        .merge(
            territorial[
                ["region_trase_id", "territorial_deforestation_ha"]
            ].rename(columns={"region_trase_id": "municipality_id"}),
            on="municipality_id",
            how="left",
            validate="one_to_one",
        )
        .merge(
            biome[
                [
                    "municipality_id",
                    "municipality_name",
                    "state_code",
                    "biome_pt",
                ]
            ],
            on="municipality_id",
            how="left",
            validate="one_to_one",
        )
    )

    if frame["linked_area_ha"].isna().any():
        raise ValueError("Some soy-area municipalities are missing deforestation values")
    if frame["territorial_deforestation_ha"].isna().any():
        raise ValueError("Some municipalities are missing territorial deforestation")
    if frame["biome_pt"].isna().any():
        raise ValueError("Some municipalities are missing a predominant-biome match")
    if set(frame["year"].unique()) != {TARGET_YEAR}:
        raise ValueError("Unexpected year in the soy-area source")

    frame["state_name"] = frame["state_code"].map(STATE_NAMES)
    frame["biome"] = frame["biome_pt"].map(BIOME_NAMES)
    frame["rate_pct"] = 100 * frame["linked_area_ha"] / frame["soy_area_ha"]
    frame["deforestation_share_pct"] = (
        100
        * frame["linked_area_ha"]
        / frame["territorial_deforestation_ha"]
    )
    frame["rate_status"] = "valid"
    frame.loc[frame["soy_area_ha"] == 0, "rate_status"] = "undefined"
    frame.loc[
        (frame["soy_area_ha"] > 0) & (frame["rate_pct"] > 100),
        "rate_status",
    ] = "above_100"

    records = []
    for row in frame.sort_values("municipality_id").to_dict("records"):
        records.append(
            {
                "id": row["municipality_id"].replace("BR-", ""),
                "name": row["municipality_name"],
                "state": row["state_name"],
                "stateCode": row["state_code"],
                "biome": row["biome"],
                "soyAreaHa": float(row["soy_area_ha"]),
                "linkedAreaHa": float(row["linked_area_ha"]),
                "territorialDeforestationHa": float(
                    row["territorial_deforestation_ha"]
                ),
                "deforestationSharePct": finite_or_none(
                    row["deforestation_share_pct"]
                ),
                "ratePct": finite_or_none(row["rate_pct"]),
                "rateStatus": row["rate_status"],
            }
        )

    national_area = float(frame["soy_area_ha"].sum())
    national_linked = float(frame["linked_area_ha"].sum())
    national_territorial = float(frame["territorial_deforestation_ha"].sum())
    eligible = frame["soy_area_ha"] >= RANKING_MIN_SOY_AREA_HA
    payload = {
        "metadata": {
            "title": "Brazil Soy Deforestation & Conversion Exposure — 2024",
            "metricDefinition": (
                "Soy-linked deforestation and conversion within Trase's "
                "five-year allocation period, compared with recent territorial "
                "deforestation and reported 2024 soy area."
            ),
            "year": TARGET_YEAR,
            "territorialWindow": {
                "startYear": TERRITORIAL_START_YEAR,
                "endYear": TERRITORIAL_END_YEAR,
            },
            "rankingMinimumSoyAreaHa": RANKING_MIN_SOY_AREA_HA,
            "generatedOn": "2026-07-25",
            "municipalityCount": int(len(frame)),
            "national": {
                "soyAreaHa": national_area,
                "linkedAreaHa": national_linked,
                "territorialDeforestationHa": national_territorial,
                "deforestationSharePct": (
                    100 * national_linked / national_territorial
                ),
                "ratePct": 100 * national_linked / national_area,
            },
            "quality": {
                "zeroSoyAreaPositiveLinkedArea": int(
                    ((frame["soy_area_ha"] == 0) & (frame["linked_area_ha"] > 0)).sum()
                ),
                "ratesAbove100": int((frame["rate_status"] == "above_100").sum()),
                "linkedAreaWithZeroDenominatorHa": float(
                    frame.loc[frame["soy_area_ha"] == 0, "linked_area_ha"].sum()
                ),
                "deforestationSharesAbove100": int(
                    (frame["deforestation_share_pct"] > 100).sum()
                ),
                "rankingCoverage": {
                    "municipalities": int(eligible.sum()),
                    "soyAreaPct": float(
                        100
                        * frame.loc[eligible, "soy_area_ha"].sum()
                        / national_area
                    ),
                    "linkedAreaPct": float(
                        100
                        * frame.loc[eligible, "linked_area_ha"].sum()
                        / national_linked
                    ),
                },
            },
            "sources": [
                {
                    "name": "Trase — Brazil soy area, 2024",
                    "url": "https://trase.earth/open-data",
                },
                {
                    "name": "Trase — Brazil soy deforestation, five-year total",
                    "url": (
                        "https://trase.earth/open-data/datasets/"
                        "spatial-metrics-brazil-soy-soy-deforestation-5-year-total"
                    ),
                },
                {
                    "name": "Trase — Brazil territorial deforestation",
                    "url": (
                        "https://trase.earth/open-data/datasets/"
                        "spatial-metrics-brazil-territorial-deforestation"
                    ),
                },
                {
                    "name": "IBGE — Predominant Biome by Municipality, 2024",
                    "url": (
                        "https://geoftp.ibge.gov.br/informacoes_ambientais/"
                        "estudos_ambientais/biomas/documentos/"
                        "Bioma_Predominante_por_Municipio_2024.xlsx"
                    ),
                },
                {
                    "name": "IBGE — Digital Municipal Boundaries, 2022",
                    "url": (
                        "https://geoftp.ibge.gov.br/organizacao_do_territorio/"
                        "malhas_territoriais/malhas_municipais/municipio_2022/"
                        "Brasil/BR/"
                    ),
                },
            ],
        },
        "baselineAggregates": {
            "biomes": aggregate(frame, ["biome"]),
            "states": aggregate(frame, ["state_code", "state_name"]),
        },
        "municipalities": records,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "output": str(OUTPUT),
                "records": len(records),
                "national_rate_pct": payload["metadata"]["national"]["ratePct"],
                "national_deforestation_share_pct": payload["metadata"][
                    "national"
                ]["deforestationSharePct"],
                "undefined_rates": payload["metadata"]["quality"][
                    "zeroSoyAreaPositiveLinkedArea"
                ],
                "rates_above_100": payload["metadata"]["quality"]["ratesAbove100"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
