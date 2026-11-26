import 'package:flutter_test/flutter_test.dart';
import 'package:juthoor/models/activity_models.dart';
import 'package:juthoor/screens/my_activities_screen.dart';
import 'package:juthoor/services/device_services.dart';
import 'package:juthoor/state/activity_form_controller.dart';

import '../fakes/fake_activity_api.dart';

ActivityType otherType() => const ActivityType(
      id: 't-other',
      code: 'OTHER',
      category: 'other',
      name: Bilingual(en: 'Other', ar: 'أخرى'),
      formFields: [
        FormFieldDef(
          key: 'activityName',
          label: Bilingual(en: 'Activity name', ar: 'اسم النشاط'),
          type: 'text',
          required: true,
        ),
      ],
      amount: AmountRule(
        min: 0.01,
        max: 100000,
        optional: true,
        units: ['items', 'kg', 'bags', 'liters', 'kWh', 'm2', 'other'],
      ),
      photoRules: PhotoRules(
        minPhotos: 1,
        maxPhotos: 1,
        neededKinds: ['photo'],
      ),
    );

Future<(ActivityFormController, Fakes)> _filled() async {
  final f = Fakes(api: FakeActivityApi(types: [plantingType(), otherType()]));
  final c = ActivityFormController(
    api: f.api,
    locationProvider: f.location,
    photoPicker: f.photos,
    now: () => DateTime(2026, 11, 25, 12),
    newIdempotencyKey: () => 'k1',
  );
  await c.loadTypes();
  c.selectCategory('other');
  c.setDescription('Repaired a bike');
  c.setAnswer('activityName', '  Bike repair ');
  c.setEmirate('Dubai');
  await c.pickPhoto(0, PhotoSource.camera);
  return (c, f);
}

void main() {
  test('Other without quantity omits amount from the payload', () async {
    final (c, f) = await _filled();
    expect(await c.submit(), isNotNull);
    final json = f.api.submits.single.request.toJson();
    expect(json.containsKey('amount'), isFalse);
    expect(json['answers'], {'activityName': 'Bike repair'});
    expect(json['activityTypeId'], 't-other');
  });

  test('Other with quantity sends value and unit', () async {
    final (c, f) = await _filled();
    c.setAmount('2.5');
    c.setAmountUnit('kg');
    expect(await c.submit(), isNotNull);
    expect(f.api.submits.single.request.toJson()['amount'],
        {'value': 2.5, 'unit': 'kg'});
  });

  test('quantity without unit is blocked; name is required and max 60',
      () async {
    final (c, f) = await _filled();
    c.setAmount('2');
    expect(await c.submit(), isNull);
    expect(c.errors.map((e) => e.code), ['amount.unitRequired']);
    expect(f.api.submits, isEmpty);

    c.setAnswer('activityName', ' ');
    expect(c.validate().map((e) => e.code), contains('answers.required'));
    c.setAnswer('activityName', 'x' * 61);
    expect(c.validate().map((e) => e.code), contains('answers.tooLong'));
    c.setAnswer('activityName', 'x' * 60);
    expect(c.validate().map((e) => e.code), isNot(contains('answers.tooLong')));
  });

  testWidgets('list shows the custom name instead of the type name',
      (tester) async {
    final base = viewFor(otherType());
    final f = Fakes();
    f.api.activities = [
      ActivityView(
        id: 'o1',
        status: ActivityStatus.submitted,
        activityType: base.activityType,
        answers: const [
          AnswerView(
            key: 'activityName',
            label: Bilingual(en: 'Activity name', ar: 'اسم النشاط'),
            value: 'Bike repair',
          ),
        ],
        submittedAt: DateTime(2026, 11, 24, 8),
      ),
    ];
    await pumpWithFakes(tester, const MyActivitiesScreen(), f);
    expect(find.text('Bike repair'), findsOneWidget);
    expect(find.text('Other'), findsNothing);
  });
}
