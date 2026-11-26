import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/activity_models.dart';
import '../services/activity_api.dart';
import '../services/api_exception.dart';
import '../services/device_services.dart';
import '../services/error_messages.dart';
import '../state/activity_form_controller.dart';
import '../widgets/photo_slot_tile.dart';
import 'activity_status_screen.dart';

const Color _background = Color(0xFF101812);
const Color _cardColor = Color(0xFF18241C);
const Color _primaryGreen = Color(0xFF2B7A50);
const Color _borderColor = Color(0xFF3A4A3F);
const Color _mutedText = Color(0xFFA9B8AE);
const Color _errorColor = Color(0xFFFF8A80);

String categoryLabel(AppLocalizations l10n, String id) => switch (id) {
      'planting' => l10n.categoryPlanting,
      'recycling' => l10n.categoryRecycling,
      'waste' => l10n.categoryWaste,
      'water' => l10n.categoryWater,
      'energy' => l10n.categoryEnergy,
      'cleanup' => l10n.categoryCleanup,
      'other' => l10n.categoryOther,
      _ => id,
    };

String emirateLabel(AppLocalizations l10n, String id) => switch (id) {
      'Abu Dhabi' => l10n.emirateAbuDhabi,
      'Dubai' => l10n.emirateDubai,
      'Sharjah' => l10n.emirateSharjah,
      'Ajman' => l10n.emirateAjman,
      'Umm Al Quwain' => l10n.emirateUmmAlQuwain,
      'Ras Al Khaimah' => l10n.emirateRasAlKhaimah,
      'Fujairah' => l10n.emirateFujairah,
      _ => id,
    };

/// The one-screen Add an Activity form (FR-009–012, FR-015, FR-019, FR-023).
/// Home → this screen → status screen is two transitions (NFR-013).
class RecordActivityScreen extends StatefulWidget {
  const RecordActivityScreen({super.key});

  @override
  State<RecordActivityScreen> createState() => _RecordActivityScreenState();
}

class _RecordActivityScreenState extends State<RecordActivityScreen> {
  late final ActivityFormController c;
  final description = TextEditingController();
  final amount = TextEditingController();
  final area = TextEditingController();
  final Map<String, TextEditingController> answerControllers = {};

  @override
  void initState() {
    super.initState();
    c = ActivityFormController(
      api: context.read<ActivityApi>(),
      locationProvider: context.read<LocationProvider>(),
      photoPicker: context.read<PhotoPicker>(),
    )..loadTypes();
    c.addListener(_syncControllers);
  }

  // Keeps text controllers in step when the type changes and resets answers.
  String? _syncedTypeId;
  void _syncControllers() {
    if (_syncedTypeId != c.type?.id) {
      _syncedTypeId = c.type?.id;
      amount.clear();
      for (final t in answerControllers.values) {
        t.dispose();
      }
      answerControllers.clear();
    }
  }

  @override
  void dispose() {
    c.removeListener(_syncControllers);
    c.dispose();
    description.dispose();
    amount.dispose();
    area.dispose();
    for (final t in answerControllers.values) {
      t.dispose();
    }
    super.dispose();
  }

