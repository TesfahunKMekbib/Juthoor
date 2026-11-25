import 'dart:typed_data';
import 'dart:ui' show Locale;

/// Text in both app languages, as sent by the backend.
class Bilingual {
  final String en;
  final String ar;
  const Bilingual({required this.en, required this.ar});

  factory Bilingual.fromJson(Object? json) {
    final m = (json as Map?) ?? const {};
    final en = (m['en'] as String?) ?? '';
    return Bilingual(en: en, ar: (m['ar'] as String?) ?? en);
  }

  /// Text for [locale]; falls back to English when the Arabic text is empty.
  String of(Locale locale) =>
      locale.languageCode == 'ar' && ar.isNotEmpty ? ar : en;
}

/// One extra question on the form (FR-011).
class FormFieldDef {
  final String key;
  final Bilingual label;
  final String type; // text | number | choice
  final List<String> options;
  final bool required;
  const FormFieldDef({
    required this.key,
    required this.label,
    required this.type,
    this.options = const [],
    this.required = false,
  });

  factory FormFieldDef.fromJson(Map<String, dynamic> j) => FormFieldDef(
        key: j['key'] as String,
        label: Bilingual.fromJson(j['label']),
        type: (j['type'] as String?) ?? 'text',
        options: ((j['options'] as List?) ?? const []).cast<String>(),
        required: (j['required'] as bool?) ?? false,
      );
}

/// What is counted, its unit and allowed range (FR-018).
class AmountRule {
  final String unit;
  final num min;
  final num max;
  const AmountRule({required this.unit, required this.min, required this.max});

  factory AmountRule.fromJson(Map<String, dynamic> j) => AmountRule(
        unit: j['unit'] as String,
        min: j['min'] as num,
        max: j['max'] as num,
      );
}

class PhotoSlotSpec {
  final String kind;
  final bool required;
  const PhotoSlotSpec({required this.kind, required this.required});
}

/// How many photos and which kinds are needed (FR-021).
class PhotoRules {
  final int minPhotos;
  final int maxPhotos;
  final List<String> neededKinds;
  final num maxSizeMB;
  const PhotoRules({
    required this.minPhotos,
    required this.maxPhotos,
    this.neededKinds = const [],
    this.maxSizeMB = 8,
  });

  factory PhotoRules.fromJson(Map<String, dynamic> j) => PhotoRules(
        minPhotos: (j['minPhotos'] as num).toInt(),
        maxPhotos: (j['maxPhotos'] as num).toInt(),
        neededKinds: ((j['neededKinds'] as List?) ?? const []).cast<String>(),
        maxSizeMB: (j['maxSizeMB'] as num?) ?? 8,
      );

  /// Photo slots in upload order: one per needed kind, otherwise
  /// [maxPhotos] generic slots of which the first [minPhotos] are required.
  List<PhotoSlotSpec> get slots {
    if (neededKinds.isNotEmpty) {
      return [
        for (final k in neededKinds.take(maxPhotos))
          PhotoSlotSpec(kind: k, required: true),
      ];
    }
    return [
      for (var i = 0; i < maxPhotos; i++)
        PhotoSlotSpec(kind: 'photo', required: i < minPhotos),
    ];
  }
}

/// A published activity type with its rules (FR-009).
class ActivityType {
  final String id;
  final String code;
  final String category;
  final Bilingual name;
  final List<FormFieldDef> formFields;
  final AmountRule amount;
  final PhotoRules photoRules;
  const ActivityType({
    required this.id,
    required this.code,
    required this.category,
    required this.name,
    required this.formFields,
    required this.amount,
    required this.photoRules,
  });

  factory ActivityType.fromJson(Map<String, dynamic> j) => ActivityType(
        id: ((j['id'] ?? j['_id']) as String),
        code: j['code'] as String,
        category: j['category'] as String,
        name: Bilingual.fromJson(j['name']),
        formFields: ((j['formFields'] as List?) ?? const [])
            .map((e) => FormFieldDef.fromJson(e as Map<String, dynamic>))
            .toList(),
        amount: AmountRule.fromJson(j['amount'] as Map<String, dynamic>),
        photoRules:
            PhotoRules.fromJson(j['photoRules'] as Map<String, dynamic>),
      );
}

/// Status values from the API contract (plan section 1).
enum ActivityStatus {
  submitted,
  accepted,
  returnedForCorrection,
  rejected,
  pendingTechnicalProcessing,
  draft;

  static ActivityStatus parse(String? raw) => switch (raw) {
        'accepted' => accepted,
        'returned_for_correction' => returnedForCorrection,
        'rejected' => rejected,
        'pending_technical_processing' => pendingTechnicalProcessing,
        'draft' => draft,
        _ => submitted,
      };

  /// True while the verification outcome is still to come.
  bool get isInProgress =>
      this == submitted || this == pendingTechnicalProcessing;
}

class ActivityTypeRef {
  final String id;
  final String code;
  final String category;
  final Bilingual name;
  const ActivityTypeRef({
    required this.id,
    required this.code,
    required this.category,
    required this.name,
  });

  factory ActivityTypeRef.fromJson(Map<String, dynamic> j) => ActivityTypeRef(
        id: (j['id'] as String?) ?? '',
        code: (j['code'] as String?) ?? '',
        category: (j['category'] as String?) ?? '',
        name: Bilingual.fromJson(j['name']),
      );
}

class AnswerView {
  final String key;
  final Bilingual label;
  final Object? value;
  const AnswerView({required this.key, required this.label, this.value});

