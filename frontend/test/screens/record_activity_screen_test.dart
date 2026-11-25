import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:juthoor/screens/record_activity_screen.dart';

import '../helpers/pump_app.dart';

void main() {
  for (final code in ['en', 'ar']) {
    testWidgets(
        'RecordActivityScreen renders without overflow in $code '
        '(NFR-016)', (tester) async {
      await pumpApp(tester, const RecordActivityScreen(), locale: Locale(code));
      expect(tester.takeException(), isNull);
      // Currently seven category chips (Transport/Other flagged under Q-A4).
      expect(find.byType(ChoiceChip), findsNWidgets(7));
    });
  }

  testWidgets('RecordActivityScreen is RTL in Arabic (NFR-017)',
      (tester) async {
    await pumpApp(tester, const RecordActivityScreen(),
        locale: const Locale('ar'));
    tester.takeException(); // overflow is asserted in the render tests
    final dir = Directionality.of(tester.element(find.byType(Scaffold)));
    expect(dir, TextDirection.rtl);
  });

  testWidgets('RecordActivityScreen is LTR in English (NFR-016)',
      (tester) async {
    await pumpApp(tester, const RecordActivityScreen());
    tester.takeException(); // overflow is asserted in the render tests
    final dir = Directionality.of(tester.element(find.byType(Scaffold)));
    expect(dir, TextDirection.ltr);
  });

  group(
    'date window',
    () {
      testWidgets('rejects a future occurrence date in the picker (FR-019)', (
        tester,
      ) async {
        await pumpApp(tester, const RecordActivityScreen());
        await tester.tap(find.byIcon(Icons.calendar_today_outlined));
        await tester.pumpAndSettle();
        final picker = tester.widget<CalendarDatePicker>(
          find.byType(CalendarDatePicker),
        );
        expect(picker.lastDate.isAfter(DateTime.now()), isFalse);
      });
    },
    skip: 'FR-019 not implemented yet — date picker allows future dates',
  );
}
