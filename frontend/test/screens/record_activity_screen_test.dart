import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:juthoor/l10n/app_localizations.dart';
import 'package:juthoor/models/activity_models.dart';
import 'package:juthoor/screens/activity_status_screen.dart';
import 'package:juthoor/screens/home_screen.dart';
import 'package:juthoor/screens/record_activity_screen.dart';
import 'package:juthoor/services/api_exception.dart';

import '../fakes/fake_activity_api.dart';

Future<void> tapVisible(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

Future<void> enter(WidgetTester tester, String key, String text) async {
  final f = find.byKey(ValueKey(key));
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.enterText(f, text);
  await tester.pump();
}

Future<void> fillValid(WidgetTester tester) async {
  await enter(tester, 'field-description', 'Planted 3 ghaf seedlings');
  await enter(tester, 'field-answer-species', 'Ghaf');
  await enter(tester, 'field-amount', '3');
  await tapVisible(tester, find.text('Photo (required)'));
  await tester.tap(find.text('Take a photo'));
  await tester.pumpAndSettle();
  await chooseEmirate(tester, 'Dubai');
  await enter(tester, 'field-area', 'Al Safa');
}

Future<void> chooseEmirate(WidgetTester tester, String name) async {
  await tapVisible(tester, find.byKey(const ValueKey('emirate')));
  await tester.tap(find.text(name).last);
  await tester.pumpAndSettle();
}

Future<void> submit(WidgetTester tester) =>
    tapVisible(tester, find.text('Submit activity'));

void main() {
  for (final code in ['en', 'ar']) {
    testWidgets('renders without overflow in $code (NFR-016)', (tester) async {
      await pumpWithFakes(tester, const RecordActivityScreen(), Fakes(),
          locale: Locale(code));
      expect(tester.takeException(), isNull);
      // Planting and clean-up only: the fake API has no other category.
      expect(find.byType(ChoiceChip), findsNWidgets(2));
    });
  }

  testWidgets('is RTL in Arabic (NFR-017)', (tester) async {
    await pumpWithFakes(tester, const RecordActivityScreen(), Fakes(),
        locale: const Locale('ar'));
    expect(Directionality.of(tester.element(find.byType(Scaffold))),
        TextDirection.rtl);
    expect(find.text('زراعة الأشجار'), findsWidgets);
  });

  testWidgets('is LTR in English (NFR-016)', (tester) async {
    await pumpWithFakes(tester, const RecordActivityScreen(), Fakes());
    expect(Directionality.of(tester.element(find.byType(Scaffold))),
        TextDirection.ltr);
  });

  testWidgets(
      'hides Transport and Other and the removed mock controls '
      '(Q-A4b, Q-E7)', (tester) async {
    final api = FakeActivityApi(types: [
      plantingType(),
      const ActivityType(
        id: 'x',
        code: 'METRO',
        category: 'transport',
        name: Bilingual(en: 'Metro', ar: 'المترو'),
        formFields: [],
        amount: AmountRule(unit: 'trips', min: 1, max: 5),
        photoRules: PhotoRules(minPhotos: 1, maxPhotos: 1),
      ),
    ]);
    await pumpWithFakes(tester, const RecordActivityScreen(), Fakes(api: api));
    expect(find.text('Transport'), findsNothing);
    expect(find.text('Other'), findsNothing);
    expect(find.text('Save draft'), findsNothing);
    expect(find.textContaining('Link to'), findsNothing);
  });

  testWidgets('shows the type fields, unit and range hint (FR-009, FR-011)',
      (tester) async {
    await pumpWithFakes(tester, const RecordActivityScreen(), Fakes());
    expect(find.text('Species *'), findsOneWidget);
    expect(find.text('Amount (trees)'), findsOneWidget);
    expect(find.text('Between 1 and 50 trees'), findsWidgets);
    expect(find.text('Photo (required)'), findsOneWidget);

    await tester.tap(find.text('Clean-up'));
    await tester.pumpAndSettle();
    expect(find.text('Site type *'), findsOneWidget);
    expect(find.text('Before (required)'), findsOneWidget);
    expect(find.text('After (required)'), findsOneWidget);
    expect(find.text('Species *'), findsNothing);
  });

  testWidgets('shows a retry when types cannot load (FR-009)', (tester) async {
    final f = Fakes();
    f.api.listTypesError =
        const ApiException(status: 0, code: ApiException.networkCode);
    await pumpWithFakes(tester, const RecordActivityScreen(), f);
    expect(find.textContaining('Cannot reach the server'), findsOneWidget);
    f.api.listTypesError = null;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Species *'), findsOneWidget);
  });

  testWidgets('date picker forbids future dates (FR-019)', (tester) async {
    await pumpWithFakes(tester, const RecordActivityScreen(), Fakes());
    await tapVisible(tester, find.byIcon(Icons.calendar_today_outlined));
    final picker = tester.widget<CalendarDatePicker>(
      find.byType(CalendarDatePicker),
    );
    expect(picker.lastDate.isAfter(DateTime.now()), isFalse);
  });

  testWidgets('validates locally without calling the server', (tester) async {
    final f = Fakes();
    await pumpWithFakes(tester, const RecordActivityScreen(), f);
    await submit(tester);
    expect(find.text('Describe what you did.'), findsOneWidget);
    expect(find.text('This answer is required.'), findsOneWidget);
    expect(find.text('Enter the amount.'), findsOneWidget);
    expect(find.text('Add all the required photos.'), findsOneWidget);
    expect(f.api.submits, isEmpty);
    expect(f.location.calls, 0);
  });

  testWidgets('keeps entered data after validation errors (FR-023)',
      (tester) async {
    final f = Fakes();
    f.api.submitErrors.add(const ApiException(
      status: 422,
      code: 'validation.failed',
      fieldErrors: [
        FieldError(
          field: 'amount.value',
          code: 'amount.outOfRange',
          params: {'min': 1, 'max': 2, 'unit': 'trees'},
        ),
      ],
    ));
    await pumpWithFakes(tester, const RecordActivityScreen(), f);
    await fillValid(tester);
    await submit(tester);

    expect(find.text('Enter between 1 and 2 trees.'), findsOneWidget);
    expect(find.text('Please fix the highlighted fields.'), findsOneWidget);
    String text(String key) =>
        tester.widget<TextField>(find.byKey(ValueKey(key))).controller!.text;
    expect(text('field-description'), 'Planted 3 ghaf seedlings');
    expect(text('field-answer-species'), 'Ghaf');
    expect(text('field-amount'), '3');
    expect(find.text('Added ✓'), findsOneWidget);
    expect(find.byType(RecordActivityScreen), findsOneWidget);
  });

  testWidgets(
      'shows the emirate dropdown and area by default, with no location '
      'notice or manual button (FR-012, AC 3, FR-020 deferred)',
      (tester) async {
    await pumpWithFakes(tester, const RecordActivityScreen(), Fakes());
    final l10n = AppLocalizations.of(tester.element(find.byType(Scaffold)));
    await tester.ensureVisible(find.byKey(const ValueKey('emirate')));
    expect(find.byKey(const ValueKey('emirate')), findsOneWidget);
    expect(find.byKey(const ValueKey('field-area')), findsOneWidget);
    expect(find.text(l10n.locationNoticeSubmit), findsNothing);
    expect(find.text(l10n.locationFallbackNotice), findsNothing);
    expect(find.text(l10n.locationManualButton), findsNothing);
  });

  testWidgets(
      'submits a manual location without ever asking for the device position '
      '(FR-012, AC 3, FR-020 deferred)', (tester) async {
    final f = Fakes(location: FakeLocationProvider(position: null));
    await pumpWithFakes(tester, const RecordActivityScreen(), f);
    await fillValid(tester);
    await submit(tester);

    expect(f.location.calls, 0);
    expect(find.textContaining('We could not get your location'), findsNothing);
    expect(find.byType(ActivityStatusScreen), findsOneWidget);
    final loc = f.api.submits.single.request.location;
    expect(loc.toJson(), {
      'source': 'manual',
      'emirate': 'Dubai',
      'area': 'Al Safa',
    });
  });

  testWidgets('submits within four transitions (NFR-013)', (tester) async {
    final f = Fakes();
    await pumpWithFakes(tester, const HomeShell(), f);
    await tester.tap(find.textContaining('Record an activity').first);
    await tester.pumpAndSettle(); // transition 1: home to form
    expect(find.byType(RecordActivityScreen), findsOneWidget);

    await fillValid(tester);
    await submit(tester); // transition 2: form to status

    expect(find.byType(ActivityStatusScreen), findsOneWidget);
    expect(find.byType(RecordActivityScreen), findsNothing);
    expect(find.textContaining('Thank you'), findsOneWidget);
    expect(f.api.submits.single.key, isNotEmpty);
    expect(f.api.submits.single.request.location.toJson()['source'], 'manual');
    expect(f.location.calls, 0);

    // The form was replaced, so one back step returns to home.
    final nav = tester.state<NavigatorState>(find.byType(Navigator));
    nav.pop();
    await tester.pumpAndSettle();
    expect(find.byType(HomeShell), findsOneWidget);
  });

  testWidgets('submits and renders the status in Arabic RTL (NFR-017)',
      (tester) async {
    final f = Fakes();
    await pumpWithFakes(tester, const RecordActivityScreen(), f,
        locale: const Locale('ar'));
    await enter(tester, 'field-description', 'زرعت ثلاث شتلات');
    await enter(tester, 'field-answer-species', 'غاف');
    await enter(tester, 'field-amount', '3');
    await tapVisible(tester, find.text('صورة (مطلوبة)'));
    await tester.tap(find.text('التقاط صورة'));
    await tester.pumpAndSettle();
    await chooseEmirate(tester, 'دبي');
    await tapVisible(tester, find.text('إرسال النشاط'));
    expect(find.byType(ActivityStatusScreen), findsOneWidget);
    expect(tester.takeException(), isNull);
    expect(Directionality.of(tester.element(find.byType(ActivityStatusScreen))),
        TextDirection.rtl);
  });

  testWidgets('photo slots and buttons meet the 48dp target (NFR-015)',
      (tester) async {
    await pumpWithFakes(tester, const RecordActivityScreen(), Fakes());
    final tile = tester.getSize(find.ancestor(
        of: find.text('Photo (required)'), matching: find.byType(InkWell)));
    expect(tile.height, greaterThanOrEqualTo(48));
    await tester.ensureVisible(find.text('Submit activity'));
    expect(tester.getSize(find.byType(ElevatedButton)).height,
        greaterThanOrEqualTo(48));
    expect(tester.getSemantics(find.text('Photo (required)')).label,
        contains('Photo (required)'));
  });
}
