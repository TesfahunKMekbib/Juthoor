import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:juthoor/models/activity_models.dart';
import 'package:juthoor/screens/activity_status_screen.dart';
import 'package:juthoor/screens/my_activities_screen.dart';

import '../fakes/fake_activity_api.dart';

const _s3 = Duration(seconds: 3);

Future<Fakes> _open(
  WidgetTester tester,
  ActivityStatus status, {
  String? reason,
  Locale locale = const Locale('en'),
}) async {
  final f = Fakes();
  final v = viewFor(plantingType(), status: status, reason: reason);
  f.api.activities = [v];
  await pumpWithFakes(
    tester,
    ActivityStatusScreen(activityId: v.id, initial: v),
    f,
    locale: locale,
  );
  return f;
}

Future<void> _unmount(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
}

void main() {
  const labels = {
    ActivityStatus.submitted: ('Submitted', 'تم الإرسال'),
    ActivityStatus.pendingTechnicalProcessing: (
      'Processing delayed',
      'المعالجة متأخرة'
    ),
    ActivityStatus.accepted: ('Accepted', 'مقبول'),
    ActivityStatus.rejected: ('Rejected', 'مرفوض'),
    ActivityStatus.returnedForCorrection: (
      'Returned for correction',
      'أُعيد للتصحيح'
    ),
    ActivityStatus.draft: ('Draft', 'مسودة'),
  };

  for (final e in labels.entries) {
    for (final ar in [false, true]) {
      testWidgets(
          'renders ${e.key.name} with label, icon and advisory in '
          '${ar ? 'ar' : 'en'} (FR-017, FR-025, NFR-015)', (tester) async {
        await _open(tester, e.key, locale: Locale(ar ? 'ar' : 'en'));
        expect(find.text(ar ? e.value.$2 : e.value.$1), findsOneWidget);
        expect(find.byIcon(statusIcon(e.key)), findsWidgets);
        expect(
            find.text(ar
                ? 'فحص الذكاء الاصطناعي تقدير وليس إثباتًا.'
                : 'AI screening is an estimate, not proof.'),
            findsOneWidget);
        expect(find.textContaining('verified'), findsNothing);
        expect(find.textContaining('proven'), findsNothing);
        expect(tester.takeException(), isNull);
        if (ar) {
          expect(Directionality.of(tester.element(find.byType(Scaffold))),
              TextDirection.rtl);
        }
        await _unmount(tester);
      });
    }
  }

  const reasons = {
    'verification.evidenceUnclear': (
      ActivityStatus.returnedForCorrection,
      'The photos were not clear enough to check.',
      'لم تكن الصور واضحة بما يكفي للفحص.'
    ),
    'verification.evidenceUnrelated': (
      ActivityStatus.rejected,
      'The photos did not appear to match this activity.',
      'لا يبدو أن الصور تطابق هذا النشاط.'
    ),
    'processing.retrying': (
      ActivityStatus.pendingTechnicalProcessing,
      'The checker is temporarily unavailable. We will try again automatically.',
      'أداة الفحص غير متاحة مؤقتًا. سنعيد المحاولة تلقائيًا.'
    ),
    'processing.failedPermanently': (
      ActivityStatus.pendingTechnicalProcessing,
      'We could not finish checking this activity.',
      'تعذّر إكمال فحص هذا النشاط.'
    ),
  };
  for (final e in reasons.entries) {
    for (final ar in [false, true]) {
      testWidgets('shows reason ${e.key} in ${ar ? 'ar' : 'en'} (FR-027)',
          (tester) async {
        await _open(tester, e.value.$1,
            reason: e.key, locale: Locale(ar ? 'ar' : 'en'));
        expect(find.text(ar ? e.value.$3 : e.value.$2), findsOneWidget);
        await _unmount(tester);
      });
    }
  }

  testWidgets('unknown reason code shows generic text (NFR-016)',
      (tester) async {
    await _open(tester, ActivityStatus.rejected, reason: 'something.new');
    expect(find.text('No further detail is available for this result.'),
        findsOneWidget);
    expect(find.textContaining('something.new'), findsNothing);
  });

  testWidgets('polls submitted -> pending -> accepted, then stops (FR-028)',
      (tester) async {
    final f = await _open(tester, ActivityStatus.submitted);
    expect(f.api.getCalls, 0);

    await tester.pump(_s3);
    expect(f.api.getCalls, 1);
    expect(find.text('Submitted'), findsOneWidget);

    f.api.activities = [
      viewFor(plantingType(), status: ActivityStatus.pendingTechnicalProcessing)
    ];
    await tester.pump(_s3);
    expect(f.api.getCalls, 2);
    expect(find.text('Processing delayed'), findsOneWidget);

    f.api.activities = [
      viewFor(plantingType(), status: ActivityStatus.accepted)
    ];
    await tester.pump(_s3);
    expect(f.api.getCalls, 3);
    expect(find.text('Accepted'), findsOneWidget);

    await tester.pump(const Duration(seconds: 30));
    expect(f.api.getCalls, 3);
  });

  testWidgets('stops polling after 60 s (FR-028)', (tester) async {
    final f = await _open(tester, ActivityStatus.submitted);
    for (var i = 0; i < 25; i++) {
      await tester.pump(_s3);
    }
    expect(f.api.getCalls, 20);
    expect(find.text('Submitted'), findsOneWidget);
  });

  testWidgets('does not poll a final state at all', (tester) async {
    final f = await _open(tester, ActivityStatus.rejected);
    await tester.pump(const Duration(seconds: 30));
    expect(f.api.getCalls, 0);
  });

  testWidgets('cancels the timer on dispose', (tester) async {
    final f = await _open(tester, ActivityStatus.submitted);
    await tester.pump(_s3);
    expect(f.api.getCalls, 1);
    await _unmount(tester);
    await tester.pump(const Duration(seconds: 30));
    expect(f.api.getCalls, 1);
  });

  testWidgets('stops while the app is paused and resumes after',
      (tester) async {
    final f = await _open(tester, ActivityStatus.submitted);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump(const Duration(seconds: 12));
    expect(f.api.getCalls, 0);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump(_s3);
    expect(f.api.getCalls, 1);
    await _unmount(tester);
  });

  testWidgets('pull-to-refresh reloads the status', (tester) async {
    final f = await _open(tester, ActivityStatus.rejected);
    f.api.activities = [
      viewFor(plantingType(), status: ActivityStatus.accepted)
    ];
    await tester.fling(find.byType(ListView), const Offset(0, 400), 1000);
    await tester.pumpAndSettle();
    expect(f.api.getCalls, 1);
    expect(find.text('Accepted'), findsOneWidget);
  });

  testWidgets('does not overflow at 360 px with a long reason in ar',
      (tester) async {
    await _open(tester, ActivityStatus.pendingTechnicalProcessing,
        reason: 'processing.retrying', locale: const Locale('ar'));
    expect(tester.takeException(), isNull);
    await _unmount(tester);
  });

  testWidgets('my activities rows show the status chip with icon (FR-017)',
      (tester) async {
    final f = Fakes();
    f.api.activities = [
      viewFor(plantingType(),
          id: 'a2', status: ActivityStatus.returnedForCorrection),
      viewFor(cleanupType(), id: 'a1'),
    ];
    await pumpWithFakes(tester, const MyActivitiesScreen(), f);
    expect(find.byType(StatusChip), findsNWidgets(2));
    expect(find.text('Returned for correction'), findsOneWidget);
    expect(find.byIcon(Icons.undo), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
