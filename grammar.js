/**
 * tree-sitter grammar for kaikai
 *
 * kaikai is a statically-typed functional language with algebraic
 * effects and Elixir-style pipelines. The grammar tracks the surface
 * syntax accepted by stage2/compiler/parse.kai in the lnds/kaikai repo.
 */

const PREC = {
  // Lower number = lower precedence.
  range:    1,   // ..   (list and index ranges only)
  pipe:     2,   // |>  |  ||  |?  |!
  lambda:   3,   // x => body  (the body stops before a pipe)
  or:       4,   // or
  and:      5,   // and
  compare:  6,   // == != < <= > >=
  coalesce: 7,   // ??
  concat:   8,   // ++
  add:      9,   // + -
  mul:      10,  // * / %
  unary:    11,  // - not @ & (prefix)
  power:    12,  // ^
  postfix:  13,  // f(x), x.f, x[i], x!
};

module.exports = grammar({
  name: 'kaikai',

  extras: $ => [
    /[ \t\r\n]/,
    $.line_comment,
  ],

  word: $ => $.lower_identifier,

  conflicts: $ => [
    [$.parameter, $.identifier],
    [$.bind_pattern, $.narrow_pattern],
  ],

  // Inlined so `m.Ctor.f` can shift the second dot before deciding
  // whether `m.Ctor` is a value or a longer qualified name.
  inline: $ => [$._primary_rest],

  // Newlines are whitespace here, but kaikai gives them meaning in a
  // few places. The scanner recovers exactly those: which `{` opens a
  // body, a trailing block or a block lambda, and whether a `-` leads
  // its line.
  externals: $ => [
    $._body_brace,
    $._trailing_brace,
    $._trailing_lambda_brace,
    $._lambda_brace,
    $._line_minus,
    $._error_sentinel,
  ],

  rules: {
    source_file: $ => repeat($._top_level),

    _top_level: $ => choice(
      $.import_declaration,
      $.use_declaration,
      $.function_declaration,
      $.extern_declaration,
      $.const_declaration,
      $.type_declaration,
      $.effect_declaration,
      $.protocol_declaration,
      $.impl_declaration,
      $.unit_declaration,
      $.test_declaration,
      $.bench_declaration,
      $.check_declaration,
      $.theory_declaration,
      $.kind_declaration,
      $.axiom_declaration,
      $.attribute,
    ),

    // `extern "C"("sym") pub fn f(x: I32) : I32 / Ffi`, plus the foreign
    // type heads `extern "C" type P = { ... }` and `extern "C" opaque H`.
    extern_declaration: $ => seq(
      'extern',
      field('abi', $.string_literal),
      choice(
        seq(
          optional(seq('(', field('symbol', $.string_literal), ')')),
          optional('pub'),
          'fn',
          field('name', $.lower_identifier),
          optional(field('type_parameters', $.type_parameters)),
          field('parameters', $.parameters),
          ':',
          field('return_type', $._type),
          optional(field('row', $.effect_row)),
        ),
        seq(optional('pub'), 'type', field('name', $.type_identifier), '=', field('body', $.record_type)),
        seq(optional('pub'), 'opaque', field('name', $.type_identifier)),
      ),
    ),

    // `pub` exports a declaration; `pub(pkg)` exports it to its own
    // package's modules alone.
    _visibility: $ => seq('pub', optional(seq('(', 'pkg', ')'))),

    // ---------------------------------------------------------------
    // Comments
    // ---------------------------------------------------------------
    // `#[` opens an attribute, so a comment is `#` followed by anything else.
    line_comment: $ => token(seq('#', /[^\[\n][^\n]*|/)),

    // ---------------------------------------------------------------
    // Attributes
    // ---------------------------------------------------------------
    // `#[name]`, `#[name(args)]`. Unknown attribute names parse cleanly —
    // the compiler drops them for forward compatibility.
    attribute: $ => seq(
      '#[',
      field('name', $.lower_identifier),
      optional(seq(
        '(',
        optional(sepBy1(',', field('argument', $._attribute_argument))),
        ')',
      )),
      ']',
    ),

    // Attribute strings are taken verbatim: no escapes, no `#{}`.
    _attribute_argument: $ => choice(
      alias($._raw_string, $.string_literal),
      alias($._raw_triple_string, $.triple_string_literal),
      $.type_identifier,
      $.lower_identifier,
      $.qualified_type,
      $.attribute_pair,
    ),

    _raw_string: $ => token(seq('"', /([^"\\\n]|\\.)*/, '"')),

    _raw_triple_string: $ => token(seq('"""', /([^"]|"[^"]|""[^"])*/, '"""')),

    // `rename = "wire"`, `default = 0`.
    attribute_pair: $ => seq(
      field('key', $.lower_identifier),
      '=',
      field('value', $._expression),
    ),

    // ---------------------------------------------------------------
    // Imports
    // ---------------------------------------------------------------
    import_declaration: $ => seq(
      'import',
      choice(
        seq(
          field('path', $.module_path),
          optional(choice(
            seq('as', field('alias', choice($.lower_identifier, $.type_identifier))),
            seq($._dot_brace, sepBy1(',', field('name', $.use_name)), '}'),
          )),
        ),
        // `import ?name` — ask the compiler which module exports `name`.
        field('path', $.hole_expression),
      ),
    ),

    // One token, so module_path cannot claim the dot on its own.
    _dot_brace: $ => token('.{'),

    // `use Effect` opens an effect's operations; `use kind K` opens a
    // kind's habitants. Legal at file scope and inside a block.
    use_declaration: $ => seq(
      'use',
      optional('kind'),
      field('path', $.module_path),
    ),

    use_name: $ => choice(
      $.lower_identifier,
      $.type_identifier,
    ),

    module_path: $ => prec.left(sepBy1('.', choice($.lower_identifier, $.type_identifier))),

    // ---------------------------------------------------------------
    // Function declarations
    // ---------------------------------------------------------------
    function_declaration: $ => seq(
      optional($._visibility),
      'fn',
      field('name', $.lower_identifier),
      optional(field('type_parameters', $.type_parameters)),
      field('parameters', $.parameters),
      optional(seq(':', field('return_type', $._type))),
      optional(field('row', $.effect_row)),
      choice(
        field('body', choice(
          seq('=', $._expression),
          $.case_block,
          $.block,
        )),
        // After a contract the `{` opens the body; it is never the
        // predicate's trailing block.
        seq(
          repeat1(field('contract', $.contract_clause)),
          field('body', choice(
            seq('=', $._expression),
            alias($._body_case_block, $.case_block),
            alias($._body_block, $.block),
          )),
        ),
      ),
    ),

    contract_clause: $ => seq(
      choice('requires', 'ensures'),
      field('predicate', $._expression),
    ),

    case_block: $ => seq(
      '{',
      repeat1($.case_arm),
      '}',
    ),

    _body_case_block: $ => seq(
      alias($._body_brace, '{'),
      repeat1($.case_arm),
      '}',
    ),

    case_arm: $ => prec.right(seq(
      'case',
      field('pattern', sepBy1(',', $._pattern)),
      optional(seq('when', field('guard', $._expression))),
      '->',
      field('body', $._expression),
      optional(';'),
    )),

    type_parameters: $ => seq(
      '[',
      sepBy1(',', $.type_parameter),
      ']',
    ),

    // `a`, `u: Measure`, `T: Show + Eq`.
    type_parameter: $ => seq(
      $._type_param_name,
      optional(seq(':', sepBy1('+', choice($.type_identifier, $.qualified_type)))),
    ),

    _type_param_name: $ => choice($.lower_identifier, $.type_identifier),

    parameters: $ => seq(
      '(',
      optional(seq(sepBy1(',', $.parameter), optional(','))),
      ')',
    ),

    // A leading `^` borrows the argument. A name without a type shares
    // the next annotated one: `fn f(a, b: Int)`.
    parameter: $ => seq(
      optional('^'),
      field('name', $.lower_identifier),
      optional(seq(':', field('type', $._type))),
    ),

    // ---------------------------------------------------------------
    // const / type / effect / protocol / impl / unit / test / axiom
    // ---------------------------------------------------------------
    const_declaration: $ => seq(
      optional($._visibility),
      'const',
      field('name', choice($.lower_identifier, $.type_identifier)),
      optional(seq(':', field('type', $._type))),
      '=',
      field('value', $._expression),
    ),

    type_declaration: $ => seq(
      optional($._visibility),
      'type',
      field('name', $.type_identifier),
      optional(field('type_parameters', $.type_parameters)),
      optional(field('habitant_slots', $.habitant_slots)),
      '=',
      field('body', $._type_body),
    ),

    // `type Matrix[t]<m: Dim, n: Dim> = ...`
    habitant_slots: $ => seq(
      '<',
      sepBy1(',', $.habitant_slot),
      '>',
    ),

    habitant_slot: $ => seq(
      field('name', $.lower_identifier),
      ':',
      field('kind', $.type_identifier),
    ),

    _type_body: $ => choice(
      $.effect_sum,
      $.sum_type,
      prec(2, $.record_type),
      $._type,
    ),

    // A single-variant sum (`type CharRange = CR(Char, Char)`) is a sum
    // too — the payload parentheses are what set it apart from an alias.
    sum_type: $ => prec.right(choice(
      seq(optional('|'), $.variant, repeat1(seq('|', $.variant))),
      seq('|', $.variant),
      prec(3, seq(field('name', $.type_identifier), field('payload', $.variant_payload))),
    )),

    // `type Console = Stdout + Stderr + Stdin` — an effect-set alias.
    // Also a compound row passed as a type argument: `Stream[Int, Fail + r]`.
    effect_sum: $ => prec.left(seq(
      $._row_label,
      repeat1(seq('+', $._row_label)),
    )),

    _row_label: $ => choice(
      $.generic_type,
      $.qualified_type,
      $.type_identifier,
      $.lower_identifier,
      $.type_hole,
    ),

    // A member of a union may be a type from another module: `A | m.B`.
    variant: $ => seq(
      field('name', choice($.type_identifier, $.qualified_type)),
      optional(field('payload', $.variant_payload)),
    ),

    variant_payload: $ => choice(
      seq('(', $._type, repeat(seq(',', $._type)), optional(','), ')'),
      $.record_type,
    ),

    record_type: $ => seq(
      '{',
      optional(sepBy1(',', $.record_type_field)),
      optional(','),
      '}',
    ),

    record_type_field: $ => seq(
      repeat($.attribute),
      optional('priv'),
      field('name', $.lower_identifier),
      ':',
      field('type', $._type),
    ),

    effect_declaration: $ => seq(
      optional($._visibility),
      'effect',
      field('name', $.type_identifier),
      optional(field('type_parameters', $.type_parameters)),
      '{',
      repeat($.effect_operation),
      optional($.default_block),
      '}',
    ),

    effect_operation: $ => seq(
      field('name', $.lower_identifier),
      optional(field('type_parameters', $.type_parameters)),
      $.parameters,
      ':',
      field('return_type', $._type),
      optional(field('row', $.effect_row)),
    ),

    // `default { op(args, resume) -> expr, ... }` — the effect's
    // built-in handler. `default` is not a keyword.
    default_block: $ => seq(
      'default',
      '{',
      repeat($.default_clause),
      '}',
    ),

    default_clause: $ => seq(
      field('operation', choice($.lower_identifier, 'return')),
      '(',
      optional(sepBy1(',', field('parameter', $.lower_identifier))),
      ')',
      '->',
      field('body', $._expression),
    ),

    // `protocol Sequence[s: Shape] : Functorial { ... }` — the optional
    // theory after the colon names the laws the protocol obeys.
    protocol_declaration: $ => seq(
      optional($._visibility),
      'protocol',
      field('name', $.type_identifier),
      optional(field('type_parameters', $.type_parameters)),
      optional(seq(':', field('theory', $.type_identifier))),
      '{',
      repeat($._protocol_member),
      '}',
    ),

    _protocol_member: $ => choice(
      $.protocol_signature,
      $.function_declaration,
    ),

    protocol_signature: $ => seq(
      optional('fn'),
      field('name', $.lower_identifier),
      optional(field('type_parameters', $.type_parameters)),
      field('parameters', $.parameters),
      ':',
      field('return_type', $._type),
      optional(field('row', $.effect_row)),
    ),

    impl_declaration: $ => seq(
      optional($._visibility),
      'impl',
      optional(field('type_parameters', $.type_parameters)),
      field('protocol', choice($.type_identifier, $.qualified_type)),
      optional(seq('[', sepBy1(',', $._type), ']')),
      'for',
      field('target', $._type),
      '{',
      repeat($.function_declaration),
      '}',
    ),

    // Habitant introducers: `unit m`, `currency USD`, or the word a
    // `kind ... with <word>` declared (`metric m`, `cur USD`). Every
    // introducer but `unit` is an ordinary identifier elsewhere.
    unit_declaration: $ => seq(
      optional($._visibility),
      field('introducer', choice('unit', $.lower_identifier)),
      field('name', choice($.lower_identifier, $.type_identifier)),
      optional(seq('=', field('alias', $._unit_expr))),
    ),

    test_declaration: $ => seq(
      'test',
      field('label', $.string_literal),
      field('body', $.block),
    ),

    bench_declaration: $ => seq(
      'bench',
      field('label', $.string_literal),
      field('body', $.block),
    ),

    check_declaration: $ => seq(
      'check',
      field('label', $.string_literal),
      optional(seq('with', sepBy1(',', field('parameter', $.parameter)))),
      field('body', $.block),
    ),

    // `kind Name : Theory [over Domain] [with <introducer>]`. `kind`,
    // `over` and the introducer word are contextual, not reserved.
    kind_declaration: $ => seq(
      optional($._visibility),
      'kind',
      field('name', $.type_identifier),
      ':',
      field('theory', $.type_identifier),
      optional(seq('over', field('domain', $.type_identifier))),
      optional(seq(
        'with',
        field('introducer', choice($.lower_identifier, $.type_identifier, 'type', 'effect', 'unit')),
        optional(seq('{', repeat($.lower_identifier), '}')),
      )),
    ),

    // A theory is `theory Name = builtin` or `theory Name = { prop, ... }`.
    theory_declaration: $ => seq(
      'theory',
      field('name', $.type_identifier),
      '=',
      field('body', choice(
        'builtin',
        seq('{', sepBy1(',', field('property', $.lower_identifier)), '}'),
      )),
    ),

    // `axiom f[a](x: a) : b` declares a body-less function. `axiom Law`
    // right after an impl asserts that the impl obeys that law.
    axiom_declaration: $ => seq(
      optional($._visibility),
      'axiom',
      choice(
        seq(
          field('name', $.lower_identifier),
          optional(field('type_parameters', $.type_parameters)),
          optional(field('parameters', $.parameters)),
          ':',
          field('type', $._type),
          optional(field('row', $.effect_row)),
        ),
        field('law', $.type_identifier),
      ),
    ),

    // ---------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------
    _type: $ => choice(
      $.function_type,
      $.refined_type,
      $._type_atom,
    ),

    // `Int where >= 0`, `String where matches ~r/.../`. A bare comparison
    // takes `self` as its implicit left operand.
    refined_type: $ => prec.right(seq(
      $._type_atom,
      'where',
      field('predicate', $._refinement_predicate),
    )),

    _refinement_predicate: $ => choice(
      seq($._comparison_operator, $._expression),
      seq('matches', $._expression),
      $._expression,
    ),

    _comparison_operator: $ => choice('==', '!=', '<', '<=', '>', '>='),

    function_type: $ => prec.right(1, seq(
      $.parenthesized_type_list,
      '->',
      $._type,
      optional(field('row', $.effect_row)),
    )),

    // Wins over a tuple or a grouped type when an arrow follows.
    parenthesized_type_list: $ => prec(4, seq(
      '(',
      optional(seq($._type, repeat(seq(',', $._type)), optional(','))),
      ')',
    )),

    _type_atom: $ => choice(
      $.generic_type,
      $.qualified_type,
      $.tuple_type,
      $.parenthesized_type,
      $.type_identifier,
      $.lower_identifier,           // type variable
      $.list_type,
      $.record_type,
      $.dimensioned_type,
      $.type_hole,
    ),

    // `(String, Bool)` — a tuple type. One element in parentheses is
    // a grouped type, not a 1-tuple, so require at least two.
    tuple_type: $ => prec(3, seq(
      '(',
      $._type,
      repeat1(seq(',', $._type)),
      ')',
    )),

    parenthesized_type: $ => prec(3, seq('(', $._type, ')')),

    // `bigint.BigInt` — a type named through its module.
    qualified_type: $ => prec(2, seq(
      $.lower_identifier,
      '.',
      $.type_identifier,
    )),

    // A lowercase head is a type variable of a higher kind: `s[Int]`.
    generic_type: $ => prec(1, seq(
      choice($.type_identifier, $.qualified_type, $.lower_identifier),
      '[',
      sepBy1(',', choice($.effect_sum, $._type)),
      ']',
    )),

    list_type: $ => seq('[', $._type, ']'),

    // `Real<m/s>`, `Money[Decimal]<USD>`, `Matrix[Real]<2, 3>`, `Tree<r>`.
    dimensioned_type: $ => prec(2, seq(
      choice($.type_identifier, $.generic_type, $.qualified_type),
      '<',
      sepBy1(',', $._unit_expr),
      '>',
    )),

    _unit_expr: $ => choice(
      $.unit_atom,
      $.unit_product,
      $.unit_quotient,
      $.unit_power,
      $.unit_join,
      seq('(', $._unit_expr, ')'),
    ),

    // A habitant: a name, `Kind.name`, an integer or a string.
    unit_atom: $ => choice(
      $.type_identifier,
      $.lower_identifier,
      $.integer_literal,
      $.string_literal,
      seq(
        choice($.type_identifier, $.lower_identifier),
        '.',
        choice($.type_identifier, $.lower_identifier),
      ),
    ),

    unit_join: $ => prec.left(1, seq($._unit_expr, '+', $._unit_expr)),
    unit_product: $ => prec.left(2, seq($._unit_expr, '*', $._unit_expr)),
    unit_quotient: $ => prec.left(2, seq($._unit_expr, '/', $._unit_expr)),
    unit_power: $ => prec.left(3, seq($._unit_expr, '^', optional('-'), $.integer_literal)),

    type_hole: $ => choice(
      prec(1, token(seq('?', /[a-z_][A-Za-z0-9_]*/))),
      '?',
    ),

    effect_row: $ => prec.right(seq(
      '/',
      sepBy1('+', $.effect_label),
    )),

    // An uppercase name is an effect, a lowercase one a row variable,
    // and `?e` a row hole.
    effect_label: $ => choice(
      $.generic_type,
      $.qualified_type,
      $.type_identifier,
      $.lower_identifier,
      $.type_hole,
    ),

    // ---------------------------------------------------------------
    // Patterns
    // ---------------------------------------------------------------
    _pattern: $ => choice(
      $.literal_pattern,
      $.range_pattern,
      $.wildcard_pattern,
      $.bind_pattern,
      $.variant_pattern,
      $.record_pattern,
      $.list_pattern,
      $.tuple_pattern,
      $.parenthesized_pattern,
      $.rest_pattern,
      $.as_pattern,
      $.narrow_pattern,
      $.qualified_pattern,
      $.hole_pattern,
    ),

    hole_pattern: $ => choice(
      prec(1, token(seq('?', /[a-z_][A-Za-z0-9_]*/))),
      '?',
    ),

    literal_pattern: $ => choice(
      seq(optional($._minus), $.integer_literal),
      seq(optional($._minus), $.real_literal),
      $.string_literal,
      $.char_literal,
      $.bool_literal,
    ),

    _minus: $ => choice('-', alias($._line_minus, '-')),

    // `0..9`, `'a'..'z'` — both bounds are literals.
    range_pattern: $ => seq(
      field('start', $.literal_pattern),
      '..',
      field('end', $.literal_pattern),
    ),

    wildcard_pattern: $ => '_',

    bind_pattern: $ => $.lower_identifier,

    variant_pattern: $ => seq(
      field('name', $.type_identifier),
      optional(seq('(', optional(sepBy1(',', $._pattern)), optional(','), ')')),
    ),

    qualified_pattern: $ => seq(
      $.lower_identifier,
      '.',
      $.type_identifier,
      optional(seq('(', optional(sepBy1(',', $._pattern)), optional(','), ')')),
    ),

    // `{ x, y }`, `Point { x: a, y: _ }`, `geo.Point { x }`.
    record_pattern: $ => seq(
      optional(field('type', choice($.type_identifier, $.qualified_type))),
      '{',
      optional(sepBy1(',', $.record_pattern_field)),
      optional(','),
      '}',
    ),

    record_pattern_field: $ => seq(
      field('name', $.lower_identifier),
      optional(seq(':', field('pattern', $._pattern))),
    ),

    list_pattern: $ => seq(
      '[',
      optional(sepBy1(',', $._pattern)),
      optional(','),
      ']',
    ),

    tuple_pattern: $ => seq(
      '(',
      $._pattern,
      ',',
      sepBy1(',', $._pattern),
      optional(','),
      ')',
    ),

    parenthesized_pattern: $ => seq('(', $._pattern, ')'),

    // `...`, `..._` and `...rest`.
    rest_pattern: $ => seq('...', optional(choice($.lower_identifier, '_'))),

    // `whole as [h, ...t]` binds the scrutinee and destructures it.
    // `@` is the older spelling of `as`.
    as_pattern: $ => prec.right(seq(
      field('name', $.lower_identifier),
      choice('as', '@'),
      field('pattern', $._pattern),
    )),

    // `p : Port` narrows the scrutinee to a type.
    narrow_pattern: $ => prec.dynamic(-1, seq(
      $.lower_identifier,
      ':',
      $._type,
    )),

    // ---------------------------------------------------------------
    // Expressions
    // ---------------------------------------------------------------
    _expression: $ => choice(
      $.lambda_expression,
      $._binary_expression,
      $._unary_expression,
      $._primary_expression,
    ),

    // The `{` after the condition always opens the body: a trailing
    // block or a record literal cannot end a condition.
    if_expression: $ => prec.right(seq(
      'if',
      field('condition', $._expression),
      field('then', alias($._body_block, $.block)),
      optional(seq('else', field('else', choice($.if_expression, $.block)))),
    )),

    _body_block: $ => seq(
      alias($._body_brace, '{'),
      repeat($._block_item),
      '}',
    ),

    // `match a, b { P, Q -> ... }` — several scrutinees, matched
    // position by position against a comma-separated pattern list.
    match_expression: $ => seq(
      'match',
      sepBy1(',', field('scrutinee', $._expression)),
      alias($._body_brace, '{'),
      repeat1($.match_arm),
      '}',
    ),

    match_arm: $ => prec.right(seq(
      sepBy1(',', field('pattern', $._pattern)),
      optional(seq('if', field('guard', $._expression))),
      '->',
      field('body', $._expression),
      optional(';'),
    )),

    // `handle { body } with State[Int](0) as cell { clauses }`
    handle_expression: $ => seq(
      'handle',
      field('body', $.block),
      'with',
      field('effect', choice($.generic_type, $.type_identifier, $.qualified_type)),
      optional(field('arguments', $.arguments)),
      optional(seq('as', field('alias', $.lower_identifier))),
      '{',
      repeat($.let_statement),
      repeat(choice($.handle_clause, $.lifecycle_clause)),
      '}',
    ),

    // An operation may be called `initially` or `finally`; only a
    // `{` right after the word makes it a lifecycle clause.
    handle_clause: $ => seq(
      field('name', choice(
        $.lower_identifier,
        'return',
        alias(choice('initially', 'finally'), $.lower_identifier),
      )),
      '(',
      optional(seq(sepBy1(',', $._clause_parameter), optional(','))),
      ')',
      '->',
      field('body', $._expression),
    ),

    _clause_parameter: $ => choice(
      $.lower_identifier,
      alias($._typed_clause_parameter, $.parameter),
    ),

    _typed_clause_parameter: $ => seq(
      field('name', $.lower_identifier),
      ':',
      field('type', $._type),
    ),

    // `initially { ... }` runs when the handler is installed and
    // `finally { ... }` when its body leaves, however it leaves.
    lifecycle_clause: $ => seq(
      field('name', choice('initially', 'finally')),
      field('body', $.block),
    ),

    lambda_expression: $ => prec.right(PREC.lambda, seq(
      choice(
        $.lambda_params,
        $.lower_identifier,
      ),
      '=>',
      field('body', $._expression),
    )),

    lambda_params: $ => seq(
      '(',
      optional(seq(sepBy1(',', $.parameter), optional(','))),
      ')',
    ),

    // `{ n -> body }`, `{ a, b -> body }`, `{ (a, b) -> body }` and the
    // zero-argument `{ -> body }`.
    block_lambda: $ => seq(
      alias($._lambda_brace, '{'),
      optional($._block_lambda_params),
      '->',
      repeat($._block_item),
      '}',
    ),

    _block_lambda_params: $ => choice(
      sepBy1(',', field('parameter', $.lower_identifier)),
      field('pattern', choice($.tuple_pattern, $.parenthesized_pattern)),
    ),

    block: $ => seq(
      '{',
      repeat($._block_item),
      '}',
    ),

    _block_item: $ => seq(
      choice(
        $.let_statement,
        $.assert_statement,
        $.assignment_statement,
        $.use_declaration,
        $._expression,
      ),
      optional(';'),
    ),

    // `let pattern = value` binds; `var name := value` declares a cell.
    let_statement: $ => seq(
      choice('let', 'var'),
      field('pattern', $._pattern),
      optional(seq(':', field('type', $._type))),
      choice('=', ':='),
      field('value', $._expression),
    ),

    assert_statement: $ => prec.right(seq(
      'assert',
      $._expression,
      optional(seq(',', field('message', $._expression))),
    )),

    assignment_statement: $ => seq(
      field('target', $._expression),
      ':=',
      field('value', $._expression),
    ),

    // Binary expressions ---------------------------------------------
    _binary_expression: $ => choice(
      $.pipe_expression,
      $.logical_expression,
      $.comparison_expression,
      $.range_expression,
      $.coalesce_expression,
      $.concat_expression,
      $.arithmetic_expression,
      $.power_expression,
    ),

    pipe_expression: $ => prec.left(PREC.pipe, seq(
      field('left', $._expression),
      field('operator', choice('|>', '|', '||', '|?', '|!')),
      field('right', $._expression),
    )),

    logical_expression: $ => choice(
      prec.left(PREC.or,  seq(field('left', $._expression), field('operator', 'or'),  field('right', $._expression))),
      prec.left(PREC.and, seq(field('left', $._expression), field('operator', 'and'), field('right', $._expression))),
    ),

    comparison_expression: $ => prec.left(PREC.compare, seq(
      field('left', $._expression),
      field('operator', choice('==', '!=', '<', '<=', '>', '>=')),
      field('right', $._expression),
    )),

    range_expression: $ => prec.left(PREC.range, seq(
      field('start', $._expression),
      field('operator', '..'),
      field('end', $._expression),
    )),

    // `opt ?? default` unwraps an Option; it groups to the right.
    coalesce_expression: $ => prec.right(PREC.coalesce, seq(
      field('left', $._expression),
      field('operator', '??'),
      field('right', $._expression),
    )),

    concat_expression: $ => prec.right(PREC.concat, seq(
      field('left', $._expression),
      field('operator', '++'),
      field('right', $._expression),
    )),

    arithmetic_expression: $ => choice(
      prec.left(PREC.add, seq(field('left', $._expression), field('operator', choice('+', '-')), field('right', $._expression))),
      prec.left(PREC.mul, seq(field('left', $._expression), field('operator', choice('*', '/', '%')), field('right', $._expression))),
    ),

    power_expression: $ => prec.right(PREC.power, seq(
      field('left', $._expression),
      field('operator', '^'),
      field('right', $._expression),
    )),

    // Unary expressions ----------------------------------------------
    _unary_expression: $ => choice(
      $.negation_expression,
      $.not_expression,
      $.deref_expression,
      $.borrow_expression,
    ),

    negation_expression: $ => prec(PREC.unary, seq($._minus, $._expression)),
    not_expression: $ => prec(PREC.unary, seq('not', $._expression)),
    deref_expression: $ => prec(PREC.unary, seq('@', $._expression)),
    borrow_expression: $ => prec(PREC.unary, seq('&', $._expression)),

    // Primary expressions --------------------------------------------
    _primary_expression: $ => choice(
      $.identifier,
      $._primary_rest,
    ),

    // Everything but a bare identifier, which `x.f` and `m.Ctor` must
    // both be able to start from without committing.
    _primary_rest: $ => choice(
      $.qualified_constructor,
      $.constructor,
      $.call_expression,
      $.block_call,
      $.index_expression,
      $.field_expression,
      $.try_expression,
      $.qualified_identifier,
      $.literal,
      $.unit_expression,
      $.list_expression,
      $.lazy_expression,
      $.map_expression,
      $.set_expression,
      $.tuple_expression,
      $.record_expression,
      $.parenthesized_expression,
      $.hole_expression,
      $.intrinsic_expression,
      $.todo_expression,
      $.ensure_expression,
      $.placeholder,
      $.section_expression,
      $.if_expression,
      $.match_expression,
      $.handle_expression,
      $.block_lambda,
      $.block,
    ),

    // `$extern_handler("sym")` — compiler intrinsic.
    intrinsic_expression: $ => seq(
      '$',
      field('name', $.lower_identifier),
      '(',
      optional(sepBy1(',', $._expression)),
      ')',
    ),

    // `todo!("message")` — typechecks as anything, traps when reached.
    todo_expression: $ => seq('todo!', $.arguments),

    // `ensure(value) where pred` — narrow into a refined type.
    ensure_expression: $ => prec.right(seq(
      field('value', $.call_expression),
      'where',
      field('predicate', $._refinement_predicate),
    )),

    // `f(. + 10)` stands for `f((x) => x + 10)`.
    placeholder: $ => '.',

    // `xs | .length` stands for `xs | ((x) => x.length)`.
    section_expression: $ => prec(PREC.postfix, seq(
      '.',
      field('field', $.lower_identifier),
    )),

    unit_expression: $ => prec(2, seq('(', ')')),

    // The `(` sits right after the callee: on a new line it would open
    // a tuple or a lambda instead.
    call_expression: $ => prec.right(PREC.postfix, seq(
      field('function', $._primary_expression),
      field('arguments', $.arguments),
      optional($._trailing_blocks),
    )),

    // At most two, both on the callee's line.
    _trailing_blocks: $ => prec.right(seq(
      field('trailing_block', $.trailing_block),
      optional(field('trailing_block', $.trailing_block)),
    )),

    // `f(x) { a, b -> ... }`, `f(x) { ... }`. The brace stays on the
    // callee's line, which is what tells it from a new block.
    trailing_block: $ => choice(
      seq(
        alias($._trailing_lambda_brace, '{'),
        optional($._block_lambda_params),
        '->',
        repeat($._block_item),
        '}',
      ),
      seq(
        alias($._trailing_brace, '{'),
        repeat($._block_item),
        '}',
      ),
    ),

    // A callee with no argument list: `nursery { n -> ... }`. A `{`
    // after a type name opens a record literal instead.
    block_call: $ => prec.right(PREC.postfix, seq(
      field('function', choice(
        $.identifier,
        $.field_expression,
        $.qualified_identifier,
        $.index_expression,
        $.try_expression,
        $.parenthesized_expression,
        $.section_expression,
      )),
      $._trailing_blocks,
    )),

    arguments: $ => seq(
      token.immediate('('),
      optional(seq(sepBy1(',', $._expression), optional(','))),
      ')',
    ),

    field_expression: $ => prec.left(PREC.postfix, seq(
      field('value', choice($.identifier, $._primary_rest)),
      '.',
      field('field', $.lower_identifier),
    )),

    index_expression: $ => prec(PREC.postfix, seq(
      field('value', $._primary_expression),
      token.immediate('['),
      field('index', $._expression),
      ']',
    )),

    // `f(x)!` — propagate the empty or error arm of an Option or Result.
    try_expression: $ => prec(PREC.postfix, seq(
      $._primary_expression,
      token.immediate('!'),
    )),

    // `Stdout.print` — an effect operation named through its effect.
    qualified_identifier: $ => prec(PREC.postfix, seq(
      $.type_identifier,
      '.',
      $.lower_identifier,
    )),

    // `shapes.Red` — a constructor or constant named through its module.
    qualified_constructor: $ => prec(PREC.postfix, seq(
      choice($.identifier, $.qualified_constructor),
      '.',
      $.type_identifier,
    )),

    identifier: $ => $.lower_identifier,

    constructor: $ => $.type_identifier,

    list_expression: $ => seq(
      '[',
      optional(seq(
        sepBy1(',', choice($._expression, $.spread_expression)),
        optional(','),
      )),
      ']',
    ),

    // `lazy [1, 2, ...rest]`, `lazy [0..]`, `lazy [0, 5..]` build a Seq;
    // only a lazy literal may leave a range open.
    lazy_expression: $ => seq(
      'lazy',
      '[',
      optional(seq(
        sepBy1(',', choice($._expression, $.spread_expression, $.open_range_expression)),
        optional(','),
      )),
      ']',
    ),

    open_range_expression: $ => prec(PREC.range, seq(
      field('start', $._expression),
      field('operator', '..'),
    )),

    // `%{ "a": 1, ...base }`
    map_expression: $ => seq(
      '%{',
      optional(seq(
        sepBy1(',', choice($.map_entry, $.spread_expression, $._expression)),
        optional(','),
      )),
      '}',
    ),

    map_entry: $ => seq(
      field('key', $._expression),
      ':',
      field('value', $._expression),
    ),

    // `%[ 1, 2, ...base ]`
    set_expression: $ => seq(
      '%[',
      optional(seq(
        sepBy1(',', choice($._expression, $.spread_expression)),
        optional(','),
      )),
      ']',
    ),

    spread_expression: $ => seq('...', $._expression),

    tuple_expression: $ => seq(
      '(',
      $._expression,
      ',',
      sepBy1(',', $._expression),
      optional(','),
      ')',
    ),

    // `P { x: 1 }`, the punned `P { x, y }`, the positional `P { 1, 2 }`
    // and the spread `P { ...src, x: 1 }`. A record always names its type.
    record_expression: $ => prec(2, seq(
      field('type', choice($.type_identifier, $.qualified_constructor)),
      '{',
      optional(sepBy1(',', choice($.record_field, $.spread_expression, $._expression))),
      optional(','),
      '}',
    )),

    record_field: $ => choice(
      seq(field('name', $.lower_identifier), ':', field('value', $._expression)),
      prec(1, field('name', $.lower_identifier)),
    ),

    parenthesized_expression: $ => seq('(', $._expression, ')'),

    hole_expression: $ => choice(
      prec(1, token(seq('?', /[a-z_][A-Za-z0-9_]*/))),
      '?',
    ),

    // ---------------------------------------------------------------
    // Literals
    // ---------------------------------------------------------------
    literal: $ => choice(
      $.integer_literal,
      $.real_literal,
      $.string_literal,
      $.triple_string_literal,
      $.char_literal,
      $.bool_literal,
      $.dimensioned_literal,
      $.regex_literal,
    ),

    // Decimal, hex and binary, with the optional width/carrier suffixes
    // the lexer accepts (`42i32`, `200u8`, `19d`, `7n`, `3i`).
    integer_literal: $ => token(choice(
      /0[xX][0-9a-fA-F][0-9a-fA-F_]*(i32|u32|u64|i128|u8)?/,
      /0[bB][01][01_]*(i32|u32|u64|i128|u8)?/,
      /\d[\d_]*(i32|u32|u64|i128|u8|d|n|i)?/,
    )),

    real_literal: $ => token(choice(
      /\d[\d_]*\.\d[\d_]*([eE][+-]?\d+)?[di]?/,
      /\d[\d_]*[eE][+-]?\d+[di]?/,
    )),

    // `100<USD>`, `9.8<m/s^2>` — the `<` touches the number.
    dimensioned_literal: $ => prec(2, seq(
      choice($.integer_literal, $.real_literal),
      token.immediate('<'),
      $._unit_expr,
      '>',
    )),

    // `~r/^[a-z]+$/i`
    regex_literal: $ => token(seq(
      '~r/',
      /([^\/\\\n]|\\.)*/,
      '/',
      /[a-zA-Z]*/,
    )),

    bool_literal: $ => choice('true', 'false'),

    char_literal: $ => token(seq(
      "'",
      choice(
        /[^'\\\n]/,
        /\\([\\"'nrtbf0]|x[0-9a-fA-F]{2}|u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4})/,
      ),
      "'",
    )),

    string_literal: $ => seq(
      '"',
      repeat(choice(
        $.string_content,
        $.escape_sequence,
        $.interpolation,
      )),
      token.immediate('"'),
    ),

    triple_string_literal: $ => seq(
      '"""',
      repeat(choice(
        $.triple_string_content,
        $.interpolation,
      )),
      token.immediate(prec(2, '"""')),
    ),

    // A `#` is content unless a `{` follows, which the longer `#{`
    // token claims.
    string_content: $ => choice(
      token.immediate(prec(1, /[^"\\#\n]+/)),
      token.immediate(prec(1, '#')),
    ),

    triple_string_content: $ => choice(
      token.immediate(prec(1, /([^"#\\]|\\(.|\n))+/)),
      token.immediate(prec(1, '#')),
      token.immediate(prec(1, /""?/)),
    ),

    escape_sequence: $ => token.immediate(/\\([\\"'nrtbf0#]|x[0-9a-fA-F]{2}|u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4})/),

    // `#{x}`, or with a format spec after the colon: `#{n:05}`,
    // `#{s:<10}`, `#{r:8.2}`.
    interpolation: $ => seq(
      alias($._interpolation_start, '#{'),
      $._expression,
      optional(seq(':', field('format', $.format_spec))),
      '}',
    ),

    format_spec: $ => token.immediate(prec(1, /[<>^]?[0-9]*(\.[0-9]+)?/)),

    _interpolation_start: $ => token.immediate(prec(2, '#{')),

    // ---------------------------------------------------------------
    // Identifiers (must be at bottom so `word` rule works)
    // ---------------------------------------------------------------
    lower_identifier: $ => /[a-z_][A-Za-z0-9_]*/,

    type_identifier: $ => /[A-Z][A-Za-z0-9_]*/,
  },
});

function sepBy1(sep, rule) {
  return seq(rule, repeat(seq(sep, rule)));
}
