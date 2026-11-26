import 'dart:async';

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

Color statusColor(ActivityStatus s) => switch (s) {
      ActivityStatus.accepted => AppColors.greenBright,
      ActivityStatus.rejected => const Color(0xFFFF8A80),
      ActivityStatus.returnedForCorrection => const Color(0xFFFFCC80),
      _ => AppColors.textSecondary,
    };

/// Explanation for each state (FR-017, FR-027); never claims proof (FR-025).
String statusBody(AppLocalizations l10n, ActivityStatus s) => switch (s) {
      ActivityStatus.submitted => l10n.statusSubmittedBody,
      ActivityStatus.accepted => l10n.statusAcceptedBody,
      ActivityStatus.returnedForCorrection => l10n.statusReturnedBody,
      ActivityStatus.rejected => l10n.statusRejectedBody,
      ActivityStatus.pendingTechnicalProcessing => l10n.statusPendingBody,
      ActivityStatus.draft => l10n.statusDraftBody,
    };

const _reasonCodes = {
  'verification.evidenceUnclear',
  'verification.evidenceUnrelated',
  'verification.suspectedManipulation',
  'verification.unrelatedScene',
  'verification.beforeAfterInconsistent',
  'verification.descriptionMismatch',
  'verification.amountImplausible',
  'verification.dateImplausible',
  'verification.criteriaUnmet',
  'verification.lowRelevance',
  'verification.lowConfidence',
  'verification.notEnvironmental',
  'processing.retrying',
  'processing.failedPermanently',
};

/// Reason text for a status reason code; unknown codes get a generic text
/// (NFR-016).
String reasonText(AppLocalizations l10n, String code) =>
    _reasonCodes.contains(code)
        ? messageForCode(l10n, code)
        : l10n.reasonGeneric;

/// Status as icon + text, so it is never colour-only (NFR-015).
class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.status});
  final ActivityStatus status;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final c = statusColor(status);
    return Container(
      padding:
          const EdgeInsetsDirectional.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        border: Border.all(color: c),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(statusIcon(status), size: 14, color: c),
          const SizedBox(width: 4),
          Flexible(
            child: Text(statusLabel(l10n, status),
                style: TextStyle(fontSize: 12, color: c)),
          ),
        ],
      ),
    );
  }
}

/// Confirmation and status of one submitted activity (FR-017, FR-051).
/// Shows [initial] at once, then polls every [pollInterval] while the
/// activity is submitted or pending, for at most [pollTimeout] (FR-028).
/// Polling stops on a final state, dispose, or when the app is paused.
class ActivityStatusScreen extends StatefulWidget {
  const ActivityStatusScreen({
    super.key,
    required this.activityId,
    this.initial,
    this.pollInterval = const Duration(seconds: 3),
    this.pollTimeout = const Duration(seconds: 60),
  });

  final String activityId;
  final ActivityView? initial;
  final Duration pollInterval;
  final Duration pollTimeout;

  @override
  State<ActivityStatusScreen> createState() => _ActivityStatusScreenState();
}

class _ActivityStatusScreenState extends State<ActivityStatusScreen>
    with WidgetsBindingObserver {
  ActivityView? view;
  bool loading = false;
  String? errorCode;
  Timer? _timer;
  Duration _polled = Duration.zero;
  bool _fetching = false;

  static bool _inFlight(ActivityStatus s) =>
      s == ActivityStatus.submitted ||
      s == ActivityStatus.pendingTechnicalProcessing;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    view = widget.initial;
    if (view == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => reload());
    } else {
      _syncPolling();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stopPolling();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _syncPolling();
    } else {
      _stopPolling();
    }
  }

  void _stopPolling() {
    _timer?.cancel();
    _timer = null;
  }

  void _syncPolling() {
    final v = view;
    if (v == null || !_inFlight(v.status) || _polled >= widget.pollTimeout) {
      _stopPolling();
    } else {
      _timer ??= Timer.periodic(widget.pollInterval, (_) => _poll());
    }
  }

  Future<void> _poll() async {
    _polled += widget.pollInterval;
    if (_polled >= widget.pollTimeout) _stopPolling();
    if (_fetching) return;
    _fetching = true;
    try {
      final v =
          await context.read<ActivityApi>().getActivity(widget.activityId);
      if (mounted) setState(() => view = v);
    } on ApiException {
      // Keep the last known state; the next tick or a manual refresh retries.
    } finally {
      _fetching = false;
    }
    if (mounted) _syncPolling();
  }

  Future<void> reload() async {
    final api = context.read<ActivityApi>();
    setState(() {
      loading = true;
      errorCode = null;
    });
    try {
      final v = await api.getActivity(widget.activityId);
      if (mounted) {
        setState(() => view = v);
        _syncPolling();
      }
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
            physics: const AlwaysScrollableScrollPhysics(),
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
                Icon(statusIcon(v.status), color: statusColor(v.status)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(label,
                      style: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.w700)),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsetsDirectional.only(top: 8),
            child: Text(statusBody(l10n, v.status)),
          ),
          if (reason != null)
            Padding(
              padding: const EdgeInsetsDirectional.only(top: 8),
              child: Text(reasonText(l10n, reason)),
            ),
          const Divider(height: 24),
          row(l10n.typeLabel, v.displayName(locale)),
          if (v.description.isNotEmpty)
            row(l10n.descriptionLabel, v.description),
          for (final a in v.answers)
            if (!(a.key == 'activityName' && v.customName != null))
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
