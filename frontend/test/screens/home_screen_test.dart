import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:juthoor/screens/home_screen.dart';

import '../helpers/pump_app.dart';

void main() {
  const cases = {
    'en': ('Home', 'Record an activity'),
    'ar': ('الرئيسية', 'تسجيل نشاط'),
  };

  for (final entry in cases.entries) {
    testWidgets('HomeShell renders without overflow in ${entry.key} (NFR-016)',
        (tester) async {
      await pumpApp(tester, const HomeShell(), locale: Locale(entry.key));
      expect(tester.takeException(), isNull);
      expect(find.text(entry.value.$1), findsWidgets);
      expect(find.textContaining(entry.value.$2), findsWidgets);
    });
  }

  testWidgets('HomeShell is RTL in Arabic (NFR-017)', (tester) async {
    await pumpApp(tester, const HomeShell(), locale: const Locale('ar'));
    tester.takeException(); // overflow is asserted in the render tests
    final dir = Directionality.of(tester.element(find.byType(HomePage)));
    expect(dir, TextDirection.rtl);
  });
}
