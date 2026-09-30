<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ProjectTerminationController extends Controller
{
    /**
     * Owner fires a professional from the project.
     */
    public function fireProfessional(Request $request, Project $project)
    {
        $user = Auth::user();
        if ($project->user_id !== $user->id) {
            return response()->json(['message' => 'Only the project owner can terminate contracts.'], 403);
        }

        // State guard: finished projects are historical records — firing a pro
        // from one would corrupt milestones/history retroactively.
        if (in_array($project->status, ['completed', 'cancelled'])) {
            return response()->json(['message' => "Cannot terminate contracts on a {$project->status} project."], 422);
        }

        $request->validate([
            // The seven licensed roles. `project_manager` is accepted as an alias of `pm`
            // because `users.role_type` spells it the long way and a caller
            // reading a user record naturally sends that; `normaliseRole()`
            // collapses both. `structural` and `mep` were absent here
            // entirely, which meant the endpoint 422'd before doing anything —
            // a structural engineer or an MEP engineer could not be fired at
            // all. Seven further places in this method also omitted them, so
            // widening the validation alone would have produced a 200 that
            // marked nothing, notified nobody, voided no payment stage and
            // still counted the bid as allocated.
            'role_type' => 'required|in:arsitek,kontraktor,interior,notaris,pm,project_manager,structural,mep',
            'reason' => 'required|string|max:500',
        ]);

        $role = self::normaliseRole($request->role_type);
        $column = $this->getColumnForRole($role);
        $professionalId = $project->$column;

        if (!$professionalId) {
            return response()->json(['message' => "No professional of type {$role} is currently hired."], 422);
        }

        return DB::transaction(function () use ($project, $role, $column, $request) {
            // 1. Log the termination
            ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'professional_fired',
                'details' => "Owner terminated contract for {$role}. Reason: {$request->reason}",
            ]);

            // 2. MARK BID AS TERMINATED
            $bid = $this->updateBidStatusOnTermination($project, $role, 'terminated');

            // 3. ACCOUNTABILITY: Notify Professional & Deduct Reliability Score
            if ($bid) {
                $profileRelation = match($role) {
                    'arsitek' => 'arsitek',
                    'kontraktor' => 'kontraktor',
                    'interior' => 'interior',
                    'notaris' => 'notaris',
                    'pm' => 'projectManager',
                    // Relation names, not column names — mirroring
                    // BidStructural::structuralEngineer / BidMep::mepEngineer.
                    'structural' => 'structuralEngineer',
                    'mep' => 'mepEngineer',
                };
                
                $profile = $bid->$profileRelation;

                if ($profile) {
                    // Notify the professional
                    if ($profile->user_id) {
                        Notification::create([
                            'user_id' => $profile->user_id,
                            'type' => 'contract_terminated',
                            'title' => 'Contract Terminated',
                            'body' => "Your contract for \"{$project->title}\" was terminated by the owner. Reason: {$request->reason}",
                            'data' => ['project_id' => $project->id],
                        ]);
                    }

                    // Deduct reliability score (10% for being fired) - Floor at 0
                    $profile->update([
                        'reliability_score' => max(0, ($profile->reliability_score ?? 100) - 10)
                    ]);
                }
            }

            // 4. CLEANUP: Delete uncompleted milestones for this role.
            // Milestones use their own column names (kontraktor_id, not
            // selected_kontraktor_id) and, for the PM, store a PROFILE id while
            // projects.pm_id stores a USER id.
            $milestoneColumn = $this->getMilestoneColumnForRole($role);
            $milestoneColumnValue = $role === 'pm'
                ? (\App\Models\ProjectManager::find($professionalId)?->id ?? $professionalId)
                : $project->$column;

            $project->milestones()
                ->where($milestoneColumn, $milestoneColumnValue)
                ->where('is_completed', false)
                ->delete();

            // 4b. MONEY SETTLEMENT: void every unpaid payment stage for this
            // role. Previously termination touched milestones only, leaving
            // `pending`/`invoice_sent` termins payable with the fired
            // professional still set as `recipient_id` — and verifyProof
            // authorizes on `recipient_id` alone, so a fired pro could still
            // accept an in-flight proof and pull a ledger debit.
            $this->settlePaymentStages($project, self::toTerminRoleType($role), 'terminated');

            // 5. Clear the professional from the project
            $project->update([$column => null]);

            // 6. Reopen project for bidding if it's a primary role or PM
            if (in_array($role, self::REOPENABLE_ROLES, true)) {
                // If it was in progress, we might need to reset it to open to get a replacement
                if ($project->status === 'in_progress') {
                    $project->update(['status' => 'open']);
                }
            }

            return response()->json(['message' => "Contract for {$role} terminated successfully. Project is reopened for bidding."]);
        });
    }

    /**
     * Professional resigns from the project.
     */
    public function resignFromProject(Request $request, Project $project)
    {
        $user = Auth::user();

        // State guard: no resignations from finished projects either.
        if (in_array($project->status, ['completed', 'cancelled'])) {
            return response()->json(['message' => "Cannot resign from a {$project->status} project."], 422);
        }

        $role = self::normaliseRole((string) $user->role_type);
        $column = $this->getColumnForRole($role);

        // BUGFIX: for the PM role, projects.pm_id holds the USER id — compare
        // against $user->id; every other role compares profile ids.
        $isHired = $role === 'pm'
            ? (int) $project->pm_id === (int) $user->id
            : ($column && (int) $project->$column === (int) $this->getProfileIdForUser($user, $role));

        if (!$isHired) {
            return response()->json(['message' => 'You are not hired for this role on this project.'], 403);
        }

        $request->validate([
            'reason' => 'required|string|max:500',
        ]);

        return DB::transaction(function () use ($project, $role, $column, $request, $user) {
            ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => $user->id,
                'action' => 'professional_resigned',
                'details' => "Professional ({$role}) resigned from the project. Reason: {$request->reason}",
            ]);

            // 1. Notify Owner
            Notification::create([
                'user_id' => $project->user_id,
                'type' => 'professional_resigned',
                'title' => 'Professional Resigned',
                'body' => "The {$role} for your project \"{$project->title}\" has resigned. Reason: {$request->reason}",
                'data' => ['project_id' => $project->id],
            ]);

            // 2. Mark bid as resigned
            $bid = $this->updateBidStatusOnTermination($project, $role, 'resigned');

            // 3. ACCOUNTABILITY: Deduct Reliability Score for resignation (5%) - Floor at 0
            $profileId = $this->getProfileIdForUser($user, $role);
            $profileModel = match($role) {
                'arsitek' => \App\Models\Arsitek::class,
                'kontraktor' => \App\Models\Kontraktor::class,
                'interior' => \App\Models\InteriorProfile::class,
                'notaris' => \App\Models\NotarisProfile::class,
                'pm' => \App\Models\ProjectManager::class,
                'structural' => \App\Models\StructuralEngineer::class,
                'mep' => \App\Models\MepEngineer::class,
            };

            if ($profileId && $profileModel) {
                $profile = $profileModel::find($profileId);
                if ($profile) {
                    $profile->update([
                        'reliability_score' => max(0, ($profile->reliability_score ?? 100) - 5)
                    ]);
                }
            }

            // 4. CLEANUP: Delete uncompleted milestones for this role.
            // Milestones use their own column names, and for the PM they store
            // a PROFILE id while projects.pm_id stores a USER id.
            $milestoneValue = $role === 'pm'
                ? (\App\Models\ProjectManager::find($profileId)?->id ?? $profileId)
                : $project->$column;

            $project->milestones()
                ->where($this->getMilestoneColumnForRole($role), $milestoneValue)
                ->where('is_completed', false)
                ->delete();

            // 4b. MONEY SETTLEMENT — see fireProfessional.
            //
            // BUGFIX: this read `$role === 'project_manager'`, which is NEVER
            // true — `$role` comes from `$user->role_type`, and the PM's
            // role_type in this codebase is `pm` (the same token
            // getColumnForRole and getMilestoneColumnForRole match on). So a
            // RESIGNING project manager's unpaid payment stages were passed to
            // settlePaymentStages as role_type `pm`, which matches no stage —
            // payment stages are stored with role_type `project_manager` — and
            // their stages were silently left payable.
            //
            // That is the same defect class as the `verifying`-stage guard
            // settlePaymentStages exists to provide: verifyProof authorizes on
            // `recipient_id` alone, so a resigned PM could still accept an
            // in-flight proof and pull a ledger debit against a contract they
            // had left. fireProfessional already translated the token
            // correctly; this path did not.
            $this->settlePaymentStages($project, self::toTerminRoleType($role), 'resigned');

            // 5. Clear the professional from the project
            $project->update([$column => null]);

            if (in_array($role, self::REOPENABLE_ROLES, true)) {
                if ($project->status === 'in_progress') {
                    $project->update(['status' => 'open']);
                }
            }

            return response()->json(['message' => 'Resignation submitted successfully.']);
        });
    }

    /**
     * Close out a departing professional's payment schedule.
     *
     * Any stage still `verifying` is left untouched and reported, because money
     * is mid-flight and only dispute arbitration can settle it. Every unpaid
     * stage becomes `void` so it can never be verified, and the owner gets an
     * explicit count of what is being written off.
     */
    private function settlePaymentStages(Project $project, string $roleType, string $reason): array
    {
        $inFlight = $project->paymentTermins()
            ->where('role_type', $roleType)
            ->where('status', 'verifying')
            ->pluck('id');

        $voided = $project->paymentTermins()
            ->where('role_type', $roleType)
            ->whereIn('status', ['locked', 'pending', 'invoice_sent'])
            ->update([
                'status' => 'void',
                'notes' => "Voided automatically — contract {$reason}.",
            ]);

        if ($voided || $inFlight->isNotEmpty()) {
            ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'payment_stages_settled',
                'details' => "Payment settlement for {$roleType} ({$reason}): {$voided} stage(s) voided"
                    .($inFlight->isNotEmpty() ? ', '.count($inFlight).' stage(s) left in flight (verifying) for dispute arbitration' : '').'.',
            ]);
        }

        return ['voided' => $voided, 'in_flight' => $inFlight->all()];
    }

    /**
     * Roles whose departure reopens the project for re-bidding.
     *
     * Shared by fireProfessional and resignFromProject so the two cannot drift
     * apart again — they each carried their own copy of the list.
     *
     * @var list<string>
     */
    private const REOPENABLE_ROLES = [
        'arsitek', 'kontraktor', 'pm', 'interior', 'notaris', 'structural', 'mep',
    ];

    /**
     * The internal role token used by the BID tables and the PROJECT columns.
 *
 * As `role_type` is spelled on `project_payment_termins`.
 */
    private static function toTerminRoleType(string $role): string
    {
        return $role === 'pm' ? 'project_manager' : $role;
    }

    /**
     * Normalise a role to the token this controller's matches use: `pm`.
     *
     * THE BUG THIS EXISTS TO FIX
     * -------------------------
     * Two vocabularies are in play and they disagree in exactly one place:
     *
     *   users.role_type     enum(... 'project_manager' ...)   <- the LONG form
     *   bids / project cols 'pm'                              <- the SHORT form
     *   payment termins     'project_manager'                 <- the LONG form
     *
     * `fireProfessional` receives its role from the REQUEST, and the SPA sends
     * `pm`, so it happened to land in the right vocabulary. `resignFromProject`
     * reads `$user->role_type`, which is `project_manager` — and every `match`
     * in this file only knows `pm`. So:
     *
     *     $column   = getColumnForRole('project_manager')   => null
     *     $isHired  = $column && ...                        => false
     *     => 403 "You are not hired for this role"
     *
     * A project manager could NEVER resign. Not a subtle money leak: the
     * endpoint refused outright, so the payment stages below were unreachable
     * for that role and the reason nobody had noticed.
     *
     * Normalising once, here, makes both entry points agree. `toTerminRoleType`
     * converts back on the way out for the payment stages, which use the long
     * form.
     */
    private static function normaliseRole(string $role): string
    {
        return $role === 'project_manager' ? 'pm' : $role;
    }

    private function getColumnForRole($role)
    {
        return match ($role) {
            'arsitek' => 'selected_arsitek_id',
            'kontraktor' => 'selected_kontraktor_id',
            'interior' => 'selected_interior_id',
            'notaris' => 'selected_notaris_id',
            'pm' => 'pm_id',
            // These two use the bare column name, not a `selected_*` prefix —
            // they were added with the 4C Specialist feature and never adopted
            // the older naming.
            'structural' => 'structural_id',
            'mep' => 'mep_id',
            default => null,
        };
    }

    /**
     * The matching column on `project_milestones`.
     *
     * BUGFIX (found by tests/PaymentIntegrityTest): the milestone cleanup used
     * the PROJECT's column name (`selected_kontraktor_id`) against
     * `project_milestones`, which stores plain `kontraktor_id`. MySQL raised
     * "Unknown column", so firing or any role other than the PM has ALWAYS
     * 500'd at this step — the professional was never actually removed.
     */
    private function getMilestoneColumnForRole($role)
    {
        return match ($role) {
            'arsitek' => 'arsitek_id',
            'kontraktor' => 'kontraktor_id',
            'interior' => 'interior_id',
            'notaris' => 'notaris_id',
            'pm' => 'pm_id',
            'structural' => 'structural_id',
            'mep' => 'mep_id',
            default => null,
        };
    }

    private function updateBidStatusOnTermination(Project $project, $role, $status)
    {
        $modelClass = match ($role) {
            'arsitek' => \App\Models\BidArsitek::class,
            'kontraktor' => \App\Models\BidKontraktor::class,
            'interior' => \App\Models\BidInterior::class,
            'notaris' => \App\Models\BidNotaris::class,
            'pm' => \App\Models\BidProjectManager::class,
            // Without these two, `default => null` meant a structural or MEP
            // engineer's bid was never marked terminated: no termination
            // record, no notification, no reliability penalty, and the bid kept
            // counting as allocated against the owner's budget forever.
            'structural' => \App\Models\BidStructural::class,
            'mep' => \App\Models\BidMep::class,
            default => null,
        };

        if ($modelClass) {
            // BUGFIX: only looked for status='accepted', which doesn't exist
            // until the first termin is paid — early firings/resignations used
            // to skip the notification + reliability penalty entirely.
            // 'active' was also missing: a bid whose payment already cleared
            // (work underway) matched nothing, so it stayed 'active' forever,
            // kept counting as allocated, and produced no termination record,
            // notification or reliability penalty.
            $bid = $modelClass::where('project_id', $project->id)
                ->whereIn('status', ['accepted', 'awaiting_payment', 'contract_pending', 'active'])
                ->latest()
                ->first();

            if ($bid) {
                $bid->update(['status' => $status]);
                return $bid;
            }
        }
        return null;
    }

    private function getProfileIdForUser($user, $role)
    {
        return match ($role) {
            'arsitek' => $user->arsitek?->id,
            'kontraktor' => $user->kontraktor?->id,
            'interior' => $user->interior_profile?->id,
            'notaris' => $user->notaris_profile?->id,
            'pm' => $user->project_manager?->id,
            'structural' => $user->structural_engineer?->id,
            'mep' => $user->mep_engineer?->id,
            // BUGFIX: this was `default => $user->id`. Every caller compares the
            // result against a PROJECT column that stores a PROFILE id, so for
            // any unrecognised role the function returned a USER id — and the
            // comparison only failed to match by coincidence, or matched a
            // completely unrelated profile. A user id is never the right answer
            // to "which profile is this", so an unknown role now yields null and
            // the caller correctly reports "you are not hired".
            default => null,
        };
    }
}
