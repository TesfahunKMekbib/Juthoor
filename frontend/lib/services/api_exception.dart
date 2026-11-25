/// One coded field error from a 422 body (FR-023, NFR-016). [message] is an
/// English fallback; the app renders ARB text by [code] and [params].
class FieldError {
  final String field;
  final String code;
  final String? message;
  final Map<String, dynamic> params;
  const FieldError({
    required this.field,
    required this.code,
    this.message,
    this.params = const {},
  });

  factory FieldError.fromJson(Map<String, dynamic> j) => FieldError(
        field: (j['field'] as String?) ?? '',
        code: (j['code'] as String?) ?? '',
        message: j['message'] as String?,
        params: ((j['params'] as Map?) ?? const {}).cast<String, dynamic>(),
      );
}

/// Failure from the activity API. [status] is 0 when the server was not
/// reached.
class ApiException implements Exception {
  final int status;
  final String code;
  final String? message;
  final List<FieldError> fieldErrors;
  const ApiException({
    required this.status,
    required this.code,
    this.message,
    this.fieldErrors = const [],
  });

  /// Code used when the server could not be reached.
  static const networkCode = 'network.unavailable';

  @override
  String toString() => 'ApiException($status, $code)';
}
