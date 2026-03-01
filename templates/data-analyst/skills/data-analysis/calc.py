#!/usr/bin/env python3
"""Golem data-analyst helper — basic statistics on CSV files."""

import csv
import sys
import json
from pathlib import Path


def analyze_csv(filepath: str) -> dict:
    path = Path(filepath)
    if not path.exists():
        return {"error": f"File not found: {filepath}"}

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    if not rows:
        return {"error": "Empty CSV file", "rows": 0}

    columns = list(rows[0].keys())
    numeric_cols = {}

    for col in columns:
        vals = []
        for row in rows:
            try:
                vals.append(float(row[col]))
            except (ValueError, TypeError):
                break
        else:
            if vals:
                numeric_cols[col] = vals

    stats = {}
    for col, vals in numeric_cols.items():
        sorted_vals = sorted(vals)
        n = len(sorted_vals)
        stats[col] = {
            "count": n,
            "min": sorted_vals[0],
            "max": sorted_vals[-1],
            "mean": round(sum(sorted_vals) / n, 4),
            "median": sorted_vals[n // 2] if n % 2 else round((sorted_vals[n // 2 - 1] + sorted_vals[n // 2]) / 2, 4),
        }

    return {
        "file": filepath,
        "rows": len(rows),
        "columns": columns,
        "numeric_columns": list(numeric_cols.keys()),
        "stats": stats,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python calc.py <csv_file>", file=sys.stderr)
        sys.exit(1)
    result = analyze_csv(sys.argv[1])
    print(json.dumps(result, ensure_ascii=False, indent=2))
