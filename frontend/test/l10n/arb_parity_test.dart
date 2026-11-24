import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> _load(String name) =>
    jsonDecode(File('lib/l10n/$name').readAsStringSync())
        as Map<String, dynamic>;

Iterable<String> _keys(Map<String, dynamic> m) =>
    m.keys.where((k) => !k.startsWith('@'));

void main() {
  final en = _load('app_en.arb');
  final ar = _load('app_ar.arb');

  test('every English key exists in Arabic with a non-empty value (NFR-016)',
      () {
    final missing = <String>[];
    for (final k in _keys(en)) {
      final v = ar[k];
      if (v is! String || v.trim().isEmpty) missing.add(k);
    }
    expect(missing, isEmpty);
  });

  test('English values are non-empty (NFR-016)', () {
    final empty = _keys(en).where((k) => (en[k] as String).trim().isEmpty);
    expect(empty, isEmpty);
  });

  test('Arabic has no keys absent from English', () {
    final extra = _keys(ar).where((k) => !en.containsKey(k));
    expect(extra, isEmpty);
  });
}
