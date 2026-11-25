import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:juthoor/l10n/app_localizations.dart';
import 'package:juthoor/models/activity_models.dart';
import 'package:juthoor/screens/activity_status_screen.dart';
import 'package:juthoor/screens/home_screen.dart';
import 'package:juthoor/screens/record_activity_screen.dart';
import 'package:juthoor/services/activity_api.dart';
import 'package:juthoor/services/api_exception.dart';
import 'package:juthoor/services/device_services.dart';
import 'package:provider/provider.dart';

import '../fakes/fake_activity_api.dart';
import '../helpers/pump_app.dart';

/// Counts page transitions after the initial route (NFR-013).
class _Transitions extends NavigatorObserver {
  int count = 0;
  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (route is PageRoute) count++;
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    if (newRoute is PageRoute) count++;
  }
}

class _Strings {
  const _Strings({
    required this.locale,
    required this.record,
    required this.category,
    required this.typeName,
    required this.before,
    required this.after,
    required this.take,
    required this.submit,
    required this.dubai,
    required this.accepted,
    required this.processing,
    required this.advisory,
    required this.tooLong,
    required this.fallback,
    required this.added,
    required this.description,
  });
  final Locale locale;
  final String record, category, typeName, before, after, take, submit;
  final String dubai, accepted, processing, advisory;
  final String tooLong, fallback, added, description;
}

const _en = _Strings(
  locale: Locale('en'),
  record: 'Record an activity',
  category: 'Clean-up',
  typeName: 'Beach clean-up',
  before: 'Before (required)',
  after: 'After (required)',
  take: 'Take a photo',
  submit: 'Submit activity',
  dubai: 'Dubai',
  accepted: 'Accepted',
  processing: 'Processing delayed',
  advisory: 'AI screening is an estimate, not proof.',
  tooLong: 'The description is too long.',
  fallback: 'We could not get your location',
  added: 'Added ✓',
  description: 'Collected bags on the shore',
);

const _ar = _Strings(
  locale: Locale('ar'),
  record: 'تسجيل نشاط',
  category: 'التنظيف',
  typeName: 'تنظيف الشاطئ',
  before: 'قبل (مطلوبة)',
  after: 'بعد (مطلوبة)',
  take: 'التقاط صورة',
  submit: 'إرسال النشاط',
  dubai: 'دبي',
  accepted: 'مقبول',
  processing: 'المعالجة متأخرة',
  advisory: 'فحص الذكاء الاصطناعي تقدير وليس إثباتًا.',
  tooLong: 'الوصف طويل جدًا.',
  fallback: 'تعذّر تحديد موقعك',
  added: 'تمت الإضافة ✓',
  description: 'جمعت أكياسًا من الشاطئ',
);

/// Pumps the real app shell with a [_Transitions] observer and the fakes.
Future<_Transitions> _pump(WidgetTester tester, Fakes f, Locale locale) async {
  usePhoneSurface(tester);
  final obs = _Transitions();
  await tester.pumpWidget(MultiProvider(
    providers: [
      Provider<ActivityApi>.value(value: f.api),
      Provider<LocationProvider>.value(value: f.location),
      Provider<PhotoPicker>.value(value: f.photos),
    ],
    child: MaterialApp(
      locale: locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      navigatorObservers: [obs],
      home: const HomeShell(),
    ),
  ));
  await tester.pumpAndSettle();
  obs.count = 0; // the initial route is not a transition
  return obs;
}

Future<void> _tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

Future<void> _enter(WidgetTester tester, String key, String text) async {
  final f = find.byKey(ValueKey(key));
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.enterText(f, text);
  await tester.pump();
}

/// Home -> form -> category/type -> fields -> photos (no submit yet).
Future<void> _fillForm(WidgetTester tester, _Strings s) async {
  await tester.tap(find.textContaining(s.record).first);
  await tester.pumpAndSettle();
  expect(find.byType(RecordActivityScreen), findsOneWidget);

  await _tap(tester, find.text(s.category));
  await _tap(tester, find.byType(DropdownButtonFormField<String>).first);
  await tester.tap(find.text(s.typeName).last);
  await tester.pumpAndSettle();

  await _enter(tester, 'field-description', s.description);
  await _tap(tester, find.byKey(const ValueKey('answer-t-clean-site')));
  await tester.tap(find.text('Beach').last);
  await tester.pumpAndSettle();
  await _enter(tester, 'field-amount', '3');

  for (final slot in [s.before, s.after]) {
    await _tap(tester, find.text(slot));
    await tester.tap(find.text(s.take));
    await tester.pumpAndSettle();
  }
  expect(find.text(s.added), findsNWidgets(2));
}

String _text(WidgetTester tester, String key) =>
    tester.widget<TextField>(find.byKey(ValueKey(key))).controller!.text;

void _expectNoVerifiedWording(WidgetTester tester, String advisory) {
  final texts = [
    for (final w in tester.widgetList<Text>(find.byType(Text)))
      if (w.data != null) w.data!,
  ];
  expect(texts.any((t) => t.toLowerCase().contains('verified')), isFalse);
  // "proof" may appear only inside the advisory disclaimer itself.
  for (final t in texts.where((t) => t.toLowerCase().contains('proof'))) {
    expect(t, advisory);
  }
}