  factory AnswerView.fromJson(Map<String, dynamic> j) => AnswerView(
        key: j['key'] as String,
        label: Bilingual.fromJson(j['label']),
        value: j['value'],
      );
}

class AmountView {
  final num value;
  final String unit;
  const AmountView({required this.value, required this.unit});

  factory AmountView.fromJson(Map<String, dynamic> j) =>
      AmountView(value: j['value'] as num, unit: (j['unit'] as String?) ?? '');
}

class PhotoView {
  final String id;
  final String kind;
  final String url;
  const PhotoView({required this.id, required this.kind, required this.url});

  factory PhotoView.fromJson(Map<String, dynamic> j) => PhotoView(
        id: j['id'] as String,
        kind: (j['kind'] as String?) ?? 'photo',
        url: (j['url'] as String?) ?? '',
      );
}

/// The stored activity as returned by the API (FR-017). The location is the
/// generalised emirate/area only (NFR-007).
class ActivityView {
  final String id;
  final ActivityStatus status;
  final String? resultReasonCode;
  final ActivityTypeRef activityType;
  final String description;
  final DateTime? doneAt;
  final String? emirate;
  final String? area;
  final List<AnswerView> answers;
  final AmountView? amount;
  final AmountView? acceptedAmount;
  final List<PhotoView> photos;
  final DateTime? submittedAt;
  final DateTime? updatedAt;
  const ActivityView({
    required this.id,
    required this.status,
    this.resultReasonCode,
    required this.activityType,
    this.description = '',
    this.doneAt,
    this.emirate,
    this.area,
    this.answers = const [],
    this.amount,
    this.acceptedAmount,
    this.photos = const [],
    this.submittedAt,
    this.updatedAt,
  });

  factory ActivityView.fromJson(Map<String, dynamic> j) {
    final loc = j['location'] as Map<String, dynamic>?;
    DateTime? date(Object? v) => v is String ? DateTime.tryParse(v) : null;
    AmountView? amt(Object? v) =>
        v is Map<String, dynamic> ? AmountView.fromJson(v) : null;
    return ActivityView(
      id: j['id'] as String,
      status: ActivityStatus.parse(j['status'] as String?),
      resultReasonCode: j['resultReasonCode'] as String?,
      activityType:
          ActivityTypeRef.fromJson(j['activityType'] as Map<String, dynamic>),
      description: (j['description'] as String?) ?? '',
      doneAt: date(j['doneAt']),
      emirate: loc?['emirate'] as String?,
      area: loc?['area'] as String?,
      answers: ((j['answers'] as List?) ?? const [])
          .map((e) => AnswerView.fromJson(e as Map<String, dynamic>))
          .toList(),
      amount: amt(j['amount']),
      acceptedAmount: amt(j['acceptedAmount']),
      photos: ((j['photos'] as List?) ?? const [])
          .map((e) => PhotoView.fromJson(e as Map<String, dynamic>))
          .toList(),
      submittedAt: date(j['submittedAt']),
      updatedAt: date(j['updatedAt']),
    );
  }
}

/// Where the activity happened (FR-012, FR-020). Device coordinates are only
/// carried to the request and are never displayed, stored or logged
/// (NFR-007, ADR-0006).
sealed class LocationInput {
  final String? area;
  const LocationInput({this.area});
  Map<String, dynamic> toJson();
}

class DeviceLocation extends LocationInput {
  final double lat;
  final double lng;
  const DeviceLocation({required this.lat, required this.lng, super.area});

  @override
  Map<String, dynamic> toJson() => {
        'source': 'device',
        'coordinates': {'lat': lat, 'lng': lng},
        if (area != null && area!.isNotEmpty) 'area': area,
      };

  @override
  String toString() => 'DeviceLocation(redacted)';
}

class ManualLocation extends LocationInput {
  final String emirate;
  const ManualLocation({required this.emirate, super.area});

  @override
  Map<String, dynamic> toJson() => {
        'source': 'manual',
        'emirate': emirate,
        if (area != null && area!.isNotEmpty) 'area': area,
      };
}

/// One evidence image held in memory until submission.
class PhotoUpload {
  final String kind;
  final String fileName;
  final String mimeType;
  final Uint8List bytes;
  const PhotoUpload({
    required this.kind,
    required this.fileName,
    required this.mimeType,
    required this.bytes,
  });
}

/// The `data` part of POST /api/activities plus its photos (plan section 1).
class SubmissionRequest {
  final String activityTypeId;
  final String description;
  final DateTime doneAt;
  final LocationInput location;
  final Map<String, Object> answers;
  final num amount;
  final List<PhotoUpload> photos; // order = photoKinds

  const SubmissionRequest({
    required this.activityTypeId,
    required this.description,
    required this.doneAt,
    required this.location,
    required this.answers,
    required this.amount,
    required this.photos,
  });

  Map<String, dynamic> toJson() => {
        'activityTypeId': activityTypeId,
        'description': description,
        'doneAt': isoWithOffset(doneAt),
        'location': location.toJson(),
        'answers': answers,
        'amount': {'value': amount},
        'photoKinds': photos.map((p) => p.kind).toList(),
      };
}

/// ISO-8601 with the local UTC offset, e.g. `2026-11-24T07:30:00+04:00`.
String isoWithOffset(DateTime t) {
  final local = t.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  final off = local.timeZoneOffset;
  final sign = off.isNegative ? '-' : '+';
  final abs = off.abs();
  return '${local.year.toString().padLeft(4, '0')}-${two(local.month)}-'
      '${two(local.day)}T${two(local.hour)}:${two(local.minute)}:'
      '${two(local.second)}$sign${two(abs.inHours)}:${two(abs.inMinutes % 60)}';
}
