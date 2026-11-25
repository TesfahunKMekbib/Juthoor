import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../models/activity_models.dart';
import 'api_exception.dart';

/// The Add an Activity REST contract (plan section 1, NFR-030). Screens depend
/// on this interface so tests can inject a fake. The app sends no credentials:
/// identity is resolved server side (ADR-0010).
abstract class ActivityApi {
  /// GET /api/activity-types (FR-009).
  Future<List<ActivityType>> listActivityTypes();

  /// POST /api/activities (FR-015: the same [idempotencyKey] on retry returns
  /// the original record).
  Future<ActivityView> submitActivity(
    SubmissionRequest request, {
    required String idempotencyKey,
  });

  /// GET /api/activities, newest first.
  Future<List<ActivityView>> listActivities();

  /// GET /api/activities/:id (FR-017).
  Future<ActivityView> getActivity(String id);
}

/// Base URL from `--dart-define=API_BASE_URL=http://host:3000`. Without it:
/// `http://10.0.2.2:3000` on the Android emulator (the host machine's
/// loopback), `http://localhost:3000` elsewhere (iOS simulator, web, desktop).
/// A physical device needs the dart-define with the computer's LAN address.
String defaultApiBaseUrl() {
  const fromEnv = String.fromEnvironment('API_BASE_URL');
  if (fromEnv.isNotEmpty) return fromEnv;
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
    return 'http://10.0.2.2:3000';
  }
  return 'http://localhost:3000';
}

class HttpActivityApi implements ActivityApi {
  HttpActivityApi({http.Client? client, String? baseUrl, this.timeout})
      : _client = client ?? http.Client(),
        _base = (baseUrl ?? defaultApiBaseUrl()).replaceAll(RegExp(r'/+$'), '');

  final http.Client _client;
  final String _base;
  final Duration? timeout;

  Uri _uri(String path) => Uri.parse('$_base/api$path');

  @override
  Future<List<ActivityType>> listActivityTypes() async {
    final body = await _send(() => _client.get(_uri('/activity-types')));
    final list = body is List ? body : (body as Map)['items'] as List;
    return list
        .map((e) => ActivityType.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<List<ActivityView>> listActivities() async {
    final body = await _send(() => _client.get(_uri('/activities')));
    return ((body as Map)['items'] as List)
        .map((e) => ActivityView.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<ActivityView> getActivity(String id) async {
    final body = await _send(
        () => _client.get(_uri('/activities/${Uri.encodeComponent(id)}')));
    return ActivityView.fromJson(body as Map<String, dynamic>);
  }

  @override
  Future<ActivityView> submitActivity(
    SubmissionRequest request, {
    required String idempotencyKey,
  }) async {
    final body = await _send(() async {
      final req = http.MultipartRequest('POST', _uri('/activities'))
        ..headers['Idempotency-Key'] = idempotencyKey
        ..fields['data'] = jsonEncode(request.toJson());
      for (final p in request.photos) {
        req.files.add(http.MultipartFile.fromBytes(
          'photos',
          p.bytes,
          filename: p.fileName,
          contentType: MediaType.parse(p.mimeType),
        ));
      }
      return http.Response.fromStream(await _client.send(req));
    });
    return ActivityView.fromJson(body as Map<String, dynamic>);
  }

  Future<Object?> _send(Future<http.Response> Function() call) async {
    final http.Response res;
    try {
      final f = call();
      res = await (timeout == null ? f : f.timeout(timeout!));
    } on TimeoutException {
      throw const ApiException(status: 0, code: ApiException.networkCode);
    } on http.ClientException {
      throw const ApiException(status: 0, code: ApiException.networkCode);
    }
    Object? decoded;
    try {
      decoded =
          res.body.isEmpty ? null : jsonDecode(utf8.decode(res.bodyBytes));
    } on FormatException {
      decoded = null;
    }
    if (res.statusCode >= 200 && res.statusCode < 300) return decoded;
    final m = decoded is Map<String, dynamic> ? decoded : const {};
    throw ApiException(
      status: res.statusCode,
      code: (m['code'] as String?) ?? 'unknown',
      message: m['message'] is String ? m['message'] as String : null,
      fieldErrors: ((m['errors'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(FieldError.fromJson)
          .toList(),
    );
  }
}
