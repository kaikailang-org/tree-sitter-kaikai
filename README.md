# tree-sitter-kaikai

A [tree-sitter](https://tree-sitter.github.io/) grammar for the
[kaikai](https://github.com/lnds/kaikai) programming language.

kaikai is a statically-typed functional language with algebraic effects
as a primitive and Elixir-style pipelines. This grammar tracks the
surface syntax accepted by `stage2/compiler.kai` in the upstream
repository.

## Features

- Full coverage of declarations: `fn`, `const`, `type` (sum/record),
  `effect`, `protocol`, `impl`, `unit`, `test`, `axiom`, `import`,
  `use`, `extern`.
- Expressions: `if`, `match`, `let`, `handle ... with`, `for ... in`,
  lambdas, pipes (`|>`, `|`, `||`, `|?`), arithmetic, comparison,
  logical, range, concatenation, ascription.
- Patterns: literal, wildcard, bind, variant, record, list with
  rest, narrow (`x : T`), `as`-binding.
- Type syntax: generics, function arrows, lists, records, dimensioned
  types (`Real<USD>`, `Real<m/s^2>`), effect rows (`T / Io + Fail`).
- String interpolation `"x=#{expr}"`, triple-quoted strings, char
  literals, unit-of-measure number literals.
- `#derive(...)` attributes.

## Installation

### nvim-treesitter (custom parser)

Add the parser to your `init.lua`:

```lua
local parser_config = require("nvim-treesitter.parsers").get_parser_configs()

parser_config.kaikai = {
  install_info = {
    url = "https://github.com/kaikailang-org/tree-sitter-kaikai",
    files = { "src/parser.c" },
    branch = "main",
    generate_requires_npm = false,
    requires_generate_from_grammar = false,
  },
  filetype = "kai",
}

vim.filetype.add({ extension = { kai = "kaikai" } })
```

Then run `:TSInstall kaikai`.

To pick up the queries (`highlights.scm` etc.), drop them in your
nvim runtime path, e.g.:

```bash
mkdir -p ~/.config/nvim/queries/kaikai
cp queries/*.scm ~/.config/nvim/queries/kaikai/
```

### Helix

```toml
# languages.toml
[[language]]
name = "kaikai"
scope = "source.kaikai"
file-types = ["kai"]
roots = []
comment-token = "#"
indent = { tab-width = 2, unit = "  " }

[[grammar]]
name = "kaikai"
source = { git = "https://github.com/kaikailang-org/tree-sitter-kaikai", rev = "main" }
```

```bash
hx --grammar fetch
hx --grammar build
```

### Building locally

```bash
git clone https://github.com/kaikailang-org/tree-sitter-kaikai
cd tree-sitter-kaikai
npm install
npx tree-sitter generate
npx tree-sitter test
```

Try the parser against the bundled examples:

```bash
npx tree-sitter parse examples/quicksort.kai
```

## Status

Alpha — covers the syntax accepted by the upstream kaikai compiler at
the time of writing. Edge cases around `case`-block multi-clause
function bodies, refinement-type predicates inside patterns, and a few
sugar forms may not parse yet; PRs welcome.

## License

MIT.