void main() {
  for (final s in [_en, _ar]) {
    final loc = s.locale.languageCode;

    testWidgets(
        'full flow in $loc: home to accepted in 2 transitions with device '
        'location and an advisory note (NFR-013, FR-017, FR-025)',
        (tester) async {
      final f = Fakes();
      final obs = await _pump(tester, f, s.locale);

      await _fillForm(tester, s);
      await _tap(tester, find.text(s.submit)); // form -> status

      expect(find.byType(ActivityStatusScreen), findsOneWidget);
      expect(find.byType(RecordActivityScreen), findsNothing);
      expect(obs.count, lessThanOrEqualTo(4)); // NFR-013
      expect(obs.count, 2);

      final sent = f.api.submits.single;
      expect(sent.key, isNotEmpty);
      expect(sent.request.activityTypeId, 't-clean');
      expect(sent.request.location.toJson()['source'], 'device');
      expect(sent.request.photos.map((p) => p.kind), ['before', 'after']);

      // Advisory note visible, no "verified" or stand-alone "proof" wording.
      expect(find.text(s.advisory), findsOneWidget);
      if (loc == 'en') _expectNoVerifiedWording(tester, s.advisory);
      expect(tester.takeException(), isNull); // no overflow at 360 px

      // Status polls submitted -> pending -> accepted without leaving.
      final t = f.api.types.firstWhere((t) => t.id == 't-clean');
      f.api.activities = [
        viewFor(t,
            id: 'created-1', status: ActivityStatus.pendingTechnicalProcessing)
      ];
      await tester.pump(const Duration(seconds: 3));
      expect(find.text(s.processing), findsOneWidget);
      f.api.activities = [
        viewFor(t, id: 'created-1', status: ActivityStatus.accepted)
      ];
      await tester.pump(const Duration(seconds: 3));
      expect(find.text(s.accepted), findsOneWidget);
      expect(find.byType(ActivityStatusScreen), findsOneWidget);
      expect(obs.count, 2); // polling is not navigation
      expect(tester.takeException(), isNull);
      if (loc == 'ar') {
        expect(
            Directionality.of(
                tester.element(find.byType(ActivityStatusScreen))),
            TextDirection.rtl);
      }
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets(
        'denied location in $loc: manual emirate then status screen '
        '(FR-012, NFR-007, NFR-025)', (tester) async {
      final f = Fakes(location: FakeLocationProvider(position: null));
      final obs = await _pump(tester, f, s.locale);
      await _fillForm(tester, s);
      await _tap(tester, find.text(s.submit));

      expect(find.textContaining(s.fallback), findsOneWidget);
      expect(f.api.submits, isEmpty);
      expect(find.byType(RecordActivityScreen), findsOneWidget);
      expect(tester.takeException(), isNull);

      await _tap(tester, find.byKey(const ValueKey('emirate')));
      await tester.tap(find.text(s.dubai).last);
      await tester.pumpAndSettle();
      await _enter(tester, 'field-area', 'Al Safa');
      await _tap(tester, find.text(s.submit));

      expect(find.byType(ActivityStatusScreen), findsOneWidget);
      expect(obs.count, 2);
      expect(f.api.submits.single.request.location.toJson(), {
        'source': 'manual',
        'emirate': 'Dubai',
        'area': 'Al Safa',
      });
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets(
        'retry after a network error reuses the Idempotency-Key and creates '
        'one record in $loc (FR-015)', (tester) async {
      final f = Fakes();
      f.api.submitErrors
          .add(const ApiException(status: 0, code: ApiException.networkCode));
      await _pump(tester, f, s.locale);
      await _fillForm(tester, s);
      await _tap(tester, find.text(s.submit));

      expect(f.api.submits, hasLength(1));
      expect(find.byType(RecordActivityScreen), findsOneWidget);
      expect(tester.takeException(), isNull);
      // Entered values survive the failure.
      expect(_text(tester, 'field-description'), s.description);
      expect(find.text(s.added), findsNWidgets(2));

      await _tap(tester, find.text(s.submit));
      expect(f.api.submits, hasLength(2));
      expect(f.api.submits[1].key, f.api.submits[0].key);
      expect(f.api.activities, hasLength(1));
      expect(find.byType(ActivityStatusScreen), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets(
        '422 errors show under their fields and keep every value in $loc '
        '(FR-023)', (tester) async {
      final f = Fakes();
      f.api.submitErrors.add(const ApiException(
        status: 422,
        code: 'validation.failed',
        fieldErrors: [
          FieldError(field: 'description', code: 'description.tooLong'),
          FieldError(
            field: 'amount.value',
            code: 'amount.outOfRange',
            params: {'min': 1, 'max': 2, 'unit': 'bags'},
          ),
        ],
      ));
      await _pump(tester, f, s.locale);
      await _fillForm(tester, s);
      await _tap(tester, find.text(s.submit));

      expect(f.api.submits, hasLength(1));
      expect(find.byType(RecordActivityScreen), findsOneWidget);
      final tooLong = find.text(s.tooLong);
      expect(tooLong, findsOneWidget);

      double y(Finder x) => tester.getTopLeft(x).dy;
      final descY = y(find.byKey(const ValueKey('field-description')));
      final amountY = y(find.byKey(const ValueKey('field-amount')));
      // Description error sits below the description and above the amount.
      expect(y(tooLong), greaterThan(descY));
      expect(y(tooLong), lessThan(amountY));

      // The amount error sits below the amount field, above the photos.
      final amountErr = find.byWidgetPredicate((w) =>
          w is Text &&
          (w.data ?? '')
              .startsWith(loc == 'en' ? 'Enter between' : 'أدخل قيمة'));
      expect(amountErr, findsOneWidget);
      expect(y(amountErr), greaterThan(amountY));
      expect(y(amountErr), lessThan(y(find.text(s.before))));
      if (loc == 'en') {
        expect(find.text('Please fix the highlighted fields.'), findsOneWidget);
      }

      expect(_text(tester, 'field-description'), s.description);
      expect(_text(tester, 'field-amount'), '3');
      expect(find.text(s.added), findsNWidgets(2));
      expect(tester.takeException(), isNull);
    });
  }
}
