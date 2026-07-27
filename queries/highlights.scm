; -----------------------------------------------------------------
; kaikai — tree-sitter highlights
; -----------------------------------------------------------------

; Comments
(line_comment) @comment

; Attributes
(attribute) @attribute

; Keywords
[
  "and"
  "as"
  "assert"
  "axiom"
  "bench"
  "case"
  "check"
  "const"
  "effect"
  "else"
  "ensures"
  "fn"
  "for"
  "handle"
  "if"
  "impl"
  "import"
  "in"
  "let"
  "match"
  "not"
  "or"
  "priv"
  "protocol"
  "pub"
  "requires"
  "test"
  "theory"
  "type"
  "unit"
  "use"
  "var"
  "when"
  "where"
  "with"
  "extern"
] @keyword

; Booleans
[
  (bool_literal)
] @constant.builtin.boolean

; Numbers
(integer_literal) @number
(real_literal) @number.float
(dimensioned_literal) @number

; Strings
(string_literal) @string
(triple_string_literal) @string
(escape_sequence) @string.escape
(char_literal) @character

; Interpolation
(interpolation "}" @punctuation.special)

; Operators
[
  "+"  "-"  "*"  "/"  "%"  "^"
  "=="  "!="  "<"  "<="  ">"  ">="
  "++"
  ".."  "..="
  "|>"  "||"  "|?"
  "->"  "=>"
  ":="  "="
  "|"
  "@"
] @operator

; Punctuation
[ "(" ")" "[" "]" "{" "}" ] @punctuation.bracket
[ "," "." ":" ] @punctuation.delimiter

; Holes
(hole_expression) @variable.special
(type_hole) @variable.special

; Spread / rest
(spread_expression "..." @operator)
(rest_pattern "..." @operator)

; Builtin types
((type_identifier) @type.builtin
  (#match? @type.builtin "^(Int|Real|Bool|String|Char|Unit|Nothing|Option|Result|List|Pair|Map|Set|Stack|Queue|Array|Byte|Decimal|Money|Fiber|Pid|Regex|Match|Capture|WallTime|Instant|Duration|Self)$"))

; Builtin effects
((type_identifier) @type.builtin.effect
  (#match? @type.builtin.effect "^(Console|Stdin|Stdout|Stderr|File|Env|State|Reader|Writer|Actor|Spawn|Cancel|Mutable|Fail|Random|Time|Clock|Ffi|Process|NetTcp|Signal|Log|SecureRandom|Link|Monitor)$"))

; Types (general)
(type_identifier) @type

; Constructors used in expressions and patterns
(constructor (type_identifier) @constructor)
(variant_pattern name: (type_identifier) @constructor)
(variant name: (type_identifier) @constructor)

; Effect rows
(effect_label (type_identifier) @type.builtin.effect)

; Function declarations
(function_declaration name: (lower_identifier) @function)
(extern_declaration   name: (lower_identifier) @function)
(protocol_signature   name: (lower_identifier) @function)
(effect_operation     name: (lower_identifier) @function)

; Function calls
(call_expression
  function: (identifier (lower_identifier) @function.call))
(call_expression
  function: (field_expression field: (lower_identifier) @function.method))
(call_expression
  function: (qualified_identifier (lower_identifier) @function.call .))

; Type declarations
(type_declaration   name: (type_identifier) @type.definition)
(effect_declaration name: (type_identifier) @type.definition)
(protocol_declaration name: (type_identifier) @type.definition)
(unit_declaration   name: (type_identifier) @type.definition)

; Parameters
(parameter name: (lower_identifier) @variable.parameter)

; Field names
(record_type_field name: (lower_identifier) @property)
(record_field      name: (lower_identifier) @property)
(record_pattern_field name: (lower_identifier) @property)
(field_expression  field: (lower_identifier) @property)

; Identifiers (lowest priority)
(identifier (lower_identifier) @variable)

; todo! — runtime escape sentinel
((identifier (lower_identifier) @keyword.exception)
  (#eq? @keyword.exception "todo!"))
