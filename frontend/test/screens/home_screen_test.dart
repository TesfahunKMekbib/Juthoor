import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:juthoor/models/activity_models.dart';
import 'package:juthoor/screens/activity_status_screen.dart';
import 'package:juthoor/screens/home_screen.dart';
import 'package:juthoor/screens/my_activities_screen.dart';
import 'package:juthoor/services/api_exception.dart';

import '../fakes/fake_activity_api.dart';

class _FailingList extends FakeActivityApi {
  @override
  Future<List<ActivityView>> listActivities() async =>
      throw const ApiException(status: 0, code: ApiException.networkCode);
}

void main() {
  const cases = {
    'en': ('Home', 'Record an activity'),
    'ar': ('الرئيسية', 'تسجيل نشاط'),
  };

  for (final entry in cases.entries) {
    testWidgets('HomeShell renders without overflow in ${entry.key} (NFR-016)',
        (tester) async {
      await pumpWithFakes(tester, const HomeShell(), Fakes(),
          locale: Locale(entry.key));
      expect(tester.takeException(), isNull);
      expect(find.text(entry.value.$1), findsWidgets);
      expect(find.textContaining(entry.value.$2), findsWidgets);
    });
  }

  testWidgets('HomeShell is RTL in Arabic (NFR-017)', (tester) async {
    await pumpWithFakes(tester, const HomeShell(), Fakes(),
        locale: const Locale('ar'));
    tester.takeException();
    final dir = Directionality.of(tester.element(find.byType(HomePage)));
    expect(dir, TextDirection.rtl);
  });

  testWidgets('shows recent activities with real statuses (FR-017)',
      (tester) async {
    final f = Fakes();
    f.api.activities = [
      viewFor(plantingType(), id: 'a1', status: ActivityStatus.accepted),
      viewFor(cleanupType(), id: 'a2', status: ActivityStatus.rejected),
    ];
    await pumpWithFakes(tester, const HomeShell(), f);
    expect(find.text('Recent activities'), findsOneWidget);
    expect(find.text('Tree planting'), findsOneWidget);
    expect(find.text('Beach clean-up'), findsOneWidget);
    expect(find.text('2 activities submitted'), findsOneWidget);
    expect(find.text('Accepted'), findsWidgets);
    expect(find.text('Accepted · 1'), findsOneWidget);
    expect(find.text('Rejected · 1'), findsOneWidget);
  });

  testWidgets('shows recent activities in Arabic', (tester) async {
    final f = Fakes();
    f.api.activities = [viewFor(plantingType())];
    await pumpWithFakes(tester, const HomeShell(), f,
        locale: const Locale('ar'));
    expect(tester.takeException(), isNull);
    expect(find.text('الأنشطة الأخيرة'), findsOneWidget);
    expect(find.text('زراعة الأشجار'), findsOneWidget);
  });

  for (final code in ['en', 'ar']) {
    testWidgets('shows no fictional content [$code]', (tester) async {
      final f = Fakes();
      await pumpWithFakes(tester, const HomeShell(), f, locale: Locale(code));
      for (final s in [
        'Rashid',
        'راشد',
        '1,585',
        'Level 3',
        'streak',
        'badges',
        'Metro',
        'Ghaf',
        'Recommended',
        'kg CO2',
      ]) {
        expect(find.textContaining(s), findsNothing, reason: s);
      }
    });
  }

  testWidgets('empty state points to recording an activity', (tester) async {
    await pumpWithFakes(tester, const HomeShell(), Fakes());
    expect(find.text('No activities yet'), findsOneWidget);
    expect(find.textContaining('Record an activity'), findsOneWidget);
  });

  testWidgets('empty state in Arabic', (tester) async {
    await pumpWithFakes(tester, const HomeShell(), Fakes(),
        locale: const Locale('ar'));
    expect(find.text('لا توجد أنشطة بعد'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('error state offers retry that reloads', (tester) async {
    await pumpWithFakes(tester, const HomeShell(), Fakes(api: _FailingList()));
    expect(find.textContaining('Cannot reach the server'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Cannot reach the server'), findsOneWidget);
  });

  testWidgets('tapping a recent activity opens its status screen',
      (tester) async {
    final f = Fakes();
    f.api.activities = [viewFor(plantingType())];
    await pumpWithFakes(tester, const HomeShell(), f);
    await tester.tap(find.text('Tree planting'));
    await tester.pumpAndSettle();
    expect(find.byType(ActivityStatusScreen), findsOneWidget);
  });

  testWidgets('View all opens the Activities tab', (tester) async {
    final f = Fakes();
    f.api.activities = [viewFor(plantingType())];
    await pumpWithFakes(tester, const HomeShell(), f);
    await tester.tap(find.text('View all'));
    await tester.pumpAndSettle();
    expect(find.byType(MyActivitiesScreen), findsOneWidget);
  });

  for (final code in ['en', 'ar']) {
    testWidgets('bottom bar has only Home and Activities [$code]',
        (tester) async {
      await pumpWithFakes(tester, const HomeShell(), Fakes(),
          locale: Locale(code));
      final labels =
          code == 'en' ? ['Home', 'Activities'] : ['الرئيسية', 'الأنشطة'];
      for (final l in labels) {
        expect(find.text(l), findsWidgets);
      }
      for (final gone in code == 'en'
          ? ['Impact', 'Assistant', 'Profile']
          : ['الأثر', 'المساعد', 'الملف الشخصي']) {
        expect(find.text(gone), findsNothing, reason: gone);
      }
    });
  }
}
