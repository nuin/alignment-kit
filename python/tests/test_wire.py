import gzip
import json
import shutil
import subprocess

import pytest

from msa_canvas import to_wire
from msa_canvas.wire import read_alignment


def test_records_as_pairs_mappings_and_name_to_sequence():
    expected = {"format": "msa-canvas", "version": 1, "alignment": {"rows": [{"name": "a", "sequence": "AC-T"}, {"name": "b", "sequence": "ACGT"}]}}
    assert to_wire([("a", "AC-T"), ("b", "ACGT")]) == expected
    assert to_wire({"a": "AC-T", "b": "ACGT"}) == expected
    assert to_wire(iter([{"name": "a", "sequence": "AC-T"}, {"name": "b", "sequence": "ACGT", "species": None}])) == expected
    doc = to_wire([{"id": "r1", "name": "a", "sequence": "MK.L*", "species": "Homo sapiens", "metadata": {"start": 5}}], name="One", alphabet="protein")
    assert doc["alignment"] == {"rows": [{"id": "r1", "name": "a", "sequence": "MK.L*", "species": "Homo sapiens", "metadata": {"start": 5}}], "name": "One", "alphabet": "protein"}
    json.dumps(doc, allow_nan=False)


def test_biopython_shaped_records():
    class Record:
        def __init__(self, id, seq, description=""):
            self.id, self.seq, self.description = id, seq, description

    rows = to_wire([Record("a", "ACGT", "a first"), Record("b", bytearray(b"AC-T").decode()), Record("c", "ACGT", "<unknown description>")])["alignment"]["rows"]
    assert rows == [{"name": "a", "sequence": "ACGT", "metadata": {"description": "a first"}}, {"name": "b", "sequence": "AC-T"}, {"name": "c", "sequence": "ACGT"}]


def test_extras_and_existing_documents():
    state = {"version": 1, "sort": "name"}
    doc = to_wire([("a", "AC")], tree="(a);", config={"height": 500}, state=state, annotations=[{"id": "x", "label": "x", "mapping": "unmapped"}])
    assert doc["tree"] == "(a);" and doc["config"] == {"height": 500} and doc["state"] == state and doc["annotations"][0]["id"] == "x"
    again = to_wire(doc, name="Renamed", config={"theme": "dark"})
    assert again["alignment"]["name"] == "Renamed" and again["config"] == {"theme": "dark"} and again["tree"] == "(a);"
    assert "name" not in doc["alignment"]
    with pytest.raises(ValueError, match="version 2"):
        to_wire({"format": "msa-canvas", "version": 2, "alignment": {"rows": []}})


def test_fasta_text_and_path(tmp_path):
    text = ">a/5-8 first\nAC\nGT\n; comment\n\n>b\nAC-T\n"
    rows = [{"name": "a/5-8 first", "sequence": "ACGT"}, {"name": "b", "sequence": "AC-T"}]
    assert to_wire(text)["alignment"] == {"rows": rows}
    path = tmp_path / "small.fasta"
    path.write_text("﻿" + text.replace("\n", "\r\n"), encoding="utf-8")
    assert to_wire(path)["alignment"] == {"rows": rows, "name": "small.fasta"}
    zipped = tmp_path / "small.fa.gz"
    zipped.write_bytes(gzip.compress(text.encode()))
    assert to_wire(str(zipped))["alignment"] == {"rows": rows, "name": "small.fa"}


def test_stockholm_blocks_names_and_offsets():
    text = "# STOCKHOLM 1.0\n#=GF ID Fam\n#=GS x/5-8 AC P1\nx/5-8 AC\ny/7-5 AC\nz    AC\n#=GC SS_cons ..\n\nx/5-8 .T\ny/7-5 GT\nz GT\n//\n"
    assert to_wire(text)["alignment"] == {
        "rows": [{"name": "x/5-8", "sequence": "AC.T", "metadata": {"start": 5}}, {"name": "y/7-5", "sequence": "ACGT"}, {"name": "z", "sequence": "ACGT"}],
        "name": "Fam",
    }


@pytest.mark.parametrize(
    "source, message",
    [
        ([], "at least one sequence"),
        ([("a", "ACGT"), ("b", "AC")], 'Sequence "b" has length 2; expected 4'),
        ([("a", "AC1T")], 'Invalid residue symbol in "a", column 3'),
        ([("a", "")], "Record 1 needs a non-empty string sequence"),
        ([{"name": "a", "sequence": "AC", "seq": "x"}], "Record 1 has unknown keys: seq"),
        ([{"id": "r", "name": "a", "sequence": "AC"}, {"id": "r", "name": "b", "sequence": "AC"}], 'Duplicate sequence ID "r"'),
        (">a\nAC\n>\nAC\n", "Missing FASTA name at line 3"),
        ("AC\n>a\nAC\n", "Unrecognized alignment format"),
        ("# STOCKHOLM 1.0\na AC\n", "missing its // terminator"),
        ("# STOCKHOLM 1.0\na AC extra\n//\n", "Malformed Stockholm sequence at line 2"),
    ],
)
def test_bad_input_raises_value_error(source, message):
    with pytest.raises(ValueError, match=message):
        to_wire(source)


def test_bad_types_and_arguments():
    with pytest.raises(TypeError, match="Record 1 must be"):
        to_wire([42])
    with pytest.raises(ValueError, match="alphabet must be one of"):
        to_wire([("a", "AC")], alphabet="aa")
    with pytest.raises(ValueError, match="tree must be a Newick string"):
        to_wire([("a", "AC")], tree="")
    with pytest.raises(FileNotFoundError):
        to_wire("no-such-file.fasta")


def test_demo_snapshots(demo):
    rows, name = read_alignment(demo / "kinase-seed.sto.gz")
    assert name == "Pkinase" and len(rows) == 37 and rows[0]["name"] == "WEE1_HUMAN/299-569" and rows[0]["metadata"] == {"start": 299}
    assert len({len(row["sequence"]) for row in rows}) == 1
    doc = to_wire(demo / "cbs-seed.sto")
    assert len(doc["alignment"]["rows"]) == 838 and len(doc["alignment"]["rows"][0]["sequence"]) == 160


@pytest.mark.parametrize("file", ["cbs-seed.sto", "kinase-seed.sto.gz", "trna-seed.sto.gz"])
def test_javascript_reads_the_same_alignment(demo, repo, file):
    """fromJson of the npm build accepts the document and derives the id that the JavaScript parser derives."""
    if not shutil.which("node") or not (repo / "dist" / "index.js").exists():
        pytest.skip("needs node and a built dist/")
    script = "import('./dist/index.js').then(m=>{const d=m.fromJson(require('fs').readFileSync(0,'utf8')).alignment;console.log(JSON.stringify([d.id,d.name,d.rows.length,d.width,d.rows[0].metadata??null]))})"
    mine = subprocess.run(["node", "-e", script], input=json.dumps(to_wire(demo / file)), capture_output=True, text=True, cwd=repo, check=True)
    theirs = subprocess.run(["node", "bin/msa-canvas.mjs", str(demo / file), "--json"], capture_output=True, text=True, cwd=repo, check=True)
    reference = json.loads(theirs.stdout)["alignment"]
    identifier, name, count, width, metadata = json.loads(mine.stdout)
    assert identifier == reference["id"] and count == len(reference["rows"]) and width == len(reference["rows"][0]["sequence"])
    assert metadata == reference["rows"][0].get("metadata")
