import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';

import '../models/activity_models.dart';

/// A one-shot device position. Held in memory only; never displayed, stored
/// or logged (NFR-007, ADR-0006).
class DeviceCoordinates {
  final double lat;
  final double lng;
  const DeviceCoordinates(this.lat, this.lng);

  @override
  String toString() => 'DeviceCoordinates(redacted)';
}

/// Source of the device position, requested only when submitting (FR-012).
abstract class LocationProvider {
  /// Current position, or null when permission is denied or location is
  /// unavailable (the form then offers manual entry).
  Future<DeviceCoordinates?> currentPosition();
}

class GeolocatorLocationProvider implements LocationProvider {
  const GeolocatorLocationProvider();

  @override
  Future<DeviceCoordinates?> currentPosition() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return null;
      }
      final p = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
      return DeviceCoordinates(p.latitude, p.longitude);
    } catch (_) {
      return null;
    }
  }
}

enum PhotoSource { camera, gallery }

/// Picks an evidence image for a slot of [kind]. Returns null when cancelled.
abstract class PhotoPicker {
  Future<PhotoUpload?> pick(PhotoSource source, String kind);
}

class ImagePickerPhotoPicker implements PhotoPicker {
  ImagePickerPhotoPicker([ImagePicker? picker])
      : _picker = picker ?? ImagePicker();
  final ImagePicker _picker;

  @override
  Future<PhotoUpload?> pick(PhotoSource source, String kind) async {
    final file = await _picker.pickImage(
      source: source == PhotoSource.camera
          ? ImageSource.camera
          : ImageSource.gallery,
      imageQuality: 85,
      maxWidth: 2048,
      maxHeight: 2048,
    );
    if (file == null) return null;
    final bytes = await file.readAsBytes();
    final name = file.name.toLowerCase();
    final mime = name.endsWith('.png')
        ? 'image/png'
        : name.endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg';
    return PhotoUpload(
      kind: kind,
      fileName: file.name,
      mimeType: mime,
      bytes: bytes,
    );
  }
}
