# htmlwidgets binding of the msa-canvas viewer. The browser receives wire format 1 JSON
# (docs/reference/wire-format.md in the repository) and validates it.

fasta_rows <- function(lines) {
  lines <- lines[nzchar(trimws(lines)) & !startsWith(lines, ";")]
  head <- startsWith(lines, ">")
  if (!length(lines) || !head[1]) stop("Sequence before FASTA header.", call. = FALSE)
  names <- trimws(substring(lines[head], 2))
  if (any(!nzchar(names))) stop("Missing FASTA name.", call. = FALSE)
  group <- factor(cumsum(head)[!head], levels = seq_along(names))
  sequences <- vapply(split(lines[!head], group), function(part) gsub("\\s", "", paste(part, collapse = "")), "")
  unname(Map(function(name, sequence) list(name = name, sequence = sequence), names, sequences))
}

stockholm_rows <- function(lines) {
  body <- trimws(lines[-1])
  if (!any(body == "//")) stop("Stockholm alignment is missing its // terminator.", call. = FALSE)
  body <- body[nzchar(body) & !startsWith(body, "#") & body != "//"]
  parts <- strsplit(body, "\\s+")
  if (any(lengths(parts) != 2)) stop("Malformed Stockholm sequence line.", call. = FALSE)
  names <- vapply(parts, `[`, "", 1)
  chunks <- vapply(parts, `[`, "", 2)
  order <- unique(names)
  sequences <- vapply(split(chunks, factor(names, levels = order)), paste, "", collapse = "")
  unname(Map(function(name, sequence) {
    row <- list(name = name, sequence = sequence)
    range <- regmatches(name, regexec("/([0-9]+)-([0-9]+)$", name))[[1]]
    if (length(range) == 3 && as.numeric(range[2]) >= 1 && as.numeric(range[2]) <= as.numeric(range[3])) {
      row$metadata <- list(start = as.integer(range[2]))
    }
    row
  }, order, sequences))
}

read_rows <- function(path) {
  connection <- gzfile(path, "rt", encoding = "UTF-8")
  on.exit(close(connection))
  lines <- sub("^﻿", "", readLines(connection, warn = FALSE))
  lines <- lines[cumsum(nzchar(trimws(lines))) > 0]
  name <- sub("\\.gz$", "", basename(path), ignore.case = TRUE)
  if (length(lines) && startsWith(lines[1], "# STOCKHOLM")) {
    id <- sub("^#=GF\\s+ID\\s+", "", grep("^#=GF\\s+ID\\s", lines, value = TRUE))
    return(list(rows = stockholm_rows(lines), name = if (length(id)) trimws(id[1]) else name))
  }
  if (length(lines) && startsWith(lines[1], ">")) return(list(rows = fasta_rows(lines), name = name))
  stop("Unrecognized alignment format. msa_wire() reads aligned FASTA and Stockholm; convert other formats with the msa-canvas command.", call. = FALSE)
}

check_rows <- function(rows) {
  if (!length(rows)) stop("An alignment needs at least one sequence.", call. = FALSE)
  sequences <- vapply(rows, function(row) {
    if (!is.character(row$name) || length(row$name) != 1 || !is.character(row$sequence) || length(row$sequence) != 1) {
      stop("Each row needs one name and one sequence string.", call. = FALSE)
    }
    row$sequence
  }, "")
  width <- nchar(sequences[1])
  uneven <- which(nchar(sequences) != width)
  if (length(uneven)) stop(sprintf("Sequence \"%s\" has length %d; expected %d. Supply aligned sequences of equal length.", rows[[uneven[1]]]$name, nchar(sequences[uneven[1]]), width), call. = FALSE)
  invalid <- which(!grepl("^[A-Za-z*.-]+$", sequences))
  if (length(invalid)) stop(sprintf("Invalid residue symbol in \"%s\".", rows[[invalid[1]]]$name), call. = FALSE)
  rows
}

# A JSON string passes through unchanged; this keeps {} and one-element arrays of a saved state intact.
json_part <- function(value) {
  if (is.character(value) && length(value) == 1 && is.null(names(value)) && jsonlite::validate(value)) structure(value, class = "json") else value
}

