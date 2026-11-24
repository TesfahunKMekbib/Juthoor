import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:juthoor/models/activity_models.dart';
import 'package:juthoor/services/activity_api.dart';
import 'package:juthoor/services/api_exception.dart';

import '../fakes/fake_activity_api.dart';

const _typeJson = {
  'id': 't1',
  'code': 'TREE_PLANTING',
  'category': 'planting',
  'name': {'en': 'Tree planting', 'ar': 'زراعة الأشجار'},
  'formFields': [
    {
      'key': 'species',
      'label': {'en': 'Species', 'ar': 'النوع'},
      'type': 'text',
      'options': [],
      'required': true,
    },
  ],
  'amount': {'unit': 'trees', 'min': 1, 'max': 50},
  'photoRules': {
    'minPhotos': 1,
    'maxPhotos': 1,
    'neededKinds': ['photo'],
    'maxSizeMB': 8,
  },
};

const _viewJson = {
  'id': 'a1',
  'status': 'returned_for_correction',
  'resultReasonCode': 'verification.evidenceUnclear',
  'activityType': {
    'id': 't1',
    'code': 'TREE_PLANTING',
    'category': 'planting',
    'name': {'en': 'Tree planting', 'ar': 'x'},
  },
  'description': 'Planted',
  'doneAt': '2026-11-24T07:30:00+04:00',
  'location': {'emirate': 'Abu Dhabi', 'area': 'Al Reem'},
  'answers': [
    {
      'key': 'species',
      'label': {'en': 'Species', 'ar': 'النوع'},
      'value': 'Ghaf',
    },
  ],
  'amount': {'value': 3, 'unit': 'trees'},
  'acceptedAmount': null,
  'photos': [
    {'id': 'p1', 'kind': 'photo', 'url': '/api/activities/a1/photos/p1'},
  ],
  'submittedAt': '2026-11-24T08:00:00Z',
};

SubmissionRequest _request({LocationInput? location}) => SubmissionRequest(
      activityTypeId: 't1',
      description: 'Planted',
      doneAt: DateTime(2026, 11, 24, 7, 30),
      location: location ?? const ManualLocation(emirate: 'Dubai', area: 'X'),
      answers: const {'species': 'Ghaf'},
      amount: 3,
      photos: [
        PhotoUpload(
          kind: 'photo',
          fileName: 'p.png',
          mimeType: 'image/png',
          bytes: tinyPng,
        ),
      ],
    );

http.Response _json(int status, Object body) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

void main() {
  test('parses activity types with rules (FR-009)', () async {
    final api = HttpActivityApi(
      baseUrl: 'http://h:3000/',
      client: MockClient((r) async {
        expect(r.url.toString(), 'http://h:3000/api/activity-types');
        return _json(200, [_typeJson]);
      }),
    );
    final types = await api.listActivityTypes();
    expect(types.single.amount.max, 50);
    expect(types.single.formFields.single.required, isTrue);
    expect(types.single.photoRules.slots.single.kind, 'photo');
  });

  test('submits multipart with Idempotency-Key and no credentials (FR-015)',
      () async {
    late http.Request seen;
    final api = HttpActivityApi(
      baseUrl: 'http://h',
      client: MockClient((r) async {
        seen = r;
        return _json(201, _viewJson);
      }),
    );
    final view = await api.submitActivity(_request(), idempotencyKey: 'k-1');
    final body = latin1.decode(seen.bodyBytes);
    expect(seen.method, 'POST');
    expect(seen.url.path, '/api/activities');
    expect(seen.headers['Idempotency-Key'], 'k-1');
    expect(seen.headers.containsKey('Authorization'), isFalse);
    expect(seen.headers['content-type'], startsWith('multipart/form-data'));
    expect(body, contains('name="data"'));
    expect(body, contains('name="photos"'));
    expect(body, contains('"photoKinds":["photo"]'));
    expect(body, contains('"source":"manual"'));
    expect(view.status, ActivityStatus.returnedForCorrection);
    expect(view.emirate, 'Abu Dhabi');
    expect(view.answers.single.value, 'Ghaf');
  });

  test('device coordinates are sent but never printed (NFR-007)', () {
    const loc = DeviceLocation(lat: 24.45, lng: 54.38, area: 'Al Reem');
    expect(loc.toJson()['coordinates'], {'lat': 24.45, 'lng': 54.38});
    expect(loc.toString(), isNot(contains('24.45')));
    expect(loc.toString(), isNot(contains('54.38')));
  });

  test('422 becomes ApiException with coded field errors (FR-023)', () async {
    final api = HttpActivityApi(
      baseUrl: 'http://h',
      client: MockClient((r) async => _json(422, {
            'message': 'Please fix the highlighted fields.',
            'code': 'validation.failed',
            'errors': [
              {
                'field': 'amount.value',
                'code': 'amount.outOfRange',
                'message': 'Enter between 1 and 50 trees.',
                'params': {'min': 1, 'max': 50, 'unit': 'trees'},
              },
            ],
          })),
    );
    await expectLater(
      api.submitActivity(_request(), idempotencyKey: 'k'),
      throwsA(isA<ApiException>()
          .having((e) => e.status, 'status', 422)
          .having((e) => e.code, 'code', 'validation.failed')
          .having((e) => e.fieldErrors.single.params['max'], 'max', 50)),
    );
  });

  test('non-JSON error and network failure map to coded exceptions', () async {
    final bad = HttpActivityApi(
      baseUrl: 'http://h',
      client: MockClient((r) async => http.Response('<html>', 502)),
    );
    await expectLater(bad.getActivity('x'),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'unknown')));
    final down = HttpActivityApi(
      baseUrl: 'http://h',
      client: MockClient((r) async => throw http.ClientException('no route')),
    );
    await expectLater(
        down.listActivities(),
        throwsA(isA<ApiException>()
            .having((e) => e.code, 'code', ApiException.networkCode)
            .having((e) => e.status, 'status', 0)));
  });

  test('lists and reads activities (FR-017)', () async {
    final api = HttpActivityApi(
      baseUrl: 'http://h',
      client: MockClient((r) async => r.url.path == '/api/activities'
          ? _json(200, {
              'items': [_viewJson]
            })
          : _json(200, _viewJson)),
    );
    expect((await api.listActivities()).single.id, 'a1');
    expect((await api.getActivity('a1')).photos.single.id, 'p1');
  });

  test('doneAt is sent with an explicit UTC offset (FR-019)', () {
    final s = isoWithOffset(DateTime(2026, 11, 24, 7, 30));
    expect(s, matches(r'^2026-11-24T07:30:00[+-]\d{2}:\d{2}$'));
  });
}
