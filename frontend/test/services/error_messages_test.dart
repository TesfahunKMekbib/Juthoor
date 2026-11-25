import 'package:flutter_test/flutter_test.dart';
import 'package:juthoor/l10n/app_localizations_ar.dart';
import 'package:juthoor/l10n/app_localizations_en.dart';
import 'package:juthoor/services/error_messages.dart';

/// Every code in plan section 1 (FR-023, NFR-016).
const planCodes = [
  'request.malformed',
  'request.idempotencyKeyMissing',
  'auth.required',
  'upload.tooLarge',
  'validation.failed',
  'activityType.notFound',
  'activity.notFound',
  'activityType.required',
  'activityType.unavailable',
  'description.required',
  'description.tooLong',
  'doneAt.required',
  'doneAt.future',
  'location.sourceInvalid',
  'location.emirateInvalid',
  'location.outsideUae',
  'location.coordinatesInvalid',
  'location.areaTooLong',
  'answers.required',
  'answers.notNumber',
  'answers.invalidChoice',
  'answers.tooLong',
  'amount.required',
  'amount.outOfRange',
  'photos.tooFew',
  'photos.tooMany',
  'photos.kindMissing',
  'photos.kindUnknown',
  'photos.typeNotAllowed',
  'photos.tooLarge',
  'photos.unreadable',
  'verification.evidenceUnclear',
  'verification.evidenceUnrelated',
  'processing.retrying',
  'processing.failedPermanently',
];

void main() {
  final en = AppLocalizationsEn();
  final ar = AppLocalizationsAr();

  test('maps every backend error code to its own text in en and ar (FR-023)',
      () {
    for (final code in planCodes) {
      expect(messageForCode(en, code), isNot(en.errGeneric),
          reason: 'en $code');
      expect(messageForCode(ar, code), isNot(ar.errGeneric),
          reason: 'ar $code');
      expect(messageForCode(ar, code), isNot(messageForCode(en, code)),
          reason: 'ar differs from en for $code');
    }
    expect(knownMessageCodes, containsAll(planCodes));
  });

  test('unknown codes fall back to the generic message', () {
    expect(messageForCode(en, 'something.new'), en.errGeneric);
    expect(messageForCode(ar, 'something.new'), ar.errGeneric);
  });

  test('amount.outOfRange uses params and the localised unit', () {
    final params = {'min': 1, 'max': 50, 'unit': 'trees'};
    expect(messageForCode(en, 'amount.outOfRange', params),
        'Enter between 1 and 50 trees.');
    expect(messageForCode(ar, 'amount.outOfRange', params), contains('أشجار'));
  });
}