#' Build a wire format 1 document
#'
#' @param x A path to an aligned FASTA or Stockholm file (gzip accepted), a named
#'   character vector of aligned sequences, a list of rows (each a list with `name` and
#'   `sequence`, optionally `id`, `species` and `metadata`), or a wire document.
#' @param name Alignment name. Defaults to the Stockholm `#=GF ID` line or the file name.
#' @param alphabet "protein", "dna" or "rna". Detected by the viewer when NULL.
#' @param annotations A list of annotations, each a named list with `id`, `label` and
#'   `mapping`; see the wire format reference.
#' @param tree One Newick tree as a string.
#' @param config Viewer configuration as a named list or a JSON string.
#' @param state A view state as a named list or, preferably, the JSON string that the
#'   Shiny input `<outputId>_state` holds.
#' @return A list that `jsonlite::toJSON(auto_unbox = TRUE)` writes as wire format 1.
#' @export
msa_wire <- function(x, name = NULL, alphabet = NULL, annotations = NULL, tree = NULL, config = NULL, state = NULL) {
  if (is.list(x) && identical(x$format, "msa-canvas")) {
    if (!identical(as.numeric(x$version), 1)) stop("Only wire format version 1 is supported.", call. = FALSE)
    doc <- x
    doc$alignment$rows <- check_rows(doc$alignment$rows)
  } else {
    default <- NULL
    if (is.character(x) && is.null(names(x)) && length(x) == 1) {
      if (!file.exists(x)) stop(sprintf("Cannot read %s.", x), call. = FALSE)
      read <- read_rows(x)
      rows <- read$rows
      default <- read$name
    } else if (is.character(x) && !is.null(names(x))) {
      rows <- unname(Map(function(name, sequence) list(name = name, sequence = sequence), names(x), unname(x)))
    } else if (is.list(x)) {
      rows <- unname(x)
    } else {
      stop("x must be a file path, a named character vector, a list of rows or a wire document.", call. = FALSE)
    }
    doc <- list(format = "msa-canvas", version = 1L, alignment = list(rows = check_rows(rows)))
    doc$alignment$name <- default
  }
  if (!is.null(name)) doc$alignment$name <- name
  if (!is.null(alphabet)) doc$alignment$alphabet <- match.arg(alphabet, c("protein", "dna", "rna"))
  if (!is.null(annotations)) {
    doc$annotations <- lapply(unname(annotations), function(a) {
      if (!is.null(a$consequence)) a$consequence <- I(as.character(a$consequence))
      a
    })
  }
  if (!is.null(tree)) doc$tree <- paste(tree, collapse = "")
  if (length(config)) doc$config <- json_part(config)
  if (length(state)) doc$state <- json_part(state)
  doc
}

wire_json <- function(doc) as.character(jsonlite::toJSON(doc, auto_unbox = TRUE, null = "null", digits = NA))

#' Write a standalone HTML page
#'
#' Fills the HTML template of the npm package: one page with the viewer, its styles and
#' the alignment inside, which loads no file from the network. No htmlwidgets needed.
#'
#' @param x,... Passed to [msa_wire()].
#' @param file Output path. When NULL the page is only returned.
#' @return The page as one string, invisibly when `file` is given.
#' @export
msa_html <- function(x, file = NULL, ...) {
  path <- system.file("template", "template.html", package = "msacanvas")
  if (!nzchar(path)) stop("The HTML template is missing. Run \"npm run build\" and \"npm run sync:bindings\" before installing.", call. = FALSE)
  template <- readChar(path, file.size(path), useBytes = TRUE)
  Encoding(template) <- "UTF-8"
  parts <- strsplit(template, "{{MSA_PAYLOAD_JSON}}", fixed = TRUE)[[1]]
  if (length(parts) != 2) stop("The template must contain {{MSA_PAYLOAD_JSON}} exactly once.", call. = FALSE)
  # Escape rule of the template: every < becomes \u003c, so </script> and <!-- cannot occur.
  json <- paste(strsplit(enc2utf8(wire_json(msa_wire(x, ...))), "<", fixed = TRUE)[[1]], collapse = "\\u003c")
  page <- paste0(parts[1], json, parts[2])
  if (is.null(file)) return(page)
  writeLines(page, file, sep = "", useBytes = TRUE)
  invisible(page)
}

#' Alignment viewer widget
#'
#' Shows an alignment in the RStudio viewer, R Markdown, Quarto or Shiny. In Shiny the
#' selection arrives as `input$<outputId>_selection` (a list with `start`, `end` and
#' optionally `rowId`, or NULL), the view state as the JSON string
#' `input$<outputId>_state`, and browser-side errors as `input$<outputId>_error`.
#'
#' @inheritParams msa_wire
#' @param width,height Widget size. The viewer height is the widget height, held between
#'   360 and 2000 pixels, unless `config$height` is set.
#' @param elementId Optional element id.
#' @export
msacanvas <- function(x, config = list(), state = NULL, tree = NULL, annotations = NULL, name = NULL, alphabet = NULL,
                      width = NULL, height = NULL, elementId = NULL) {
  doc <- msa_wire(x, name = name, alphabet = alphabet, annotations = annotations, tree = tree, config = config, state = state)
  htmlwidgets::createWidget(
    name = "msacanvas", x = list(wire = wire_json(doc)), width = width, height = height, package = "msacanvas", elementId = elementId,
    sizingPolicy = htmlwidgets::sizingPolicy(defaultWidth = "100%", defaultHeight = 650, padding = 0, browser.fill = TRUE, knitr.figure = FALSE)
  )
}

#' Shiny bindings for msacanvas
#'
#' @param outputId Output variable to read from.
#' @param width,height CSS sizes.
#' @param expr An expression that returns a `msacanvas()` widget.
#' @param env The environment in which to evaluate `expr`.
#' @param quoted Is `expr` a quoted expression?
#' @name msacanvas-shiny
#' @export
msacanvasOutput <- function(outputId, width = "100%", height = "650px") {
  htmlwidgets::shinyWidgetOutput(outputId, "msacanvas", width, height, package = "msacanvas")
}

#' @rdname msacanvas-shiny
#' @export
renderMsacanvas <- function(expr, env = parent.frame(), quoted = FALSE) {
  if (!quoted) expr <- substitute(expr)
  htmlwidgets::shinyRenderWidget(expr, msacanvasOutput, env, quoted = TRUE)
}
