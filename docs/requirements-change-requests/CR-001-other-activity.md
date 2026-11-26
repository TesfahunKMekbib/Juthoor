# CR-001 — "Other" activity type (participant-described environmental activities)

- Status: **pending stakeholder sign-off** (approved for implementation by the project owner, 2026-11-26)
- Raised: 2026-11-26 · Related: Q-A4b, ADR-0005, `docs/features/other-activity/{spec,plan}.md`
- `docs/requirements/**` is **not** changed by this CR; the approved text stays authoritative until stakeholders sign off.

## Owner approval for implementation (2026-11-26, verbatim)
"Approve the proposed Other Activity requirement changes for implementation. Document them for stakeholder review and
keep Transport deferred. Use items, kg, bags, liters, kWh, m² and an Other unit option. Make quantity optional, but
require a unit when a quantity is provided. … Preserve all existing data, security safeguards, thresholds and
English/Arabic support."

## Rationale
Participants do environmental activities outside the six FR-007 categories (owner request: "allowing users to submit
environmental activities outside the predefined categories"). "Other" was in the stakeholder-approved Flutter UI but not
in FR-007 (Q-A4b). The change keeps every safeguard: same deterministic rules (fixed unit list, so FR-018 stays
deterministic), same AI screening and thresholds, plus an environmental-relevance check, and no impact credit without
a calculation method. Transport stays deferred.

## Changes
| FR | Current text (approved) | Proposed text |
|---|---|---|
| FR-007 | "…activity types across categories including tree planting, recycling, waste reduction, water conservation, energy conservation, and cleanups." | "…activity types across categories including tree planting, recycling, waste reduction, water conservation, energy conservation, cleanups, **and Other (participant-described environmental activities)**." |
| FR-008 | "…define required submission fields, valid numeric quantity ranges, accepted measurement units, and supporting evidence rules for each activity type." | Unchanged, plus note: "**For Other, the accepted measurement units are an administrator-defined list (items, kg, bags, liters, kWh, m², other) with a range per unit; free-text units are not accepted; the quantity is optional.**" |
| FR-011 | "…enforce category-specific data fields during logging: plant species for planting; … meter readings (L or kWh) for utility conservation." | Same, adding: "**; for Other: a custom activity name, a description, and an optional quantity which, when given, requires a unit from the defined list.**" |
| FR-018 | "…validate that all required fields are populated, measurement units match the activity definition, and entered quantities fall within the configured minimum and maximum limits before invoking AI services." | Unchanged. Note: **for Other, "match the activity definition" means the unit is one of the type's defined units; the check remains deterministic and runs before any AI call.** |
| FR-025 | "…assess visual plausibility and consistency with the selected activity type and participant description, without claiming conclusive proof of physical occurrence." | Same, adding: "**For Other, the assessment also judges whether the described activity is plausibly environmental.**" |
| FR-043–FR-045 | Impact calculated from configured methods (FR-043) using validated quantities of Accepted activities (FR-044); metrics trees, kg, L, kWh, kg CO₂e (FR-045). | Unchanged. Note: **no calculation method is defined for Other; Accepted Other activities receive no environmental-impact credit until a method is configured under FR-043.** |

Unchanged and applied as-is to Other: FR-009, FR-012, FR-015, FR-019, FR-021, FR-026–FR-028, FR-032, FR-046, FR-054.

## Decision requested from stakeholders
Approve (or amend) the proposed wording above, then a dedicated `docs:` PR applies it to `docs/requirements/functional.md`.
Open sub-questions: Q-A4c (meaning of the `other` unit), Q-A4d (future impact method and points for Other).
