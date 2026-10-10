#include "tree_sitter/parser.h"

// kaikai ends a statement at a newline, and the grammar treats newlines
// as whitespace. This scanner recovers the few decisions that depend on
// them, all of which the compiler makes with one token of context:
//
//  - The `{` after an `if` condition or a `match` scrutinee opens the
//    body. A trailing block or a record literal cannot end either one,
//    so whenever a body may start here, it does.
//  - A `{` on the same line as a callee is that call's trailing block
//    (`spawn { ... }`, `each(xs) { x -> ... }`). On a later line it
//    starts a statement of its own.
//  - A `{` followed by `params ->` is a block lambda.
//  - A `-` that leads a line starts an expression or a pattern; it does
//    not continue the previous line as a subtraction.
enum TokenType {
  BODY_BRACE,
  TRAILING_BRACE,
  TRAILING_LAMBDA_BRACE,
  LAMBDA_BRACE,
  LINE_MINUS,
  ERROR_SENTINEL,
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

// Skips blanks and comments while looking ahead past a token.
static void skip_trivia(TSLexer *lexer) {
  for (;;) {
    int32_t c = lexer->lookahead;
    if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
      lexer->advance(lexer, false);
    } else if (c == '#') {
      while (lexer->lookahead != '\n' && !lexer->eof(lexer)) {
        lexer->advance(lexer, false);
      }
    } else {
      return;
    }
  }
}

static bool at_arrow(TSLexer *lexer) {
  if (lexer->lookahead != '-') return false;
  lexer->advance(lexer, false);
  return lexer->lookahead == '>';
}

// True when what follows an opening brace is a lambda header: `->`,
// `a, b ->` or one parenthesised pattern and `->`.
static bool at_lambda_header(TSLexer *lexer) {
  skip_trivia(lexer);

  if (lexer->lookahead == '-') return at_arrow(lexer);

  if (lexer->lookahead == '(') {
    int depth = 0;
    for (;;) {
      int32_t c = lexer->lookahead;
      if (lexer->eof(lexer) || c == '{' || c == '}' || c == '"') return false;
      if (c == '(') depth++;
      if (c == ')') depth--;
      lexer->advance(lexer, false);
      if (depth == 0) break;
    }
    skip_trivia(lexer);
    return at_arrow(lexer);
  }

  if (!is_ident_start(lexer->lookahead)) return false;
  for (;;) {
    while (is_ident_char(lexer->lookahead)) lexer->advance(lexer, false);
    skip_trivia(lexer);
    if (lexer->lookahead != ',') return at_arrow(lexer);
    lexer->advance(lexer, false);
    skip_trivia(lexer);
    if (!is_ident_start(lexer->lookahead)) return false;
  }
}

bool tree_sitter_kaikai_external_scanner_scan(void *payload, TSLexer *lexer,
                                              const bool *valid_symbols) {
  // Every symbol is valid during error recovery; guessing there only
  // makes the recovery worse.
  if (valid_symbols[ERROR_SENTINEL]) return false;

  bool newline = false;
  for (;;) {
    int32_t c = lexer->lookahead;
    if (c == '\n') newline = true;
    if (c != ' ' && c != '\t' && c != '\n' && c != '\r') break;
    lexer->advance(lexer, true);
  }

  if (lexer->lookahead == '-') {
    if (!newline || !valid_symbols[LINE_MINUS]) return false;
    lexer->advance(lexer, false);
    if (lexer->lookahead == '>') return false;
    lexer->mark_end(lexer);
    lexer->result_symbol = LINE_MINUS;
    return true;
  }

  if (lexer->lookahead != '{') return false;
  lexer->advance(lexer, false);
  lexer->mark_end(lexer);   // the token is the brace and nothing more

  if (valid_symbols[BODY_BRACE]) {
    lexer->result_symbol = BODY_BRACE;
    return true;
  }

  bool lambda = at_lambda_header(lexer);

  if (!newline) {
    if (lambda && valid_symbols[TRAILING_LAMBDA_BRACE]) {
      lexer->result_symbol = TRAILING_LAMBDA_BRACE;
      return true;
    }
    if (!lambda && valid_symbols[TRAILING_BRACE]) {
      lexer->result_symbol = TRAILING_BRACE;
      return true;
    }
  }

  if (lambda && valid_symbols[LAMBDA_BRACE]) {
    lexer->result_symbol = LAMBDA_BRACE;
    return true;
  }

  return false;
}
