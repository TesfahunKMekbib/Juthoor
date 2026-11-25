# Juthoor — Functional Requirements (APPROVED)

> **Source of truth.** Transcribed verbatim from `Juthoor_Functional_Requirements_Final.docx`.
> This file is edit-protected by `.claude/hooks/guard.mjs`. Changes need team approval
> and a human edit in a dedicated `docs/` PR. Conflicts are tracked in `docs/open-questions.md`.
>
> Priorities (MoSCoW): **M** = Must Have, **S** = Should Have, **C** = Could Have.
> Look up a requirement with: `grep -n "FR-018" docs/requirements/functional.md`

## Manage Participant Profiles
| ID | P | Statement |
|---|---|---|
| FR-001 | M | The system shall allow a visitor to register a participant account by providing a display name, email address, and password. |
| FR-002 | S | The system shall allow a participant to view and update their display name, profile photograph, emirate, and sustainability interests. |
| FR-003 | M | The system shall allow a participant to manage notification preferences, personalized recommendation consent, and public profile visibility. |
| FR-004 | M | The system shall display the participant's accepted activity count, accumulated points, earned badges, sustainability level, and environmental contribution summary on their personal dashboard. |

## Control User Roles and Permissions
| ID | P | Statement |
|---|---|---|
| FR-005 | M | The system shall allow a system administrator to assign and revoke organization organizer and platform administrator roles. |
| FR-006 | M | The system shall allow an administrator to suspend and reactivate an account while recording the reason for the status change. |

## Configure Activity Catalogs
| ID | P | Statement |
|---|---|---|
| FR-007 | M | The system shall allow an administrator to create, update, and publish activity types across categories including tree planting, recycling, waste reduction, water conservation, energy conservation, and cleanups. |
| FR-008 | M | The system shall allow an administrator to define required submission fields, valid numeric quantity ranges, accepted measurement units, and supporting evidence rules for each activity type. |
| FR-009 | S | The system shall display the required fields, valid quantity ranges, eligible evidence criteria, and points-award rules to participants before activity submission. |

## Log Environmental Activities
| ID | P | Statement |
|---|---|---|
| FR-010 | M | The system shall allow a participant to create, save, reopen, edit, and delete an unsubmitted activity draft containing its type, description, occurrence date and time, location, quantities, and evidence photo. |
| FR-011 | M | The system shall enforce category-specific data fields during logging: plant species for planting; material weight (kg) and receipt image for recycling; bags collected, area covered, and before-and-after photos for cleanups; and before-and-after meter readings (L or kWh) for utility conservation. |
| FR-012 | S | The system shall allow manual location entry when device location permission is denied or location services are unavailable. |
| FR-013 | S | The system shall allow a participant to associate an activity submission with an eligible team, campaign, or challenge. |
| FR-014 | S | The system shall allow an authorized event organizer to submit a single group activity record listing participating members, allocating attendance credit to participants while counting physical environmental quantities only once. |
| FR-015 | M | The system shall prevent duplicate submission records caused by repeated submission requests (idempotency enforcement) and lock a submitted revision's details during automated validation. |
| FR-016 | S | The system shall allow a participant to view their activity history and filter it by occurrence date, activity type, validation status, team, campaign, or challenge. |
| FR-017 | M | The system shall display an activity's submitted details, evidence, automated validation outcome, accepted quantities, awarded points, and calculated environmental impact to its owner. |

## Validate Activity Rules Deterministically
| ID | P | Statement |
|---|---|---|
| FR-018 | M | The system shall deterministically validate that all required fields are populated, measurement units match the activity definition, and entered quantities fall within the configured minimum and maximum limits before invoking AI services. |
| FR-019 | M | The system shall deterministically reject any activity submission with an occurrence date in the future or outside the active date window of an associated campaign or challenge. |
| FR-020 | M | The system shall deterministically validate the activity location against the UAE geographic boundaries and the specific Emirate or geofence scope of any linked program. |
| FR-021 | M | The system shall deterministically validate uploaded evidence files against permitted formats (JPEG, PNG, WEBP), file-size limits, and required attachment counts. |
| FR-022 | S | The system shall allow an administrator to configure the AI acceptance threshold and rejection thresholds and detect duplicate evidence photographs by comparing uploaded photographs with previously submitted evidence and reject confirmed duplicate submissions. |
| FR-023 | M | The system shall display specific, field-level validation error messages when a submission fails deterministic checks and allow the participant to correct the draft without losing entered data. |

## Screen Activity Evidence Using AI
| ID | P | Statement |
|---|---|---|
| FR-024 | S | The system shall analyze uploaded activity photographs using AI to detect sensitive regions (human faces, vehicle license plates, identifying residential details) and allow the participant to preview, adjust, and confirm region blurring prior to final validation. |
| FR-025 | M | The system shall evaluate the confirmed evidence photograph using an AI vision model to assess visual plausibility and consistency with the selected activity type and participant description, without claiming conclusive proof of physical occurrence. |
| FR-026 | M | The system shall transition a submission to Accepted only when all applicable deterministic validation rules pass and the AI visual relevance score meets configured acceptance threshold. |
| FR-027 | M | The system shall transition a submission to Returned for Correction when its evidence may be corrected or to Rejected when it violates a defined rejection rule, recording the reason for the outcome and allowing replacement evidence when permitted. |
| FR-028 | M | The system shall place submissions affected by AI service unavailability or technical processing failures into Pending Technical Processing, retry processing according to the configured retry policy, prevent duplicate records or rewards, and notify participants when processing completes or permanently fails. |
| FR-029 | C | The system shall allow participants to submit periodic follow-up photographs for planted trees and use AI visual assessment to flag visible wilting or leaf discoloration. |

