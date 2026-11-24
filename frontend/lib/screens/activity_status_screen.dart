import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/activity_models.dart';
import '../services/activity_api.dart';
import '../services/api_exception.dart';
import '../services/error_messages.dart';
import 'home_screen.dart' show AppColors;
import 'record_activity_screen.dart' show emirateLabel;

String statusLabel(AppLocalizations l10n, ActivityStatus s) => switch (s) {
      ActivityStatus.submitted => l10n.statusSubmitted,
      ActivityStatus.accepted => l10n.statusAccepted,
      ActivityStatus.returnedForCorrection => l10n.statusReturned,
      ActivityStatus.rejected => l10n.statusRejected,
      ActivityStatus.pendingTechnicalProcessing => l10n.statusPending,
      ActivityStatus.draft => l10n.statusDraft,
    };

IconData statusIcon(ActivityStatus s) => switch (s) {
      ActivityStatus.accepted => Icons.check_circle_outline,
      ActivityStatus.rejected => Icons.cancel_outlined,
      ActivityStatus.returnedForCorrection => Icons.undo,
      ActivityStatus.pendingTechnicalProcessing => Icons.hourglass_empty,
      _ => Icons.schedule,
    };

/// Confirmation and status of one submitted activity (FR-017, FR-051).
/// Shows [initial] at once (the confirmation after submitting) and refreshes
/// from the API on request. Automatic polling and the full set of decided
/// states come with F5.
class ActivityStatusScreen extends StatefulWidget {
  const ActivityStatusScreen(
      {super.key, required this.activityId, this.initial});

  final String activityId;
  final ActivityView? initial;

  @override
  State<ActivityStatusScreen> createState() => _ActivityStatusScreenState();
}

class _ActivityStatusScreenState extends State<ActivityStatusScreen> {
  ActivityView? view;
  bool loading = false;
  String? errorCode;

  @override
  void initState() {
    super.initState();
    view = widget.initial;
    if (view == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => reload());
    }
  }

  Future<void> reload() async {
    final api = context.read<ActivityApi>();
    setState(() {
      loading = true;
      errorCode = null;
    });
    try {
      final v = await api.getActivity(widget.activityId);
      if (mounted) setState(() => view = v);
    } on ApiException catch (e) {
      if (mounted) setState(() => errorCode = e.code);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.statusTitle),
        actions: [
          IconButton(
            tooltip: l10n.statusRefresh,
            icon: const Icon(Icons.refresh),
            constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
            onPressed: loading ? null : reload,
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: reload,
          child: ListView(
            padding: const EdgeInsetsDirectional.all(16),
            children: [
              if (loading) const LinearProgressIndicator(),
              if (errorCode != null)
                Padding(
                  padding: const EdgeInsetsDirectional.only(bottom: 12),
                  child: Text(
                    messageForCode(l10n, errorCode!),
                    style: const TextStyle(color: Color(0xFFFF8A80)),
                  ),
                ),
              if (view != null) _Details(view: view!),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 52),
                  ),
                  onPressed: () =>
                      Navigator.of(context).popUntil((r) => r.isFirst),
                  child: Text(l10n.backToHome),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Details extends StatelessWidget {
  const _Details({required this.view});
  final ActivityView view;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context);
    final v = view;
    final label = statusLabel(l10n, v.status);
    final reason = v.resultReasonCode;

    Widget row(String name, String value) => Padding(
          padding: const EdgeInsetsDirectional.only(top: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(name,
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.textSecondary)),
              Text(value),
            ],
          ),
        );

    String amountText(AmountView a) =>
        l10n.amountSummary(a.value.toString(), unitLabel(l10n, a.unit));
    final place = [
      if (v.emirate != null) emirateLabel(l10n, v.emirate!),
      if (v.area != null && v.area!.isNotEmpty) v.area!,
    ].join(', ');

    return Container(
      padding: const EdgeInsetsDirectional.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            liveRegion: true,
            label: '${l10n.statusTitle}: $label',
            excludeSemantics: true,
            child: Row(
              children: [
                Icon(statusIcon(v.status), color: AppColors.greenBright),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(label,
                      style: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.w700)),
                ),
              ],
            ),
          ),
          if (v.status == ActivityStatus.submitted)
            Padding(
              padding: const EdgeInsetsDirectional.only(top: 8),
              child: Text(l10n.statusSubmittedBody),
            ),
          if (reason != null)
            Padding(
              padding: const EdgeInsetsDirectional.only(top: 8),
              child: Text(messageForCode(l10n, reason)),
            ),
          const Divider(height: 24),
          row(l10n.typeLabel, v.activityType.name.of(locale)),
          if (v.description.isNotEmpty)
            row(l10n.descriptionLabel, v.description),
          for (final a in v.answers)
            row(a.label.of(locale), '${a.value ?? ''}'),
          if (v.amount != null) row(l10n.amountPlain, amountText(v.amount!)),
          if (v.acceptedAmount != null)
            row(l10n.acceptedAmountLabel, amountText(v.acceptedAmount!)),
          if (v.doneAt != null)
            row(
              l10n.dateAndTime,
              DateFormat.yMd(locale.toString())
                  .add_jm()
                  .format(v.doneAt!.toLocal()),
            ),
          if (place.isNotEmpty) row(l10n.locationLabel, place),
          const SizedBox(height: 16),
          Text(
            l10n.statusAdvisory,
            style:
                const TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}
