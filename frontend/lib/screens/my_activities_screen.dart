import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/activity_models.dart';
import '../services/activity_api.dart';
import '../services/api_exception.dart';
import '../services/error_messages.dart';
import 'activity_status_screen.dart';
import 'home_screen.dart' show AppColors;

/// The participant's own submissions, newest first (FR-017). Each row opens
/// its status screen.
class MyActivitiesScreen extends StatefulWidget {
  const MyActivitiesScreen({super.key});

  @override
  State<MyActivitiesScreen> createState() => _MyActivitiesScreenState();
}

class _MyActivitiesScreenState extends State<MyActivitiesScreen> {
  List<ActivityView>? items;
  String? errorCode;
  bool loading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => load());
  }

  Future<void> load() async {
    final api = context.read<ActivityApi>();
    setState(() {
      loading = true;
      errorCode = null;
    });
    try {
      final r = await api.listActivities();
      if (mounted) setState(() => items = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => errorCode = e.code);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context);
    Widget body;
    if (errorCode != null) {
      body = Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(messageForCode(l10n, errorCode!)),
            const SizedBox(height: 12),
            ElevatedButton(onPressed: load, child: Text(l10n.retry)),
          ],
        ),
      );
    } else if (items == null) {
      body = const Center(child: CircularProgressIndicator());
    } else if (items!.isEmpty) {
      body = Center(child: Text(l10n.myActivitiesEmpty));
    } else {
      body = RefreshIndicator(
        onRefresh: load,
        child: ListView.separated(
          padding: const EdgeInsetsDirectional.all(16),
          itemCount: items!.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (context, i) {
            final a = items![i];
            final name = a.activityType.name.of(locale);
            final status = statusLabel(l10n, a.status);
            final date = a.submittedAt == null
                ? ''
                : DateFormat.yMd(locale.toString())
                    .format(a.submittedAt!.toLocal());
            return Semantics(
              button: true,
              label: '$name, $status, $date',
              excludeSemantics: true,
              onTap: () => _open(a),
              child: Material(
                color: AppColors.card,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                  side: const BorderSide(color: AppColors.border),
                ),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: () => _open(a),
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 64),
                    padding: const EdgeInsetsDirectional.all(14),
                    child: Row(
                      children: [
                        Icon(statusIcon(a.status),
                            color: AppColors.greenBright),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(name,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600)),
                              Text(
                                date.isEmpty ? status : '$status · $date',
                                style: const TextStyle(
                                    fontSize: 12,
                                    color: AppColors.textSecondary),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.myActivitiesTitle),
        automaticallyImplyLeading: false,
      ),
      body: body,
    );
  }

  void _open(ActivityView a) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ActivityStatusScreen(activityId: a.id, initial: a),
      ),
    );
  }
}
