import 'dart:math';

import 'package:flutter/foundation.dart';

import '../models/activity_models.dart';
import '../services/activity_api.dart';
import '../services/api_exception.dart';
import '../services/device_services.dart';

// TODO(Q-A4b): 'Transport' and 'Other' are not approved FR-007 categories and
// are hidden by owner decision. Only these categories are offered, whatever
// the API returns. Revisit when Q-A4b is decided.
const supportedCategories = [
  'planting',
  'recycling',
  'waste',
  'water',
  'energy',
  'cleanup',
];

/// The seven emirates the backend accepts (FR-012, FR-020).
const emirates = [
  'Abu Dhabi',
  'Dubai',
  'Sharjah',
  'Ajman',
  'Umm Al Quwain',
  'Ras Al Khaimah',
  'Fujairah',
];

/// Random version-4 style id used as the Idempotency-Key (FR-015).
String generateIdempotencyKey([Random? random]) {
  final r = random ?? Random.secure();
  final b = List<int>.generate(16, (_) => r.nextInt(256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  String h(int from, int to) => b
      .sublist(from, to)
      .map((x) => x.toRadixString(16).padLeft(2, '0'))
      .join();
  return '${h(0, 4)}-${h(4, 6)}-${h(6, 8)}-${h(8, 10)}-${h(10, 16)}';
}

/// State of the Add an Activity form (FR-009–012, FR-015, FR-019, FR-023).
/// Every entered value and photo is kept after a failed submission.
class ActivityFormController extends ChangeNotifier {
  ActivityFormController({
    required this.api,
    required this.locationProvider,
    required this.photoPicker,
    DateTime Function()? now,
    String Function()? newIdempotencyKey,
  })  : _now = now ?? DateTime.now,
        _newKey = newIdempotencyKey ?? generateIdempotencyKey {
    doneAt = _now();
  }

  final ActivityApi api;
  final LocationProvider locationProvider;
  final PhotoPicker photoPicker;
  final DateTime Function() _now;
  final String Function() _newKey;

  // Activity types
  bool loadingTypes = false;
  ApiException? loadError;
  List<ActivityType> _types = const [];

  // Form values
  String? category;
  ActivityType? type;
  String description = '';
  final Map<String, String> answers = {};
  String amountText = '';
  late DateTime doneAt;
  final Map<int, PhotoUpload> photos = {};
  bool manualLocation = false;
  bool locationFallback = false;
  String? emirate;
  String area = '';

  // Submission state
  bool submitting = false;
  bool photoPickFailed = false;
  String? generalErrorCode;
  List<FieldError> errors = const [];
  String? _idempotencyKey;

  /// Key sent with the current submission attempt; reused on retry (FR-015)
  /// and discarded after success.
  String? get idempotencyKey => _idempotencyKey;

  List<ActivityType> get types => _types;

  /// Categories offered as chips, in the fixed supported order.
  List<String> get categories => [
        for (final c in supportedCategories)
          if (_types.any((t) => t.category == c)) c,
      ];

  List<ActivityType> get typesInCategory =>
      _types.where((t) => t.category == category).toList();

  Future<void> loadTypes() async {
    loadingTypes = true;
    loadError = null;
    notifyListeners();
    try {
      _types = await api.listActivityTypes();
      final cats = categories;
      if (cats.isNotEmpty && !cats.contains(category)) {
        selectCategory(cats.first);
      }
    } on ApiException catch (e) {
      loadError = e;
    } finally {
      loadingTypes = false;
      notifyListeners();
    }
  }

  void selectCategory(String c) {
    category = c;
    final inCat = typesInCategory;
    _setType(inCat.isEmpty ? null : inCat.first);
    notifyListeners();
  }

  void selectType(String id) {
    _setType(_types.firstWhere((t) => t.id == id));
    notifyListeners();
  }

  /// Changing the type resets the fields that depend on it.
  void _setType(ActivityType? t) {
    if (t?.id == type?.id) return;
    type = t;
    answers.clear();
    amountText = '';
    photos.clear();
    errors = const [];
    generalErrorCode = null;
  }

  void setDescription(String v) {
    description = v;
    _clearSection('description');
    notifyListeners();
  }

  void setAnswer(String key, String v) {
    answers[key] = v;
    errors = [
      for (final e in errors)
        if (_answerKey(e) != key) e
    ];
  }

  void setAmount(String v) {
    amountText = v;
    _clearSection('amount');
    notifyListeners();
  }

  /// FR-019: a time later than now is flagged at once.
  void setDoneAt(DateTime v) {
    doneAt = v;
    _clearSection('doneAt');
    if (v.isAfter(_now())) {
      errors = [
        ...errors,
        const FieldError(field: 'doneAt', code: 'doneAt.future'),
      ];
    }
    notifyListeners();
  }

  void setManualLocation(bool v) {
    manualLocation = v;
    if (!v) locationFallback = false;
    _clearSection('location');
    notifyListeners();
  }

  void setEmirate(String? v) {
    emirate = v;
    _clearSection('location');
    notifyListeners();
  }

  void setArea(String v) {
    area = v;
    _clearSection('location');
    notifyListeners();
  }

  /// Picks into photo slot [index] (a slot of the current type). Photos over
  /// the type's size limit are refused with `photos.tooLarge`.
  Future<void> pickPhoto(int index, PhotoSource source) async {
    final t = type;
    if (t == null) return;
    final specs = t.photoRules.slots;
    photoPickFailed = false;
    try {
      final p = await photoPicker.pick(source, specs[index].kind);
      if (p == null) return;
      _clearSection('photos');
      if (p.bytes.length > t.photoRules.maxSizeMB * 1024 * 1024) {
        errors = [
          ...errors,
          const FieldError(field: 'photos', code: 'photos.tooLarge'),
        ];
      } else {
        photos[index] = p;
      }
    } catch (_) {
      photoPickFailed = true;
    }
    notifyListeners();
  }

  void removePhoto(int index) {
    photos.remove(index);
    _clearSection('photos');
    notifyListeners();
  }

  // ---- errors -----------------------------------------------------------

  static String? _section(FieldError e) {
    final f = e.field;
    for (final s in const [
      'activityType',
      'description',
      'doneAt',
      'location',
      'answers',
      'amount',
      'photos',
    ]) {
      if (f == s || f.startsWith('$s.') || f.startsWith('$s[')) return s;
    }
    return null;
  }

  static String? _answerKey(FieldError e) {
    if (_section(e) != 'answers') return null;
    final k = e.params['fieldKey'];
    if (k is String) return k;
    return e.field.startsWith('answers.') ? e.field.substring(8) : null;
  }

  void _clearSection(String s) {
    errors = [
      for (final e in errors)
        if (_section(e) != s) e
    ];
  }

  List<FieldError> errorsFor(String section) => [
        for (final e in errors)
          if (_section(e) == section) e
      ];

  List<FieldError> answerErrors(String key) => [
        for (final e in errors)
          if (_answerKey(e) == key) e
      ];

  /// Errors that match no visible field; shown together near the button so
  /// none is lost.
  List<FieldError> get unplacedErrors {
    final keys = {for (final f in type?.formFields ?? <FormFieldDef>[]) f.key};
    return [
      for (final e in errors)
        if (_section(e) == null ||
            (_section(e) == 'answers' && !keys.contains(_answerKey(e))))
          e,
    ];
  }

  // ---- client validation (UX only; the backend is the authority) ----------

  List<FieldError> validate() {
    final t = type;
    final out = <FieldError>[];
    if (t == null) {
      return [
        const FieldError(field: 'activityType', code: 'activityType.required')
      ];
    }
    if (description.trim().isEmpty) {
      out.add(
          const FieldError(field: 'description', code: 'description.required'));
    }
    if (doneAt.isAfter(_now())) {
      out.add(const FieldError(field: 'doneAt', code: 'doneAt.future'));
    }
    for (final f in t.formFields) {
      final v = (answers[f.key] ?? '').trim();
      String? code;
      if (v.isEmpty) {
        if (f.required) code = 'answers.required';
      } else if (f.type == 'number' && num.tryParse(v) == null) {
        code = 'answers.notNumber';
      } else if (f.type == 'choice' && !f.options.contains(v)) {
        code = 'answers.invalidChoice';
      }
      if (code != null) {
        out.add(FieldError(
          field: 'answers.${f.key}',
          code: code,
          params: {'fieldKey': f.key},
        ));
      }
    }
    final amount = _parseAmount(amountText);
    if (amount == null) {
      out.add(const FieldError(field: 'amount.value', code: 'amount.required'));
    } else if (amount < t.amount.min || amount > t.amount.max) {
      out.add(FieldError(
        field: 'amount.value',
        code: 'amount.outOfRange',
        params: {
          'min': t.amount.min,
          'max': t.amount.max,
          'unit': t.amount.unit,
        },
      ));
    }
    final specs = t.photoRules.slots;
    for (var i = 0; i < specs.length; i++) {
      if (specs[i].required && !photos.containsKey(i)) {
        out.add(const FieldError(field: 'photos', code: 'photos.tooFew'));
        break;
      }
    }
    if (manualLocation && emirate == null) {
      out.add(const FieldError(
          field: 'location.emirate', code: 'location.emirateInvalid'));
    }
    return out;
  }

  static num? _parseAmount(String s) =>
      num.tryParse(s.trim().replaceAll(',', '.'));

  // ---- submit -----------------------------------------------------------

  /// Validates, resolves the location (device position only now, FR-012) and
  /// submits with one Idempotency-Key per attempt series (FR-015). Returns the
  /// created view, or null when the form needs attention.
  Future<ActivityView?> submit() async {
    if (submitting) return null;
    generalErrorCode = null;
    final local = validate();
    if (local.isNotEmpty) {
      errors = local;
      notifyListeners();
      return null;
    }
    errors = const [];
    submitting = true;
    notifyListeners();
    try {
      final LocationInput location;
      final areaText = area.trim();
      if (manualLocation) {
        location = ManualLocation(emirate: emirate!, area: areaText);
      } else {
        final c = await locationProvider.currentPosition();
        if (c == null) {
          manualLocation = true;
          locationFallback = true;
          errors = const [
            FieldError(
                field: 'location.emirate', code: 'location.emirateInvalid'),
          ];
          return null;
        }
        location = DeviceLocation(lat: c.lat, lng: c.lng, area: areaText);
      }
      final t = type!;
      final specs = t.photoRules.slots;
      final request = SubmissionRequest(
        activityTypeId: t.id,
        description: description.trim(),
        doneAt: doneAt,
        location: location,
        answers: {
          for (final f in t.formFields)
            if ((answers[f.key] ?? '').trim().isNotEmpty)
              f.key: f.type == 'number'
                  ? num.parse(answers[f.key]!.trim())
                  : answers[f.key]!.trim(),
        },
        amount: _parseAmount(amountText)!,
        photos: [
          for (var i = 0; i < specs.length; i++)
            if (photos[i] != null) photos[i]!,
        ],
      );
      _idempotencyKey ??= _newKey();
      final view =
          await api.submitActivity(request, idempotencyKey: _idempotencyKey!);
      _idempotencyKey = null;
      return view;
    } on ApiException catch (e) {
      generalErrorCode = e.code;
      errors = e.fieldErrors;
      return null;
    } finally {
      submitting = false;
      notifyListeners();
    }
  }
}
