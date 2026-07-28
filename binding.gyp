{
  "targets": [
    {
      "target_name": "tree_sitter_kaikai_binding",
      "include_dirs": [
        "<!(node -e \"require('node-addon-api').include\")",
        "src"
      ],
      "sources": [
        "bindings/node/binding.cc",
        "src/parser.c",
        "src/scanner.c"
      ],
      "cflags_c": ["-std=c11"],
      "xcode_settings": {
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "MACOSX_DEPLOYMENT_TARGET": "10.13"
      }
    }
  ]
}
