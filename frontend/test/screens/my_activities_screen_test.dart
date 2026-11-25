import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:juthoor/models/activity_models.dart';
import 'package:juthoor/screens/activity_status_screen.dart';
import 'package:juthoor/screens/home_screen.dart';
import 'package:juthoor/screens/my_activities_screen.dart';
import 'package:juthoor/services/api_exception.dart';

import '../fakes/fake_activity_api.dart';

void main() {
  testWidgets('lists own submissions and opens one (FR-017)', (tester) async {
    final f = Fakes();
    f.api.activities = [
      viewFor(plantingType(), id: 'a2', status: ActivityStatus.accepted),
      viewFor(cleanupType(), id: 'a1'),
    ];
    await pumpWithFakes(tester, const MyActivitiesScreen(), f);
    expect(find.text('My activities'), findsOneWidget);
    expect(find.text('Tree planting'), findsOneWidget);
    expect(find.textContaining('Accepted'), findsOneWidget);
    expect(find.text('Beach clean-up'), findsOneWidget);

    await tester.tap(find.text('Beach clean-up'));
    await tester.pumpAndSettle();
    expect(find.byType(ActivityStatusScreen), findsOneWidget);
  });

  testWidgets('shows an empty state', (tester) async {
    await pumpWithFakes(tester, const MyActivitiesScreen(), Fakes());
    expect(find.text('You have not submitted any activities yet.'),
        findsOneWidget);
  });

  testWidgets('renders in Arabic RTL without overflow (NFR-017)',
      (tester) async {
    final f = Fakes();
    f.api.activities = [viewFor(plantingType())];
    await pumpWithFakes(tester, const MyActivitiesScreen(), f,
        locale: const Locale('ar'));
    expect(tester.takeException(), isNull);
    expect(find.text('أنشطتي'), findsOneWidget);
    expect(find.text('زراعة الأشجار'), findsOneWidget);
    expect(Directionality.of(tester.element(find.byType(Scaffold))),
        TextDirection.rtl);
  });

  testWidgets('home Activities tab shows my activities', (tester) async {
    final f = Fakes();
    f.api.activities = [viewFor(plantingType())];
    await pumpWithFakes(tester, const HomeShell(), f);
    await tester.tap(find.text('Activities'));
    await tester.pumpAndSettle();
    expect(find.byType(MyActivitiesScreen), findsOneWidget);
    expect(find.text('Tree planting'), findsOneWidget);
  });

  testWidgets('shows a network error with retry', (tester) async {
    final f = Fakes(api: _FailingList());
    await pumpWithFakes(tester, const MyActivitiesScreen(), f);
    expect(find.textContaining('Cannot reach the server'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });
}

class _FailingList extends FakeActivityApi {
  @override
  Future<List<ActivityView>> listActivities() async =>
      throw const ApiException(status: 0, code: ApiException.networkCode);
}
