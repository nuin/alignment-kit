"""Build msa-canvas wire format 1 documents with the standard library only."""

from __future__ import annotations

import gzip
import os
import re
from collections.abc import Iterable, Mapping
from typing import Any

WIRE_FORMAT = "msa-canvas"
WIRE_VERSION = 1

_RESIDUES = re.compile(r"[A-Za-z*.\-]+")
_RANGE = re.compile(r"/(\d+)-(\d+)$")
_ALPHABETS = ("protein", "dna", "rna")


def _parse_fasta(text: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for number, line in enumerate(text.splitlines(), 1):
        if line.startswith(">"):
            name = line[1:].strip()
            if not name:
                raise ValueError(f"Missing FASTA name at line {number}.")
            rows.append({"name": name, "sequence": ""})
        elif line.strip() and not line.startswith(";"):
            if not rows:
                raise ValueError(f"Sequence before FASTA header at line {number}.")
            rows[-1]["sequence"] += "".join(line.split())
    return rows


def _parse_stockholm(text: str) -> tuple[list[dict[str, Any]], str | None]:
    rows: dict[str, dict[str, Any]] = {}
    name = None
    terminated = False
    for number, line in enumerate(text.splitlines()[1:], 2):
        stripped = line.strip()
        if not stripped:
            continue
        if stripped == "//":
            terminated = True
            continue
        if terminated:
            raise ValueError(
                "Multiple Stockholm alignments in one file are not supported."
            )
        if line.startswith("#"):
            parts = line.split(None, 2)
            if len(parts) == 3 and parts[0] == "#=GF" and parts[1] == "ID":
                name = parts[2].strip()
            continue
        parts = stripped.split()
        if len(parts) != 2:
            raise ValueError(f"Malformed Stockholm sequence at line {number}.")
        rows.setdefault(parts[0], {"name": parts[0], "sequence": ""})["sequence"] += (
            parts[1]
        )
    if not terminated:
        raise ValueError("Stockholm alignment is missing its // terminator.")
    for row in rows.values():
        match = _RANGE.search(row["name"])
        if match and 1 <= int(match.group(1)) <= int(match.group(2)):
            row["metadata"] = {"start": int(match.group(1))}
    return list(rows.values()), name


def read_alignment(path: str | os.PathLike[str]) -> tuple[list[dict[str, Any]], str]:
    """Read an aligned FASTA or Stockholm file (gzip detected by its first two bytes).

    Returns the rows and the alignment name. Stockholm rows named ``name/start-end`` get
    ``metadata.start``; ``#=GF ID`` gives the name. Other Stockholm markup is dropped: use
    ``msa-canvas file --json`` from the npm package to keep it.
    """
    with open(path, "rb") as handle:
        data = handle.read()
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    return _parse_text(
        data.decode("utf-8"),
        re.sub(r"\.gz$", "", os.path.basename(os.fspath(path)), flags=re.IGNORECASE),
    )


def _parse_text(text: str, fallback: str) -> tuple[list[dict[str, Any]], str]:
    text = text.lstrip("﻿").strip()
    if text.startswith("# STOCKHOLM"):
        rows, name = _parse_stockholm(text)
        return rows, name or fallback
    if text.startswith(">"):
        return _parse_fasta(text), fallback
    raise ValueError(
        "Unrecognized alignment format. to_wire reads aligned FASTA and Stockholm; convert other formats with the msa-canvas command."
    )


def _row(record: Any, index: int) -> dict[str, Any]:
    if isinstance(record, Mapping):
        unknown = set(record) - {"id", "name", "sequence", "species", "metadata"}
        if unknown:
            raise ValueError(
                f"Record {index + 1} has unknown keys: {', '.join(sorted(map(str, unknown)))}."
            )
        row = {key: value for key, value in record.items() if value is not None}
    elif isinstance(record, (tuple, list)) and len(record) == 2:
        row = {"name": record[0], "sequence": record[1]}
    elif hasattr(record, "seq") and hasattr(record, "id"):
        # Biopython SeqRecord and anything shaped like it.
        row = {"name": str(record.id), "sequence": str(record.seq)}
        description = getattr(record, "description", "")
        if description and description not in ("<unknown description>", row["name"]):
            row["metadata"] = {"description": str(description)}
    else:
        raise TypeError(
            f"Record {index + 1} must be a (name, sequence) pair, a mapping with name and sequence, or an object with id and seq."
        )
    for key in ("name", "sequence"):
        if not isinstance(row.get(key), str) or not row[key]:
            raise ValueError(f"Record {index + 1} needs a non-empty string {key}.")
    for key in ("id", "species"):
        if key in row and not isinstance(row[key], str):
            raise ValueError(f"Record {index + 1}: {key} must be a string.")
    if "metadata" in row and not isinstance(row["metadata"], Mapping):
        raise ValueError(f"Record {index + 1}: metadata must be a mapping.")
    return row


def _rows(records: Iterable[Any]) -> list[dict[str, Any]]:
    rows = [_row(record, index) for index, record in enumerate(records)]
    if not rows:
        raise ValueError("An alignment needs at least one sequence.")
    width = len(rows[0]["sequence"])
    ids: set[str] = set()
    for index, row in enumerate(rows):
        sequence = row["sequence"]
        if len(sequence) != width:
            raise ValueError(
                f'Sequence "{row["name"]}" has length {len(sequence)}; expected {width}. Supply aligned sequences of equal length.'
            )
        if not _RESIDUES.fullmatch(sequence):
            column = next(
                i for i, char in enumerate(sequence, 1) if not _RESIDUES.fullmatch(char)
            )
            raise ValueError(
                f'Invalid residue symbol in "{row["name"]}", column {column}.'
            )
        identifier = row.get("id", f"seq-{index + 1}")
        if identifier in ids:
            raise ValueError(f'Duplicate sequence ID "{identifier}".')
        ids.add(identifier)
    return rows


def to_wire(
    source: Any,
    *,
    name: str | None = None,
    alphabet: str | None = None,
    annotations: Iterable[Mapping[str, Any]] | None = None,
    tree: str | None = None,
    config: Mapping[str, Any] | None = None,
    state: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Return a wire format 1 document as plain dicts and lists, ready for ``json.dumps``.

    ``source`` is one of: a path to an aligned FASTA or Stockholm file (``str`` or
    ``os.PathLike``), alignment text (a ``str`` with a line break), an iterable of
    ``(name, sequence)`` pairs, mappings with ``name`` and ``sequence`` (optional ``id``,
    ``species``, ``metadata``) or objects with ``id`` and ``seq`` (Biopython), a mapping of
    name to sequence, or an existing wire document. Keyword arguments set or replace the
    matching parts. Rows are checked for equal length and valid symbols; the viewer
    validates ``config``, ``state``, ``tree`` and ``annotations``.
    """
    if isinstance(source, Mapping) and source.get("format") == WIRE_FORMAT:
        if source.get("version") != WIRE_VERSION:
            raise ValueError(
                f"Wire version {source.get('version')!r} is not supported; this package writes version {WIRE_VERSION}."
            )
        doc = {key: value for key, value in source.items()}
        doc["alignment"] = dict(source["alignment"])
        doc["alignment"]["rows"] = _rows(source["alignment"].get("rows", []))
    else:
        default = None
        if isinstance(source, os.PathLike) or (
            isinstance(source, str) and "\n" not in source
        ):
            records, default = read_alignment(source)
        elif isinstance(source, str):
            records, default = _parse_text(source, "")
        elif isinstance(source, Mapping):
            records = list(source.items())
        else:
            records = source
        doc = {
            "format": WIRE_FORMAT,
            "version": WIRE_VERSION,
            "alignment": {"rows": _rows(records)},
        }
        if default:
            doc["alignment"]["name"] = default
    if name is not None:
        doc["alignment"]["name"] = name
    if alphabet is not None:
        if alphabet not in _ALPHABETS:
            raise ValueError(f"alphabet must be one of {', '.join(_ALPHABETS)}.")
        doc["alignment"]["alphabet"] = alphabet
    if annotations is not None:
        doc["annotations"] = [dict(item) for item in annotations]
    if tree is not None:
        if not isinstance(tree, str) or not tree.strip():
            raise ValueError("tree must be a Newick string.")
        doc["tree"] = tree
    if config is not None:
        doc["config"] = dict(config)
    if state is not None:
        doc["state"] = dict(state)
    return doc