## Issue Rewards
| ID | P | Statement |
|---|---|---|
| FR-030 | M | The system shall allow an administrator to configure points-award rules, quantity multipliers, award caps, badge criteria, and sustainability level thresholds. |
| FR-031 | M | The system shall automatically calculate and award points, evaluate badge eligibility, and update the participant's sustainability level immediately upon an activity reaching the Accepted state. |
| FR-032 | M | The system shall ensure that rejected, returned, or pending submissions contribute zero points, zero challenge progress, and zero environmental impact to any dashboard or leaderboard. |
| FR-033 | S | The system shall allow a participant to view their points ledger, including the source activity ID, points delta, timestamp, and automated rule applied. |
| FR-034 | C | The system shall provide individual and team leaderboards filtered by emirate, activity category, and timeframe, calculated strictly from distinct Accepted activities. |

## Deliver Sustainability Campaigns
| ID | P | Statement |
|---|---|---|
| FR-035 | M | The system shall allow an administrator or authorized organizer to create, validate, and publish campaigns and challenges (e.g., tree adoption, water saving) with defined activity types, geographic scope, dates, capacity, and target metrics. |
| FR-036 | S | The system shall display published campaigns and challenges and allow participants to filter them by category, emirate, organization, dates, and status. |
| FR-037 | M | The system shall deterministically validate participant eligibility, enrollment period, and remaining capacity before enrolling a participant or team, and allow withdrawal prior to completion. |
| FR-038 | M | The system shall update challenge progress based on linked Accepted activities, mark challenges completed, and issue configured certificates or recognition exactly once when completion criteria are met. |
| FR-039 | M | The system shall prevent retrospective changes to published eligibility or completion rules for active programs and preserve historical records if a program is canceled. |

## Coordinate Community Teams
| ID | P | Statement |
|---|---|---|
| FR-040 | S | The system shall allow a participant to create a family, school, residential, or corporate team and manage invitations, membership requests, roles, and archiving. |
| FR-041 | S | The system shall allow a participant to attribute an activity to an eligible team in which they held active membership at the time of the activity without creating a duplicate activity record. |
| FR-042 | S | The system shall calculate team points, activity counts, environmental contributions, and challenge progress from distinct Accepted activities attributed to the team, preserving historical team totals if a member later leaves. |

## Calculate Environmental Impact
| ID | P | Statement |
|---|---|---|
| FR-043 | M | The system shall allow authorized administrators to configure environmental impact calculation methods, conversion factors, units, source references, effective dates, and version identifiers, and retain the calculation-method version used for each recorded impact result. |
| FR-044 | M | The system shall automatically calculate environmental contributions using only the validated quantities of Accepted activities. |
| FR-045 | M | The system shall display trees planted, waste recycled or collected (kg), water conserved (L), energy saved (kWh), and estimated carbon emission reductions (kg CO₂e) as separate metrics labeled as estimates. |
| FR-046 | M | The system shall ensure that each Accepted activity is credited only once toward its assigned challenge and, where applicable, its associated team, campaign, and individual or community impact totals, preventing the same activity from being reused to earn credit for another challenge or team. |

## Map Environmental Opportunities
| ID | P | Statement |
|---|---|---|
| FR-047 | S | The system shall display an interactive map of published community campaigns, cleanup locations, and recycling drop-off points while masking exact residential coordinates of individual participants. |

## Recommend Relevant Activities
| ID | P | Statement |
|---|---|---|
| FR-048 | M | The system shall obtain participant consent before using activity history and location preferences to generate personalized activity recommendations. |
| FR-049 | C | The system shall generate recommendations based on participant interests, UAE seasonal suitability (e.g., outdoor planting between October and March), and prior accepted activities, displaying the recommendation rationale. |
| FR-050 | S | The system shall allow a participant to dismiss recommendations or request alternatives and shall display non-personalized published programs when consent is absent. |

## Dispatch System Notifications
| ID | P | Statement |
|---|---|---|
| FR-051 | M | The system shall automatically notify a participant via the in-app inbox (and optional email/push channels) when an automated validation decision (Accepted, Returned for Correction, or Rejected) is issued, or when a badge, level, or challenge is completed. |
| FR-052 | S | The system shall notify affected participants regarding team invitations, membership decisions, and campaign updates or reminders. |

## Export Impact Reports
| ID | P | Statement |
|---|---|---|
| FR-053 | S | The system shall allow participants, organizers, and administrators to generate, and export filtered sustainability reports and certificates in PDF and CSV formats within their respective access scopes, including measurement units and estimate labels. |

## Maintain Audit Records
| ID | P | Statement |
|---|---|---|
| FR-054 | M | The system shall record an immutable audit log for every automated validation decision, AI confidence flag, reward issuance, and administrative configuration change, capturing the timestamp, rule or model version, and affected record ID. |
| FR-055 | S | The system shall allow an administrator to search audit records and inspect failed AI assessments or incomplete background jobs to trigger idempotent retries. |
