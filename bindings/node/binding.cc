#include "tree_sitter/parser.h"
#include <node_api.h>

typedef struct TSLanguage TSLanguage;

extern "C" TSLanguage *tree_sitter_kaikai();

// "tree-sitter", "language" hooks expected by tree-sitter.
extern "C" napi_value Init(napi_env env, napi_value exports) {
  napi_value language_value;
  napi_create_external(env, (void *)tree_sitter_kaikai(), nullptr, nullptr,
                       &language_value);
  napi_set_named_property(env, exports, "language", language_value);

  napi_value name_value;
  napi_create_string_utf8(env, "kaikai", NAPI_AUTO_LENGTH, &name_value);
  napi_set_named_property(env, exports, "name", name_value);

  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
