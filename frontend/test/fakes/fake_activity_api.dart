import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:juthoor/models/activity_models.dart';
import 'package:juthoor/services/activity_api.dart';
import 'package:juthoor/services/api_exception.dart';
import 'package:juthoor/services/device_services.dart';
import 'package:provider/provider.dart';

import '../helpers/pump_app.dart';

/// 1x1 transparent PNG so Image.memory decodes in tests.
final Uint8List tinyPng = Uint8List.fromList(const [
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, //
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
  0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
]);

const bilingualTree = Bilingual(en: 'Tree planting', ar: 'زراعة الأشجار');

ActivityType plantingType() => const ActivityType(
      id: 't-plant',
      code: 'TREE_PLANTING',
      category: 'planting',
      name: bilingualTree,
      formFields: [
        FormFieldDef(
          key: 'species',
          label: Bilingual(en: 'Species', ar: 'النوع'),
          type: 'text',
          required: true,
        ),
      ],
      amount: AmountRule(unit: 'trees', min: 1, max: 50),
      photoRules: PhotoRules(
        minPhotos: 1,
        maxPhotos: 1,
        neededKinds: ['photo'],
        maxSizeMB: 8,
      ),
    );

ActivityType cleanupType() => const ActivityType(
      id: 't-clean',
      code: 'BEACH_CLEANUP',
      category: 'cleanup',
      name: Bilingual(en: 'Beach clean-up', ar: 'تنظيف الشاطئ'),
      formFields: [
        FormFieldDef(
          key: 'site',
          label: Bilingual(en: 'Site type', ar: 'نوع الموقع'),
          type: 'choice',
          options: ['Beach', 'Park'],
          required: true,
        ),
      ],
      amount: AmountRule(unit: 'bags', min: 1, max: 100),
      photoRules: PhotoRules(
        minPhotos: 2,
        maxPhotos: 2,
        neededKinds: ['before', 'after'],
      ),
    );

ActivityView viewFor(
  ActivityType t, {
  String id = 'a1',
  ActivityStatus status = ActivityStatus.submitted,
  String? reason,
  num amount = 3,
}) =>
    ActivityView(
      id: id,
      status: status,
      resultReasonCode: reason,
      activityType: ActivityTypeRef(
        id: t.id,
        code: t.code,
        category: t.category,
        name: t.name,
      ),
      description: 'Planted 3 ghaf seedlings',
      doneAt: DateTime(2026, 11, 24, 7, 30),
      emirate: 'Abu Dhabi',
      area: 'Al Reem',
      amount: AmountView(value: amount, unit: t.amount.unit),
      acceptedAmount: status == ActivityStatus.accepted
          ? AmountView(value: amount, unit: t.amount.unit)
          : null,
      submittedAt: DateTime(2026, 11, 24, 8),
    );

/// Hermetic stand-in for the backend (plan section 1).
class FakeActivityApi implements ActivityApi {
  FakeActivityApi({List<ActivityType>? types, List<ActivityView>? activities})
      : types = types ?? [plantingType(), cleanupType()],
        activities = activities ?? [];

  List<ActivityType> types;
  List<ActivityView> activities;

  /// Errors thrown by the next submit calls, in order; then success.
  final List<ApiException> submitErrors = [];
  ApiException? listTypesError;
  ApiException? getError;

  final List<({SubmissionRequest request, String key})> submits = [];
  int listTypesCalls = 0;
  int getCalls = 0;

  /// Views by idempotency key, so a replay returns the same record (FR-015).
  final Map<String, ActivityView> _byKey = {};

  @override
  Future<List<ActivityType>> listActivityTypes() async {
    listTypesCalls++;
    final e = listTypesError;
    if (e != null) throw e;
    return types;
  }

  @override
  Future<ActivityView> submitActivity(
    SubmissionRequest request, {
    required String idempotencyKey,
  }) async {
    submits.add((request: request, key: idempotencyKey));
    if (submitErrors.isNotEmpty) throw submitErrors.removeAt(0);
    return _byKey.putIfAbsent(idempotencyKey, () {
      final t = types.firstWhere((t) => t.id == request.activityTypeId);
      final v = viewFor(t, id: 'created-${_byKey.length + 1}');
      activities.insert(0, v);
      return v;
    });
  }

  @override
  Future<List<ActivityView>> listActivities() async => activities;

  @override
  Future<ActivityView> getActivity(String id) async {
    getCalls++;
    final e = getError;
    if (e != null) throw e;
    return activities.firstWhere(
      (a) => a.id == id,
      orElse: () =>
          throw const ApiException(status: 404, code: 'activity.notFound'),
    );
  }
}

class FakeLocationProvider implements LocationProvider {
  FakeLocationProvider({this.position = const DeviceCoordinates(24.45, 54.38)});
  DeviceCoordinates? position;
  int calls = 0;

  @override
  Future<DeviceCoordinates?> currentPosition() async {
    calls++;
    return position;
  }
}

class FakePhotoPicker implements PhotoPicker {
  FakePhotoPicker({Uint8List? bytes}) : bytes = bytes ?? tinyPng;
  Uint8List bytes;
  bool fail = false;
  final List<PhotoSource> sources = [];

  @override
  Future<PhotoUpload?> pick(PhotoSource source, String kind) async {
    sources.add(source);
    if (fail) throw Exception('picker failed');
    return PhotoUpload(
      kind: kind,
      fileName: '$kind.png',
      mimeType: 'image/png',
      bytes: bytes,
    );
  }
}

class Fakes {
  Fakes({
    FakeActivityApi? api,
    FakeLocationProvider? location,
    FakePhotoPicker? photos,
  })  : api = api ?? FakeActivityApi(),
        location = location ?? FakeLocationProvider(),
        photos = photos ?? FakePhotoPicker();
  final FakeActivityApi api;
  final FakeLocationProvider location;
  final FakePhotoPicker photos;
}

/// Like [pumpApp] with the fake services provided to the widget tree.
Future<void> pumpWithFakes(
  WidgetTester tester,
  Widget child,
  Fakes fakes, {
  Locale locale = const Locale('en'),
}) {
  return pumpApp(
    tester,
    child,
    locale: locale,
    wrapApp: (app) => MultiProvider(
      providers: [
        Provider<ActivityApi>.value(value: fakes.api),
        Provider<LocationProvider>.value(value: fakes.location),
        Provider<PhotoPicker>.value(value: fakes.photos),
      ],
      child: app,
    ),
  );
}
