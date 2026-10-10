# tree-sitter-kaikai

A [tree-sitter](https://tree-sitter.github.io/) grammar for the
[kaikai](https://github.com/lnds/kaikai) programming language.

kaikai is a statically-typed functional language with algebraic effects
as a primitive and Elixir-style pipelines. This grammar tracks the
surface syntax accepted by `stage2/compiler/parse.kai` in the upstream
repository, as of kaikai 0.139.

## Features

- Full coverage of declarations: `fn`, `const`, `type` (sum/record),
  `effect`, `protocol`, `impl`, `kind`, `theory`, `unit` and
  user-declared habitant introducers, `test`, `bench`, `check`,
  `axiom`, `import`, `use`, `extern "C"` (functions, struct types and
  opaque handles).
- Expressions: `if`, `match`, `handle ... with` (state, alias,
  `initially`/`finally`), lambdas, block lambdas and trailing blocks
  (`spawn { ... }`, `each(xs) { x -> ... }`), pipes (`|>`, `|`, `||`,
  `|?`), lambda placeholders (`f(. + 1)`, `xs | .length`), record,
  list, map (`%{ }`) and set (`%[ ]`) literals, postfix `!`.
- Patterns: literal, range, wildcard, bind, variant, record, list
  with rest, tuple, narrow (`x : T`), `as`-binding, module-qualified
  constructors.
- Type syntax: generics, function arrows, lists, tuples, records,
  refinements (`Int where > 0`), dimensioned types (`Real<USD>`,
  `Real<m/s^2>`), effect rows (`T / Io + Fail`).
- String interpolation `"x=#{expr}"`, triple-quoted strings, char
  literals, regex literals (`~r/.../`), unit-of-measure number
  literals.
- `#[derive(...)]`, `#[doc(...)]` and other attributes.

kaikai ends statements at newlines. The grammar treats newlines as
whitespace and an external scanner (`src/scanner.c`) recovers the
places where they matter: which `{` opens a body, a trailing block or
a block lambda.

## Installation

### nvim-treesitter (custom parser)

Add the parser to your `init.lua`:

```lua
local parser_config = require("nvim-treesitter.parsers").get_parser_configs()

parser_config.kaikai = {
  install_info = {
    url = "https://github.com/kaikailang-org/tree-sitter-kaikai",
    files = { "src/parser.c", "src/scanner.c" },
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

Alpha — parses every well-formed `.kai` file in the upstream
repository (stdlib, compiler, examples and demos) at kaikai 0.139.3.
Naming rules the compiler checks after parsing are applied here while
parsing: an uppercase parameter or record field, or a lowercase effect
name, is a syntax error.

## License

MIT.
