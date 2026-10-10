; kaikai — indentation hints (nvim-treesitter format)

[
  (block)
  (case_block)
  (block_lambda)
  (trailing_block)
  (map_expression)
  (set_expression)
  (record_type)
  (record_expression)
  (list_expression)
  (parameters)
  (arguments)
  (match_expression)
  (handle_expression)
  (effect_declaration)
  (protocol_declaration)
  (impl_declaration)
] @indent.begin

[ "}" "]" ")" ] @indent.end
[ "}" "]" ")" ] @indent.branch
