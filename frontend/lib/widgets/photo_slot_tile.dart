import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';
import '../models/activity_models.dart';
import '../services/device_services.dart';

/// Localised name of a photo kind (photo, before, after, receipt).
String photoKindLabel(AppLocalizations l10n, String kind) => switch (kind) {
      'before' => l10n.photoKindBefore,
      'after' => l10n.photoKindAfter,
      'receipt' => l10n.photoKindReceipt,
      _ => l10n.photoKindPhoto,
    };

/// One evidence photo slot (FR-021). Tapping offers camera or gallery, and
/// removal when a photo is set. At least 56 dp high (NFR-015).
class PhotoSlotTile extends StatelessWidget {
  const PhotoSlotTile({
    super.key,
    required this.kind,
    required this.required,
    required this.photo,
    required this.onPick,
    required this.onRemove,
  });

  final String kind;
  final bool required;
  final PhotoUpload? photo;
  final ValueChanged<PhotoSource> onPick;
  final VoidCallback onRemove;

  Future<void> _open(BuildContext context) async {
    final l10n = AppLocalizations.of(context);
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: Text(l10n.photoTake),
              onTap: () => Navigator.pop(ctx, 'camera'),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: Text(l10n.photoChoose),
              onTap: () => Navigator.pop(ctx, 'gallery'),
            ),
            if (photo != null)
              ListTile(
                leading: const Icon(Icons.delete_outline),
                title: Text(l10n.photoRemove),
                onTap: () => Navigator.pop(ctx, 'remove'),
              ),
          ],
        ),
      ),
    );
    switch (action) {
      case 'camera':
        onPick(PhotoSource.camera);
      case 'gallery':
        onPick(PhotoSource.gallery);
      case 'remove':
        onRemove();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final name = photoKindLabel(l10n, kind);
    final label =
        required ? l10n.photoSlotRequired(name) : l10n.photoSlotOptional(name);
    final status = photo != null ? l10n.photoAddedLabel : l10n.addPhoto;
    return Semantics(
      button: true,
      label: '$label, $status',
      excludeSemantics: true,
      onTap: () => _open(context),
      child: InkWell(
        onTap: () => _open(context),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          constraints: const BoxConstraints(minHeight: 64),
          padding: const EdgeInsetsDirectional.fromSTEB(12, 8, 12, 8),
          decoration: BoxDecoration(
            color: const Color(0xFF18241C),
            border: Border.all(color: const Color(0xFF3A4A3F)),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              if (photo != null)
                Padding(
                  padding: const EdgeInsetsDirectional.only(end: 12),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.memory(
                      photo!.bytes,
                      width: 48,
                      height: 48,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) =>
                          const SizedBox(width: 48, height: 48),
                    ),
                  ),
                ),
              Expanded(child: Text(label)),
              Text(
                status,
                style: const TextStyle(
                  color: Color(0xFF4FB27A),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
