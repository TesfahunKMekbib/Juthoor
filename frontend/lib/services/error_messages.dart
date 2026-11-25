import '../l10n/app_localizations.dart';

/// Localised text for a known unit code (trees, kg, liters, kWh, bags);
/// unknown units are shown as sent.
String unitLabel(AppLocalizations l10n, String unit) => switch (unit) {
      'trees' => l10n.unitTrees,
      'kg' => l10n.unitKg,
      'liters' => l10n.unitLiters,
      'kWh' => l10n.unitKwh,
      'bags' => l10n.unitBags,
      _ => unit,
    };

String _num(Object? v) {
  if (v is num) {
    return v == v.roundToDouble() ? v.toInt().toString() : v.toString();
  }
  return v?.toString() ?? '';
}

typedef _Builder = String Function(AppLocalizations l, Map<String, dynamic> p);

final Map<String, _Builder> _messages = {
  // Request-level codes
  'request.malformed': (l, p) => l.errRequestMalformed,
  'request.idempotencyKeyMissing': (l, p) => l.errIdempotencyKeyMissing,
  'auth.required': (l, p) => l.errAuthRequired,
  'upload.tooLarge': (l, p) => l.errUploadTooLarge,
  'validation.failed': (l, p) => l.errValidationFailed,
  'activityType.notFound': (l, p) => l.errActivityTypeNotFound,
  'activity.notFound': (l, p) => l.errActivityNotFound,
  'network.unavailable': (l, p) => l.errNetwork,
  // Field-level codes
  'activityType.required': (l, p) => l.errActivityTypeRequired,
  'activityType.unavailable': (l, p) => l.errActivityTypeUnavailable,
  'description.required': (l, p) => l.errDescriptionRequired,
  'description.tooLong': (l, p) => l.errDescriptionTooLong,
  'doneAt.required': (l, p) => l.errDoneAtRequired,
  'doneAt.future': (l, p) => l.errDoneAtFuture,
  'location.sourceInvalid': (l, p) => l.errLocationSourceInvalid,
  'location.emirateInvalid': (l, p) => l.errLocationEmirateInvalid,
  'location.outsideUae': (l, p) => l.errLocationOutsideUae,
  'location.coordinatesInvalid': (l, p) => l.errLocationCoordinatesInvalid,
  'location.areaTooLong': (l, p) => l.errLocationAreaTooLong,
  'answers.required': (l, p) => l.errAnswersRequired,
  'answers.notNumber': (l, p) => l.errAnswersNotNumber,
  'answers.invalidChoice': (l, p) => l.errAnswersInvalidChoice,
  'answers.tooLong': (l, p) => l.errAnswersTooLong,
  'amount.required': (l, p) => l.errAmountRequired,
  'amount.outOfRange': (l, p) => l.errAmountOutOfRange(
        _num(p['min']),
        _num(p['max']),
        unitLabel(l, (p['unit'] as String?) ?? ''),
      ),
  'photos.tooFew': (l, p) => l.errPhotosTooFew,
  'photos.tooMany': (l, p) => l.errPhotosTooMany,
  'photos.kindMissing': (l, p) => l.errPhotosKindMissing,
  'photos.kindUnknown': (l, p) => l.errPhotosKindUnknown,
  'photos.typeNotAllowed': (l, p) => l.errPhotosTypeNotAllowed,
  'photos.tooLarge': (l, p) => l.errPhotosTooLarge,
  'photos.unreadable': (l, p) => l.errPhotosUnreadable,
  // Status reason codes (FR-027, FR-028)
  'verification.evidenceUnclear': (l, p) => l.reasonEvidenceUnclear,
  'verification.evidenceUnrelated': (l, p) => l.reasonEvidenceUnrelated,
  'processing.retrying': (l, p) => l.reasonRetrying,
  'processing.failedPermanently': (l, p) => l.reasonFailedPermanently,
};

/// Every code the app can render with its own text (NFR-016).
Iterable<String> get knownMessageCodes => _messages.keys;

/// ARB text for a backend [code] with its [params]; unknown codes get the
/// generic message. The backend `message` is never shown (NFR-016).
String messageForCode(
  AppLocalizations l10n,
  String code, [
  Map<String, dynamic> params = const {},
]) =>
    (_messages[code] ?? (l, p) => l.errGeneric)(l10n, params);
