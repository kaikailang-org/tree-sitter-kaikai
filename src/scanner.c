#include "tree_sitter/parser.h"

// Decides whether a `{` opens a call's trailing block.
//
// Three things can follow a callee: a record literal (`{ a: 1 }`), the
// body of an enclosing match/if/for (`match f(x) { P -> ... }`), and the
// call's own trailing block (`nursery { n -> ... }`). Only the last one
// may produce this token.
//
// The shape that identifies a trailing block is narrow: the brace is
// followed either by `ident, ident, ... ->` (its parameter list) or by
// something that cannot open a match arm at all. A match arm's pattern
// is a constructor, a literal, a list or a tuple — never a bare
// identifier list followed by an arrow, because that is what a lambda
// header looks like.
enum TokenType {
  TRAILING_BLOCK_BRACE,
};

void *tree_sitter_kaikai_external_scanner_create(void) { return NULL; }
void tree_sitter_kaikai_external_scanner_destroy(void *p) {}
unsigned tree_sitter_kaikai_external_scanner_serialize(void *p, char *b) { return 0; }
void tree_sitter_kaikai_external_scanner_deserialize(void *p, const char *b, unsigned n) {}

static bool is_ident_start(int32_t c) {
  return (c >= 'a' && c <= 'z') || c == '_';
}

static bool is_ident_char(int32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
         (c >= '0' && c <= '9') || c == '_';
}

static void skip_ws(TSLexer *lexer) {
  for (;;) {
    int32_t c = lexer->lookahead;
    if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
      lexer->advance(lexer, true);
    } else if (c == '#') {
      lexer->advance(lexer, true);
      if (lexer->lookahead == '[') return;   // an attribute, not a comment
      while (lexer->lookahead != '\n' && !lexer->eof(lexer)) {
        lexer->advance(lexer, true);
      }
    } else {
      return;
    }
  }
}

bool tree_sitter_kaikai_external_scanner_scan(void *payload, TSLexer *lexer,
                                              const bool *valid_symbols) {
  if (!valid_symbols[TRAILING_BLOCK_BRACE]) return false;

  skip_ws(lexer);
  if (lexer->lookahead != '{') return false;

  lexer->advance(lexer, false);
  lexer->mark_end(lexer);   // the token is the brace and nothing more

  skip_ws(lexer);

  // Only the parameterised form is claimed here: `{ a, b -> ... }`.
  // A block with no parameters is indistinguishable from a match body
  // by lookahead alone, so it is left to the ordinary `{` rule.
  if (!is_ident_start(lexer->lookahead)) return false;

  for (;;) {
    while (is_ident_char(lexer->lookahead)) lexer->advance(lexer, false);
    skip_ws(lexer);

    if (lexer->lookahead == ',') {
      lexer->advance(lexer, false);
      skip_ws(lexer);
      if (!is_ident_start(lexer->lookahead)) return false;
      continue;
    }

    if (lexer->lookahead == '-') {
      lexer->advance(lexer, false);
      if (lexer->lookahead == '>') {
        lexer->result_symbol = TRAILING_BLOCK_BRACE;
        return true;
      }
    }
    return false;
  }
}
