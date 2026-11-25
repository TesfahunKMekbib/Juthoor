import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:juthoor/models/activity_models.dart';
import 'package:juthoor/screens/activity_status_screen.dart';
import 'package:juthoor/services/api_exception.dart';

import '../fakes/fake_activity_api.dart';

void main() {
  testWidgets(
      'shows the submitted confirmation and the advisory note '
      '(FR-017, FR-025)', (tester) async {
    final v = viewFor(plantingType());
    await pumpWithFakes(
      tester,
      ActivityStatusScreen(activityId: v.id, initial: v),
      Fakes(),
    );
    expect(find.text('Submitted'), findsOneWidget);
    expect(find.textContaining('Thank you'), findsOneWidget);
    expect(find.text('Tree planting'), findsOneWidget);
    expect(find.text('3 trees'), findsOneWidget);
    expect(find.text('Abu Dhabi, Al Reem'), findsOneWidget);
    expect(
        find.text('AI screening is an estimate, not proof.'), findsOneWidget);
  });

  testWidgets(
      'loads the activity by id and refreshes to the decided status '
      '(FR-017)', (tester) async {
    final f = Fakes();
    f.api.activities = [viewFor(plantingType())];
    await pumpWithFakes(
        tester, const ActivityStatusScreen(activityId: 'a1'), f);
    expect(find.text('Submitted'), findsOneWidget);

    f.api.activities = [
      viewFor(plantingType(), status: ActivityStatus.accepted),
    ];
    await tester.tap(find.byTooltip('Refresh'));
    await tester.pumpAndSettle();
    expect(find.text('Accepted'), findsOneWidget);
    expect(find.text('Accepted amount'), findsOneWidget);
  });

  testWidgets('shows the localised reason for a returned activity (FR-027)',
      (tester) async {
    final v = viewFor(
      plantingType(),
      status: ActivityStatus.returnedForCorrection,
      reason: 'verification.evidenceUnclear',
    );
    await pumpWithFakes(
      tester,
      ActivityStatusScreen(activityId: v.id, initial: v),
      Fakes(),
    );
    expect(find.text('Returned for correction'), findsOneWidget);
    expect(find.text('The photos were not clear enough to check.'),
        findsOneWidget);
  });

  testWidgets('shows a coded error when the activity is not found',
      (tester) async {
    await pumpWithFakes(
        tester, const ActivityStatusScreen(activityId: 'nope'), Fakes());
    expect(find.text('Activity not found.'), findsOneWidget);
  });

  testWidgets('shows a network error text', (tester) async {
    final f = Fakes();
    f.api.getError =
        const ApiException(status: 0, code: ApiException.networkCode);
    await pumpWithFakes(
        tester, const ActivityStatusScreen(activityId: 'a1'), f);
    expect(find.textContaining('Cannot reach the server'), findsOneWidget);
  });

  testWidgets('renders in Arabic RTL without overflow (NFR-016, NFR-017)',
      (tester) async {
    final v = viewFor(plantingType());
    await pumpWithFakes(
      tester,
      ActivityStatusScreen(activityId: v.id, initial: v),
      Fakes(),
      locale: const Locale('ar'),
    );
    expect(tester.takeException(), isNull);
    expect(find.text('تم الإرسال'), findsOneWidget);
    expect(find.text('زراعة الأشجار'), findsOneWidget);
    expect(Directionality.of(tester.element(find.byType(Scaffold))),
        TextDirection.rtl);
  });

  testWidgets('refresh button is at least 48dp (NFR-015)', (tester) async {
    final v = viewFor(plantingType());
    await pumpWithFakes(
      tester,
      ActivityStatusScreen(activityId: v.id, initial: v),
      Fakes(),
    );
    final size = tester.getSize(find.byTooltip('Refresh'));
    expect(size.shortestSide, greaterThanOrEqualTo(48));
  });
}
