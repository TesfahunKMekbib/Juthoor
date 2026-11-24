import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:juthoor/models/activity_models.dart';
import 'package:juthoor/services/api_exception.dart';
import 'package:juthoor/services/device_services.dart';
import 'package:juthoor/state/activity_form_controller.dart';

import '../fakes/fake_activity_api.dart';

final _now = DateTime(2026, 11, 25, 12);

(ActivityFormController, Fakes) _make({Fakes? fakes}) {
  final f = fakes ?? Fakes();
  var n = 0;
  final c = ActivityFormController(
    api: f.api,
    locationProvider: f.location,
    photoPicker: f.photos,
    now: () => _now,
    newIdempotencyKey: () => 'key-${++n}',
  );
  return (c, f);
}

Future<ActivityFormController> _filled(Fakes f) async {
  final (c, _) = _make(fakes: f);
  await c.loadTypes();
  c.setDescription('Planted 3 ghaf seedlings');
  c.setAnswer('species', 'Ghaf');
  c.setAmount('3');
  await c.pickPhoto(0, PhotoSource.camera);
  return c;
}

void main() {
  test('loads types and offers only supported categories (Q-A4b)', () async {
    final api = FakeActivityApi(types: [
      plantingType(),
      cleanupType(),
      const ActivityType(
        id: 't-tr',
        code: 'METRO',
        category: 'transport',
        name: Bilingual(en: 'Metro', ar: 'المترو'),
        formFields: [],
        amount: AmountRule(unit: 'trips', min: 1, max: 5),
        photoRules: PhotoRules(minPhotos: 1, maxPhotos: 1),
      ),
    ]);
    final (c, _) = _make(fakes: Fakes(api: api));
    await c.loadTypes();
    expect(c.categories, ['planting', 'cleanup']);
    expect(c.category, 'planting');
    expect(c.type?.code, 'TREE_PLANTING');
  });

  test('records a load failure and can retry (FR-009)', () async {
    final f = Fakes();
    f.api.listTypesError =
        const ApiException(status: 0, code: ApiException.networkCode);
    final (c, _) = _make(fakes: f);
    await c.loadTypes();
    expect(c.loadError?.code, ApiException.networkCode);
    f.api.listTypesError = null;
    await c.loadTypes();
    expect(c.loadError, isNull);
    expect(c.types, isNotEmpty);
  });

  test('changing type resets dependent fields but keeps description', () async {
    final (c, _) = _make();
    await c.loadTypes();
    c.setDescription('keep me');
    c.setAnswer('species', 'Ghaf');
    c.setAmount('3');
    await c.pickPhoto(0, PhotoSource.gallery);
    c.selectCategory('cleanup');
    expect(c.type?.code, 'BEACH_CLEANUP');
    expect(c.answers, isEmpty);
    expect(c.amountText, '');
    expect(c.photos, isEmpty);
    expect(c.description, 'keep me');
  });

  test('flags missing and out-of-range input (FR-011, FR-018, FR-021)',
      () async {
    final (c, _) = _make();
    await c.loadTypes();
    var codes = c.validate().map((e) => e.code).toList();
    expect(
        codes,
        containsAll([
          'description.required',
          'answers.required',
          'amount.required',
          'photos.tooFew',
        ]));
    c.setDescription('x');
    c.setAnswer('species', 'Ghaf');
    await c.pickPhoto(0, PhotoSource.camera);
    for (final (text, ok) in [
      ('0.99', false),
      ('1', true),
      ('50', true),
      ('50.01', false),
      ('3,5', true),
    ]) {
      c.setAmount(text);
      expect(c.validate().any((e) => e.code == 'amount.outOfRange'), !ok,
          reason: text);
    }
    c.setAmount('51');
    final e = c.validate().firstWhere((e) => e.code == 'amount.outOfRange');
    expect(e.params, {'min': 1, 'max': 50, 'unit': 'trees'});
    codes = c.validate().map((e) => e.code).toList();
    expect(codes, isNot(contains('photos.tooFew')));
  });

  test('number and choice answers are checked (FR-011)', () async {
    final api = FakeActivityApi(types: [
      const ActivityType(
        id: 't',
        code: 'T',
        category: 'water',
        name: Bilingual(en: 'W', ar: 'W'),
        formFields: [
          FormFieldDef(
              key: 'n', label: Bilingual(en: 'N', ar: 'N'), type: 'number'),
          FormFieldDef(
              key: 'c',
              label: Bilingual(en: 'C', ar: 'C'),
              type: 'choice',
              options: ['a']),
        ],
        amount: AmountRule(unit: 'liters', min: 1, max: 9),
        photoRules: PhotoRules(minPhotos: 0, maxPhotos: 1),
      ),
    ]);
    final (c, _) = _make(fakes: Fakes(api: api));
    await c.loadTypes();
    c.setDescription('d');
    c.setAmount('2');
    c.setAnswer('n', 'abc');
    c.setAnswer('c', 'zzz');
    final codes = c.validate().map((e) => e.code);
    expect(codes, containsAll(['answers.notNumber', 'answers.invalidChoice']));
  });

  test('rejects a future occurrence time at once (FR-019)', () async {
    final (c, _) = _make();
    await c.loadTypes();
    c.setDoneAt(_now.add(const Duration(minutes: 1)));
    expect(c.errorsFor('doneAt').single.code, 'doneAt.future');
    c.setDoneAt(_now.subtract(const Duration(minutes: 1)));
    expect(c.errorsFor('doneAt'), isEmpty);
  });

  test('refuses a photo over the type size limit (FR-021)', () async {
    final f =
        Fakes(photos: FakePhotoPicker(bytes: Uint8List(8 * 1024 * 1024 + 1)));
    final (c, _) = _make(fakes: f);
    await c.loadTypes();
    await c.pickPhoto(0, PhotoSource.gallery);
    expect(c.photos, isEmpty);
    expect(c.errorsFor('photos').single.code, 'photos.tooLarge');
  });

  test('a picker failure is reported without losing state', () async {
    final f = Fakes();
    final (c, _) = _make(fakes: f);
    await c.loadTypes();
    f.photos.fail = true;
    await c.pickPhoto(0, PhotoSource.camera);
    expect(c.photoPickFailed, isTrue);
  });

  test('submits with the device location and a generated key (FR-012, FR-015)',
      () async {
    final f = Fakes();
    final c = await _filled(f);
    final view = await c.submit();
    expect(view, isNotNull);
    expect(f.location.calls, 1);
    final sent = f.api.submits.single;
    expect(sent.key, 'key-1');
    expect(sent.request.location, isA<DeviceLocation>());
    expect(sent.request.answers, {'species': 'Ghaf'});
    expect(sent.request.amount, 3);
    expect(sent.request.photos.single.kind, 'photo');
    expect(c.idempotencyKey, isNull);
  });

  test('location is requested only on submit, not on input (FR-012)', () async {
    final f = Fakes();
    final c = await _filled(f);
    expect(f.location.calls, 0);
    // An invalid form never asks for permission either.
    c.setAmount('');
    await c.submit();
    expect(f.location.calls, 0);
  });

  test('denied location switches to manual entry and keeps data (FR-012)',
      () async {
    final f = Fakes(location: FakeLocationProvider(position: null));
    final c = await _filled(f);
    expect(await c.submit(), isNull);
    expect(c.manualLocation, isTrue);
    expect(c.locationFallback, isTrue);
    expect(f.api.submits, isEmpty);
    expect(c.description, 'Planted 3 ghaf seedlings');
    expect(c.photos, hasLength(1));

    c.setEmirate('Dubai');
    c.setArea('Al Safa');
    expect(await c.submit(), isNotNull);
    final loc = f.api.submits.single.request.location;
    expect(loc, isA<ManualLocation>());
    expect((loc as ManualLocation).emirate, 'Dubai');
    expect(loc.toJson().containsKey('coordinates'), isFalse);
    expect(f.location.calls, 1);
  });

  test('keeps entered data after validation errors (FR-023)', () async {
    final f = Fakes();
    final c = await _filled(f);
    f.api.submitErrors.add(const ApiException(
      status: 422,
      code: 'validation.failed',
      fieldErrors: [
        FieldError(
          field: 'amount.value',
          code: 'amount.outOfRange',
          params: {'min': 1, 'max': 2, 'unit': 'trees'},
        ),
        FieldError(
          field: 'answers.species',
          code: 'answers.tooLong',
          params: {'fieldKey': 'species'},
        ),
        FieldError(field: 'mystery', code: 'x.y'),
      ],
    ));
    expect(await c.submit(), isNull);
    expect(c.generalErrorCode, 'validation.failed');
    expect(c.errorsFor('amount').single.code, 'amount.outOfRange');
    expect(c.answerErrors('species').single.code, 'answers.tooLong');
    expect(c.unplacedErrors.single.field, 'mystery');
    expect(c.description, 'Planted 3 ghaf seedlings');
    expect(c.amountText, '3');
    expect(c.answers['species'], 'Ghaf');
    expect(c.photos, hasLength(1));
    expect(c.submitting, isFalse);
  });

  test(
      'retry reuses the Idempotency-Key and replay returns one record (FR-015)',
      () async {
    final f = Fakes();
    final c = await _filled(f);
    f.api.submitErrors
        .add(const ApiException(status: 0, code: ApiException.networkCode));
    expect(await c.submit(), isNull);
    expect(c.generalErrorCode, ApiException.networkCode);
    expect(c.idempotencyKey, 'key-1');

    final first = await c.submit();
    expect(f.api.submits.map((s) => s.key), ['key-1', 'key-1']);
    expect(first, isNotNull);

    // A new submission after success gets a new key.
    c.setAmount('4');
    await c.submit();
    expect(f.api.submits.last.key, 'key-2');
  });

  test('generates distinct version-4 style keys', () {
    final a = generateIdempotencyKey();
    expect(
        a,
        matches(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'));
    expect(generateIdempotencyKey(), isNot(a));
  });
}
