/**
 * tree-sitter grammar for kaikai
 *
 * kaikai is a statically-typed functional language with algebraic
 * effects and Elixir-style pipelines. The grammar tracks the surface
 * syntax accepted by stage2/compiler.kai in the lnds/kaikai repo.
 */

const PREC = {
  // Lower number = lower precedence.
  pipe:     1,   // |>  |  ||  |?
  or:       2,   // or
  and:      3,   // and
  not:      4,   // not (unary)
  compare:  5,   // == != < <= > >=
  range:    6,   // .. ..=
  concat:   7,   // ++
  add:      8,   // + -
  mul:      9,   // * / %
  power:    10,  // ^
  unary:    11,  // - (prefix)
  ascription: 12, // x : T
  apply:    13,  // f(x), x.f, x.f(y)
  member:   14,  // x.f
  primary:  15,
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
    [$.record_field, $.identifier],
    [$.bind_pattern, $.narrow_pattern],
    [$.block_lambda, $.record_field],
  ],

  externals: $ => [],

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

    extern_declaration: $ => seq(
      optional('pub'),
      'extern',
      field('abi', $.string_literal),
      'fn',
      field('name', $.lower_identifier),
      field('parameters', $.parameters),
      ':',
      field('return_type', $._type),
      optional(field('row', $.effect_row)),
      optional(seq('=', field('symbol', $.string_literal))),
    ),

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
        optional(sepBy1(',', field('argument', choice(
          $.string_literal,
          $.triple_string_literal,
          $.type_identifier,
          $.lower_identifier,
        )))),
        ')',
      )),
      ']',
    ),

    // ---------------------------------------------------------------
    // Imports
    // ---------------------------------------------------------------
    import_declaration: $ => seq(
      'import',
      field('path', $.module_path),
      optional(choice(
        seq('as', field('alias', $.lower_identifier)),
        seq($._dot_brace, sepBy1(',', field('name', $.use_name)), '}'),
      )),
    ),

    // One token, so module_path cannot claim the dot on its own.
    _dot_brace: $ => token('.{'),

    use_declaration: $ => seq(
      'use',
      field('path', $.module_path),
      optional(seq(
        '.',
        '{',
        sepBy1(',', field('name', $.use_name)),
        '}',
      )),
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
      optional('pub'),
      'fn',
      field('name', $.lower_identifier),
      optional(field('type_parameters', $.type_parameters)),
      field('parameters', $.parameters),
      optional(seq(':', field('return_type', $._type))),
      optional(field('row', $.effect_row)),
      optional(seq('where', sepBy1(',', $.where_clause))),
      repeat(field('contract', $.contract_clause)),
      field('body', choice(
        seq('=', $._expression),
        $.case_block,
        $.block,
      )),
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

    case_arm: $ => prec.right(seq(
      'case',
      field('pattern', sepBy1(',', $._pattern)),
      optional(seq('when', field('guard', $._expression))),
      '->',
      field('body', $._expression),
    )),

    type_parameters: $ => seq(
      '[',
      sepBy1(',', $.type_parameter),
      ']',
    ),

    type_parameter: $ => seq(
      $._type_param_name,
      optional(seq(':', sepBy1('+', $.type_identifier))),
    ),

    _type_param_name: $ => choice($.lower_identifier, $.type_identifier),

    parameters: $ => seq(
      '(',
      optional(seq(sepBy1(',', $.parameter), optional(','))),
      ')',
    ),

    parameter: $ => seq(
      optional('^'),
      field('name', $.lower_identifier),
      optional(seq(':', field('type', $._type))),
    ),

    where_clause: $ => seq(
      $.type_identifier,
      ':',
      sepBy1('+', $.type_identifier),
    ),

    // ---------------------------------------------------------------
    // const / type / effect / protocol / impl / unit / test / axiom
    // ---------------------------------------------------------------
    const_declaration: $ => seq(
      optional('pub'),
      'const',
      field('name', choice($.lower_identifier, $.type_identifier)),
      optional(seq(':', field('type', $._type))),
      '=',
      field('value', $._expression),
    ),

    type_declaration: $ => seq(
      optional('pub'),
      'type',
      field('name', $.type_identifier),
      optional(field('type_parameters', $.type_parameters)),
      '=',
      field('body', $._type_body),
    ),

    _type_body: $ => choice(
      $.effect_sum,
      $.sum_type,
      prec(2, $.record_type),
      $.refined_type,
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
    effect_sum: $ => prec.left(seq(
      $.type_identifier,
      repeat1(seq('+', $.type_identifier)),
    )),

    variant: $ => seq(
      field('name', $.type_identifier),
      optional(field('payload', $.variant_payload)),
    ),

    variant_payload: $ => choice(
      seq('(', $._type, repeat(seq(',', $._type)), ')'),
      $.record_type,
    ),

    record_type: $ => seq(
      '{',
      optional(sepBy1(',', $.record_type_field)),
      optional(','),
      '}',
    ),

    record_type_field: $ => seq(
      optional('priv'),
      field('name', $.lower_identifier),
      ':',
      field('type', choice($.refined_type, $._type)),
    ),

    effect_declaration: $ => seq(
      optional('pub'),
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
      field('operation', $.lower_identifier),
      '(',
      optional(sepBy1(',', field('parameter', $.lower_identifier))),
      ')',
      '->',
      field('body', $._expression),
    ),

    protocol_declaration: $ => seq(
      optional('pub'),
      'protocol',
      field('name', $.type_identifier),
      optional(field('type_parameters', $.type_parameters)),
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
      optional('pub'),
      'impl',
      optional(field('type_parameters', $.type_parameters)),
      field('protocol', $.type_identifier),
      optional(seq('[', sepBy1(',', $._type), ']')),
      'for',
      field('target', $._type),
      optional(seq('where', sepBy1(',', $.where_clause))),
      '{',
      repeat($.function_declaration),
      '}',
    ),

    // The unit name is any identifier — `unit m`, not just `unit Metre`.
    // With `=` the unit aliases a measure expression.
    // Habitant introducers, one per kind: `unit m`, `perm read`,
    // `currency USD`, `region r`, `layout l`. Only `unit` takes an alias
    // body. See base_intros() in stage2/compiler/kinds.kai.
    unit_declaration: $ => seq(
      optional('pub'),
      field('introducer', choice('unit', 'currency', 'perm', 'region', 'layout')),
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

    // `kind Name : Theory [over Domain] with <introducer>`. Both `over`
    // and the introducer word are contextual, not reserved.
    kind_declaration: $ => seq(
      optional('pub'),
      'kind',
      field('name', $.type_identifier),
      ':',
      field('theory', $.type_identifier),
      optional(seq('over', field('domain', $.type_identifier))),
      optional(seq(
        'with',
        field('introducer', choice($.lower_identifier, $.type_identifier)),
        optional(seq('{', repeat($.lower_identifier), '}')),
      )),
    ),

    // A theory is `theory Name = builtin` or `theory Name = { prop, ... }`.
    // `pub` is rejected by the compiler.
    theory_declaration: $ => seq(
      'theory',
      field('name', $.type_identifier),
      '=',
      field('body', choice(
        'builtin',
        seq('{', sepBy1(',', field('property', $.lower_identifier)), '}'),
      )),
    ),

    axiom_declaration: $ => seq(
      optional('pub'),
      'axiom',
      field('name', $.lower_identifier),
      ':',
      field('type', $._type),
    ),

    // ---------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------
    _type: $ => choice(
      $.function_type,
      $._type_atom,
    ),

    // `Int where >= 0`, `String where matches ~r/.../`. A bare comparison
    // takes `self` as its implicit left operand. Kept out of `_type` so it
    // does not collide with the `where` clause of `impl ... for T`.
    refined_type: $ => prec.right(seq(
      $._type_atom,
      'where',
      field('predicate', choice(
        seq($._comparison_operator, $._expression),
        $._expression,
      )),
    )),

    _comparison_operator: $ => choice('==', '!=', '<', '<=', '>', '>='),

    function_type: $ => prec.right(1, seq(
      choice($._type_atom, $.parenthesized_type_list),
      '->',
      $._type,
      optional(field('row', $.effect_row)),
    )),

    parenthesized_type_list: $ => seq(
      '(',
      optional(seq($._type, repeat(seq(',', $._type)))),
      ')',
    ),

    _type_atom: $ => choice(
      $.generic_type,
      $.qualified_type,
      $.tuple_type,
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

    // `bigint.BigInt` — a type named through its module.
    qualified_type: $ => prec(2, seq(
      $.lower_identifier,
      '.',
      $.type_identifier,
    )),

    generic_type: $ => prec(1, seq(
      $.type_identifier,
      '[',
      sepBy1(',', choice($.effect_sum, $._type)),
      ']',
    )),

    list_type: $ => seq('[', $._type, ']'),

    dimensioned_type: $ => prec(2, seq(
      choice($.type_identifier, $.generic_type),
      '<',
      sepBy1(',', sepBy1('+', $._unit_expr)),
      '>',
    )),

    _unit_expr: $ => choice(
      $.unit_atom,
      $.unit_product,
      $.unit_quotient,
      $.unit_power,
    ),

    unit_atom: $ => choice($.type_identifier, $.lower_identifier),

    unit_product: $ => prec.left(1, seq($._unit_expr, '*', $._unit_expr)),
    unit_quotient: $ => prec.left(1, seq($._unit_expr, '/', $._unit_expr)),
    unit_power: $ => prec.left(2, seq($._unit_expr, '^', $.integer_literal)),

    type_hole: $ => '?',

    effect_row: $ => prec.right(seq(
      '/',
      sepBy1('+', $.effect_label),
    )),

    effect_label: $ => choice(
      $.generic_type,
      $.type_identifier,
      $.lower_identifier,
    ),

    // ---------------------------------------------------------------
    // Patterns
    // ---------------------------------------------------------------
    _pattern: $ => choice(
      $.literal_pattern,
      $.wildcard_pattern,
      $.bind_pattern,
      $.variant_pattern,
      $.record_pattern,
      $.list_pattern,
      $.tuple_pattern,
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
      $.integer_literal,
      $.real_literal,
      $.string_literal,
      $.char_literal,
      $.bool_literal,
    ),

    wildcard_pattern: $ => '_',

    bind_pattern: $ => $.lower_identifier,

    variant_pattern: $ => seq(
      field('name', $.type_identifier),
      optional(seq(
        '(',
        optional(sepBy1(',', $._pattern)),
        ')',
      )),
    ),

    qualified_pattern: $ => seq(
      $.lower_identifier,
      '.',
      $.type_identifier,
      optional(seq(
        '(',
        optional(sepBy1(',', $._pattern)),
        ')',
      )),
    ),

    record_pattern: $ => seq(
      optional(field('type', $.type_identifier)),
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
      ']',
    ),

    tuple_pattern: $ => seq(
      '(',
      $._pattern,
      ',',
      sepBy1(',', $._pattern),
      ')',
    ),

    rest_pattern: $ => seq('...', optional($.lower_identifier)),

    as_pattern: $ => prec.left(seq(
      $._pattern,
      'as',
      $.lower_identifier,
    )),

    narrow_pattern: $ => prec.left(seq(
      $.lower_identifier,
      ':',
      $._type,
    )),

    // ---------------------------------------------------------------
    // Expressions
    // ---------------------------------------------------------------
    _expression: $ => choice(
      $.if_expression,
      $.match_expression,
      $.let_expression,
      $.handle_expression,
      $.for_expression,
      $.lambda_expression,
      $.block_lambda,
      $.block,
      $._binary_expression,
      $._unary_expression,
      $._primary_expression,
    ),

    if_expression: $ => prec.right(seq(
      'if',
      field('condition', $._expression),
      field('then', $.block),
      optional(seq('else', field('else', choice($.if_expression, $.block)))),
    )),

    // `match a, b { P, Q -> ... }` — several scrutinees, matched
    // position by position against a comma-separated pattern list.
    match_expression: $ => seq(
      'match',
      sepBy1(',', field('scrutinee', $._expression)),
      '{',
      repeat1($.match_arm),
      '}',
    ),

    match_arm: $ => prec.right(seq(
      sepBy1(',', field('pattern', $._pattern)),
      optional(seq('if', field('guard', $._expression))),
      '->',
      field('body', $._expression),
    )),

    let_expression: $ => seq(
      choice('let', 'var'),
      field('pattern', $._pattern),
      optional(seq(':', field('type', $._type))),
      choice('=', ':='),
      field('value', $._expression),
    ),

    handle_expression: $ => seq(
      'handle',
      field('body', $.block),
      'with',
      field('effect', choice($.generic_type, $.type_identifier)),
      optional(field('arguments', $.arguments)),
      '{',
      repeat($.let_statement),
      repeat1($.handle_clause),
      '}',
    ),

    handle_clause: $ => seq(
      field('name', choice($.lower_identifier, 'return')),
      '(',
      optional(sepBy1(',', $.lower_identifier)),
      ')',
      '->',
      field('body', $._expression),
    ),

    for_expression: $ => seq(
      'for',
      field('pattern', $._pattern),
      'in',
      field('iterable', $._expression),
      field('body', $.block),
    ),

    lambda_expression: $ => prec.right(seq(
      choice(
        $.lambda_params,
        $.lower_identifier,
      ),
      '=>',
      field('body', $._expression),
    )),

    lambda_params: $ => seq(
      '(',
      optional(sepBy1(',', $.parameter)),
      ')',
    ),

    // `{ n -> body }`. Ambiguous with a record shorthand (`{ a, b }`)
    // until the `->` shows up, hence the declared conflict.
    block_lambda: $ => seq(
      '{',
      sepBy1(',', field('parameter', $.lower_identifier)),
      '->',
      repeat($._block_item),
      '}',
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
        prec(-1, $._expression),
      ),
      optional(';'),
    ),

    let_statement: $ => prec(1, seq(
      choice('let', 'var'),
      field('pattern', $._pattern),
      optional(seq(':', field('type', $._type))),
      choice('=', ':='),
      field('value', $._expression),
    )),

    assert_statement: $ => seq(
      'assert',
      $._expression,
    ),

    assignment_statement: $ => prec(1, seq(
      field('target', choice($.lower_identifier, $.field_expression, $.index_expression)),
      ':=',
      field('value', $._expression),
    )),

    // Binary expressions ---------------------------------------------
    _binary_expression: $ => choice(
      $.pipe_expression,
      $.logical_expression,
      $.comparison_expression,
      $.range_expression,
      $.concat_expression,
      $.arithmetic_expression,
      $.power_expression,
      $.ascription_expression,
    ),

    pipe_expression: $ => prec.left(PREC.pipe, seq(
      field('left', $._expression),
      field('operator', choice('|>', '|', '||', '|?')),
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
      field('operator', choice('..', '..=')),
      field('end', $._expression),
    )),

    concat_expression: $ => prec.left(PREC.concat, seq(
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

    ascription_expression: $ => prec.left(PREC.ascription, seq(
      field('value', $._expression),
      ':',
      field('type', $._type),
    )),

    // Unary expressions ----------------------------------------------
    _unary_expression: $ => choice(
      $.negation_expression,
      $.not_expression,
      $.deref_expression,
      $.try_expression,
    ),

    // `f(x)!` — propagate the error arm of a Result.
    try_expression: $ => prec(PREC.apply, seq($._primary_expression, '!')),

    negation_expression: $ => prec(PREC.unary, seq('-', $._expression)),
    not_expression: $ => prec(PREC.not, seq('not', $._expression)),
    deref_expression: $ => prec(PREC.unary, seq('@', $._expression)),

    // Primary expressions --------------------------------------------
    _primary_expression: $ => choice(
      $.call_expression,
      $.index_expression,
      $.field_expression,
      $.qualified_identifier,
      $.identifier,
      $.constructor,
      $.literal,
      $.unit_expression,
      $.list_expression,
      $.tuple_expression,
      $.record_expression,
      $.parenthesized_expression,
      $.hole_expression,
      $.intrinsic_expression,
    ),

    // `$extern_handler("sym")` — compiler intrinsic.
    intrinsic_expression: $ => seq(
      '$',
      field('name', $.lower_identifier),
      '(',
      optional(sepBy1(',', $._expression)),
      ')',
    ),

    unit_expression: $ => prec(2, seq('(', ')')),

    call_expression: $ => prec(PREC.apply, seq(
      field('function', $._primary_expression),
      field('arguments', $.arguments),
    )),

    arguments: $ => seq(
      '(',
      optional(seq(sepBy1(',', $._expression), optional(','))),
      ')',
    ),

    field_expression: $ => prec.left(PREC.member, seq(
      field('value', $._primary_expression),
      '.',
      field('field', $.lower_identifier),
    )),

    index_expression: $ => prec(PREC.apply, seq(
      field('value', choice($.identifier, $.field_expression, $.qualified_identifier)),
      token.immediate('['),
      field('index', $._expression),
      ']',
    )),

    qualified_identifier: $ => prec(PREC.member, seq(
      choice($.type_identifier, $.lower_identifier),
      '.',
      $.lower_identifier,
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

    spread_expression: $ => seq('...', $._expression),

    tuple_expression: $ => seq(
      '(',
      $._expression,
      ',',
      sepBy1(',', $._expression),
      ')',
    ),

    record_expression: $ => prec(2, seq(
      optional(field('type', choice($.type_identifier, $.qualified_type))),
      '{',
      sepBy1(',', choice($.record_field, $.spread_expression)),
      optional(','),
      '}',
    )),

    qualified_type: $ => seq(
      $.lower_identifier,
      '.',
      $.type_identifier,
    ),

    record_field: $ => seq(
      field('name', $.lower_identifier),
      optional(seq(':', field('value', $._expression))),
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
    ),

    // Decimal, hex and binary, with the optional width/carrier suffixes
    // the lexer accepts (`42i32`, `200u8`, `19.99d`).
    integer_literal: $ => token(choice(
      /0[xX][0-9a-fA-F][0-9a-fA-F_]*(i32|u32|u64|i128|u8|d)?/,
      /0[bB][01][01_]*(i32|u32|u64|i128|u8|d)?/,
      /\d[\d_]*(i32|u32|u64|i128|u8|d)?/,
    )),

    real_literal: $ => token(choice(
      /\d[\d_]*\.\d[\d_]*([eE][+-]?\d+)?/,
      /\d[\d_]*[eE][+-]?\d+/,
    )),

    dimensioned_literal: $ => prec(2, seq(
      choice($.integer_literal, $.real_literal),
      '<',
      $._unit_expr,
      '>',
    )),

    bool_literal: $ => choice('true', 'false'),

    char_literal: $ => token(seq(
      "'",
      choice(
        /[^'\\\n]/,
        /\\([\\"'nrt0]|u\{[0-9a-fA-F]+\})/,
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
      token.immediate('"""'),
    ),

    string_content: $ => token.immediate(prec(1, /([^"\\#\n]+|#[^{"\\\n])+#?/)),

    triple_string_content: $ => token.immediate(prec(1, /([^"#]|\\.|#[^{"]|"[^"]|""[^"])+/)),

    escape_sequence: $ => token.immediate(/\\([\\"'nrtbf0]|x[0-9a-fA-F]{2}|u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4})/),

    interpolation: $ => seq(
      alias($._interpolation_start, '#{'),
      $._expression,
      '}',
    ),

    _interpolation_start: $ => token.immediate(prec(2, '#{')),

    // ---------------------------------------------------------------
    // Identifiers (must be at bottom so `word` rule works)
    // ---------------------------------------------------------------
    lower_identifier: $ => /[a-z_][A-Za-z0-9_]*[!?]?/,

    type_identifier: $ => /[A-Z][A-Za-z0-9_]*/,
  },
});

function sepBy1(sep, rule) {
  return seq(rule, repeat(seq(sep, rule)));
}

function sepBy(sep, rule) {
  return optional(sepBy1(sep, rule));
}
