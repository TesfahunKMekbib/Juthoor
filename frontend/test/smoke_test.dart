import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:juthoor/main.dart';
import 'package:juthoor/services/activity_api.dart';
import 'package:provider/provider.dart';

import 'fakes/fake_activity_api.dart';

void main() {
  tearDown(() => appLocale.value = null);

  Future<TextDirection> pumpAppAs(WidgetTester tester, Locale locale) async {
    appLocale.value = locale;
    await tester.pumpWidget(
      Provider<ActivityApi>.value(
        value: FakeActivityApi(),
        child: const JuthoorApp(),
      ),
    );
    await tester.pumpAndSettle();
    return Directionality.of(tester.element(find.byType(Scaffold).first));
  }

  testWidgets('app builds in English with LTR layout (NFR-016)', (
    tester,
  ) async {
    final dir = await pumpAppAs(tester, const Locale('en'));
    expect(dir, TextDirection.ltr);
    expect(find.text('Home'), findsWidgets);
  });

  testWidgets('app builds in Arabic with RTL layout (NFR-016, NFR-017)', (
    tester,
  ) async {
    final dir = await pumpAppAs(tester, const Locale('ar'));
    expect(dir, TextDirection.rtl);
    expect(find.text('الرئيسية'), findsWidgets);
  });
}