  Future<void> selectDateTime() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: c.doneAt.isAfter(now) ? now : c.doneAt,
      firstDate: DateTime(2020),
      lastDate: now, // FR-019: no future dates
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(c.doneAt),
    );
    if (time == null) return;
    c.setDoneAt(
        DateTime(date.year, date.month, date.day, time.hour, time.minute));
  }

  Future<void> submit() async {
    final view = await c.submit();
    if (!mounted) return;
    if (view != null) {
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) =>
              ActivityStatusScreen(activityId: view.id, initial: view),
        ),
      );
    } else if (c.photoPickFailed) {
      _snack(AppLocalizations.of(context).photoPickFailed);
    }
  }

  void _snack(String m) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  // ---- building blocks ----------------------------------------------------

  Widget sectionLabel(String text) => Padding(
        padding: const EdgeInsetsDirectional.only(bottom: 8),
        child: Text(
          text,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
      );

  InputDecoration fieldDecoration({String? hint}) => InputDecoration(
        hintText: hint,
        filled: true,
        fillColor: _cardColor,
        contentPadding:
            const EdgeInsetsDirectional.symmetric(horizontal: 14, vertical: 15),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _borderColor),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _primaryGreen),
        ),
      );

  Widget errorsText(List<FieldError> errs) {
    if (errs.isEmpty) return const SizedBox.shrink();
    final l10n = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsetsDirectional.only(top: 6),
      child: Semantics(
        liveRegion: true,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final e in errs)
              Text(
                messageForCode(l10n, e.code, e.params),
                style: const TextStyle(color: _errorColor, fontSize: 13),
              ),
          ],
        ),
      ),
    );
  }

  Widget buildCategories(AppLocalizations l10n) => Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final category in c.categories)
            ChoiceChip(
              label: Text(categoryLabel(l10n, category)),
              selected: c.category == category,
              showCheckmark: false,
              onSelected: (_) => c.selectCategory(category),
              selectedColor: _primaryGreen,
              backgroundColor: _cardColor,
              side: BorderSide(
                color: c.category == category ? _primaryGreen : _borderColor,
              ),
              labelStyle: TextStyle(
                color: c.category == category ? Colors.white : _mutedText,
                fontWeight: FontWeight.w600,
              ),
            ),
        ],
      );

  Widget buildActivityType(AppLocalizations l10n, Locale locale) {
    final options = c.typesInCategory;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionLabel(l10n.typeLabel),
        DropdownButtonFormField<String>(
          key: ValueKey('type-${c.category}-${c.type?.id}'),
          initialValue: c.type?.id,
          isExpanded: true,
          dropdownColor: _cardColor,
          decoration: fieldDecoration(),
          items: [
            for (final t in options)
              DropdownMenuItem(value: t.id, child: Text(t.name.of(locale))),
          ],
          onChanged: (v) {
            if (v != null) c.selectType(v);
          },
        ),
        errorsText(c.errorsFor('activityType')),
      ],
    );
  }

  Widget buildDescription(AppLocalizations l10n) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          sectionLabel(l10n.descriptionLabel),
          TextField(
            key: const ValueKey('field-description'),
            controller: description,
            minLines: 2,
            maxLines: 4,
            textInputAction: TextInputAction.newline,
            decoration: fieldDecoration(hint: l10n.descriptionHint),
            onChanged: c.setDescription,
          ),
          errorsText(c.errorsFor('description')),
        ],
      );

  Widget buildFormField(FormFieldDef f, AppLocalizations l10n, Locale locale) {
    final ctl = answerControllers.putIfAbsent(
      f.key,
      () => TextEditingController(text: c.answers[f.key] ?? ''),
    );
    final label = f.required ? '${f.label.of(locale)} *' : f.label.of(locale);
    final Widget input;
    if (f.type == 'choice') {
      input = DropdownButtonFormField<String>(
        key: ValueKey('answer-${c.type?.id}-${f.key}'),
        initialValue:
            f.options.contains(c.answers[f.key]) ? c.answers[f.key] : null,
        isExpanded: true,
        dropdownColor: _cardColor,
        decoration: fieldDecoration(),
        items: [
          for (final o in f.options) DropdownMenuItem(value: o, child: Text(o)),
        ],
        onChanged: (v) => c.setAnswer(f.key, v ?? ''),
      );
    } else {
      input = TextField(
        key: ValueKey('field-answer-${f.key}'),
        controller: ctl,
        maxLength: f.key == 'activityName' ? 60 : null,
        keyboardType: f.type == 'number'
            ? const TextInputType.numberWithOptions(decimal: true)
            : TextInputType.text,
        decoration: fieldDecoration(),
        onChanged: (v) => c.setAnswer(f.key, v),
      );
    }
    return Padding(
      padding: const EdgeInsetsDirectional.only(top: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          sectionLabel(label),
          input,
          errorsText(c.answerErrors(f.key)),
        ],
      ),
    );
  }

  Widget buildOptionalAmount(AppLocalizations l10n) {
    final rule = c.type!.amount;
    String n(num v) => v == v.roundToDouble() ? '${v.toInt()}' : '$v';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionLabel(l10n.amountOptionalLabel),
        TextField(
          key: const ValueKey('field-amount'),
          controller: amount,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: fieldDecoration(),
          onChanged: c.setAmount,
        ),
        Padding(
          padding: const EdgeInsetsDirectional.only(top: 4),
          child: Text(
            l10n.amountRangeHint(n(rule.min), n(rule.max), ''),
            style: const TextStyle(color: _mutedText, fontSize: 12),
          ),
        ),
        const SizedBox(height: 10),
        sectionLabel(l10n.unitFieldLabel),
        DropdownButtonFormField<String>(
          key: ValueKey('unit-${c.type?.id}-${c.amountUnit}'),
          initialValue: rule.units.contains(c.amountUnit) ? c.amountUnit : null,
          isExpanded: true,
          dropdownColor: _cardColor,
          decoration: fieldDecoration(),
          items: [
            for (final u in rule.units)
              DropdownMenuItem(value: u, child: Text(unitLabel(l10n, u))),
          ],
          onChanged: c.setAmountUnit,
        ),
        errorsText(c.errorsFor('amount')),
      ],
    );
  }

  Widget buildAmount(AppLocalizations l10n) {
    if (c.type!.amount.optional) return buildOptionalAmount(l10n);
    final rule = c.type!.amount;
    final unit = unitLabel(l10n, rule.unit);
    String n(num v) => v == v.roundToDouble() ? '${v.toInt()}' : '$v';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionLabel(l10n.amountLabel(unit)),
        TextField(
          key: const ValueKey('field-amount'),
          controller: amount,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: fieldDecoration(
              hint: l10n.amountRangeHint(n(rule.min), n(rule.max), unit)),
          onChanged: c.setAmount,
        ),
        Padding(
          padding: const EdgeInsetsDirectional.only(top: 4),
          child: Text(
            l10n.amountRangeHint(n(rule.min), n(rule.max), unit),
            style: const TextStyle(color: _mutedText, fontSize: 12),
          ),
        ),
        errorsText(c.errorsFor('amount')),
      ],
    );
  }

  Widget buildPhotos(AppLocalizations l10n) {
    final specs = c.type!.photoRules.slots;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionLabel(l10n.photosSection),
        for (var i = 0; i < specs.length; i++) ...[
          if (i > 0) const SizedBox(height: 8),
          PhotoSlotTile(
            kind: specs[i].kind,
            required: specs[i].required,
            photo: c.photos[i],
            onPick: (s) => c.pickPhoto(i, s).then((_) {
              if (mounted && c.photoPickFailed) {
                _snack(l10n.photoPickFailed);
              }
            }),
            onRemove: () => c.removePhoto(i),
          ),
        ],
        errorsText(c.errorsFor('photos')),
      ],
    );
  }

  Widget buildLocation(AppLocalizations l10n) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionLabel(l10n.locationLabel),
        if (c.deviceLocationEnabled)
          Container(
            width: double.infinity,
            padding: const EdgeInsetsDirectional.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF1C3326),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              c.locationFallback
                  ? l10n.locationFallbackNotice
                  : l10n.locationNoticeSubmit,
              style: const TextStyle(fontSize: 13),
            ),
          ),
        if (c.deviceLocationEnabled && !c.manualLocation)
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton(
              style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
              onPressed: () => c.setManualLocation(true),
              child: Text(l10n.locationManualButton),
            ),
          ),
        if (c.manualLocation) ...[
          const SizedBox(height: 12),
          sectionLabel(l10n.emirateLabel),
          DropdownButtonFormField<String>(
            key: const ValueKey('emirate'),
            initialValue: c.emirate,
            isExpanded: true,
            dropdownColor: _cardColor,
            decoration: fieldDecoration(),
            items: [
              for (final e in emirates)
                DropdownMenuItem(value: e, child: Text(emirateLabel(l10n, e))),
            ],
            onChanged: c.setEmirate,
          ),
        ],
        const SizedBox(height: 12),
        sectionLabel(l10n.areaLabel),
        TextField(
          key: const ValueKey('field-area'),
          controller: area,
          decoration: fieldDecoration(),
          onChanged: c.setArea,
        ),
        errorsText(c.errorsFor('location')),
      ],
    );
  }

  Widget buildDateTime(AppLocalizations l10n) {
    final localeName = Localizations.localeOf(context).toString();
    final dateText = '${DateFormat.yMd(localeName).format(c.doneAt)}  '
        '${TimeOfDay.fromDateTime(c.doneAt).format(context)}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionLabel(l10n.dateAndTime),
        Semantics(
          button: true,
          label: '${l10n.dateAndTime}, $dateText',
          excludeSemantics: true,
          onTap: selectDateTime,
          child: InkWell(
            onTap: selectDateTime,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              constraints: const BoxConstraints(minHeight: 52),
              padding: const EdgeInsetsDirectional.all(14),
              decoration: BoxDecoration(
                color: _cardColor,
                border: Border.all(color: _borderColor),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Expanded(child: Text(dateText)),
                  const Icon(Icons.calendar_today_outlined, size: 18),
                ],
              ),
            ),
          ),
        ),
        errorsText(c.errorsFor('doneAt')),
      ],
    );
  }

  Widget buildSubmit(AppLocalizations l10n) {
    final general = c.generalErrorCode;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (general != null) errorsText([FieldError(field: '', code: general)]),
        errorsText(c.unplacedErrors),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: c.submitting ? null : submit,
            style: ElevatedButton.styleFrom(
              backgroundColor: _primaryGreen,
              foregroundColor: Colors.white,
              minimumSize: const Size(0, 52),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: c.submitting
                ? Semantics(
                    label: l10n.submittingLabel,
                    child: const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                : Text(l10n.submitActivity),
          ),
        ),
      ],
    );
  }

  Widget buildBody(AppLocalizations l10n, Locale locale) {
    if (c.loadingTypes && c.types.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (c.loadError != null || c.types.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsetsDirectional.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                c.loadError != null
                    ? messageForCode(l10n, c.loadError!.code)
                    : l10n.formLoadFailed,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: c.loadTypes, child: Text(l10n.retry)),
            ],
          ),
        ),
      );
    }
    final t = c.type;
    return SingleChildScrollView(
      padding: const EdgeInsetsDirectional.all(16),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 390),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              buildCategories(l10n),
              const SizedBox(height: 18),
              buildActivityType(l10n, locale),
              if (t != null) ...[
                const SizedBox(height: 14),
                buildDescription(l10n),
                for (final f in t.formFields) buildFormField(f, l10n, locale),
                const SizedBox(height: 14),
                buildAmount(l10n),
                const SizedBox(height: 14),
                buildPhotos(l10n),
              ],
              const SizedBox(height: 14),
              buildLocation(l10n),
              const SizedBox(height: 14),
              buildDateTime(l10n),
              const SizedBox(height: 12),
              Text(
                l10n.acceptedOnceNote,
                style: const TextStyle(color: _mutedText, fontSize: 12),
              ),
              const SizedBox(height: 12),
              buildSubmit(l10n),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context);
    return Scaffold(
      backgroundColor: _background,
      appBar: AppBar(
        backgroundColor: _background,
        foregroundColor: Colors.white,
        title: Text(
          l10n.recordActivityTitle,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        ),
      ),
      body: SafeArea(
        child: ListenableBuilder(
          listenable: c,
          builder: (context, _) => buildBody(l10n, locale),
        ),
      ),
    );
  }
}
