<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\Hire;
use Illuminate\Http\Request;
use App\Models\Project;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectBudgetSandbox;
use App\Models\ProjectAddendum;
use App\Models\ProjectProcurementRequest;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ProjectBudgetController extends Controller
{
    public function getDashboard(Project $project)
    {
        try {
            $userId = Auth::id();
            $isOwner = $project->user_id == $userId;
            $isPM = $project->pm_id && Auth::user()->role_type === 'project_manager' && Auth::user()->id == $project->pm_id;

            if (!$isOwner && !$isPM) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $project->load([
                'budgetTransactions', 
                'budgetSandboxItems', 
                'addendums.user',
                'addendums.teamMember',
                'addendums.assignedUser',
                'bidsArsitek' => fn($q) => $q->where('status', 'accepted')->with('arsitek.user'),
                'bidsKontraktor' => fn($q) => $q->where('status', 'accepted')->with('kontraktor.user'),
                'bidsNotaris' => fn($q) => $q->where('status', 'accepted')->with('notaris.user'),
                'bidsInterior' => fn($q) => $q->where('status', 'accepted')->with('interior.user'),
                'paymentTermins',
                'projectManager.user',
                'bidsProjectManager' => fn($q) => $q->whereIn('status', ['accepted', 'active', 'awaiting_payment'])
            ]);

            Log::info('Budget Dashboard Loaded', [
                'project_id' => $project->id,
                'budget_value' => $project->budget,
                'transaction_count' => $project->budgetTransactions->count()
            ]);

            $pmBid = $project->pm_id ? $project->bidsProjectManager->first() : null;

            return response()->json([
                'project_budget' => (string) $project->budget,
                'transactions' => $project->budgetTransactions->map(function($t) {
                    $t->amount = (string) $t->amount;
                    return $t;
                }),
                'sandbox_items' => $project->budgetSandboxItems->map(function($s) {
                    $s->estimated_amount = (string) $s->estimated_amount;
                    return $s;
                }),
                'addendums' => $project->addendums->map(function($a) {
                    $a->amount = (string) $a->amount;
                    return $a;
                }),
                'accepted_bids' => [
                    'project_manager' => ($project->pm_id && $project->projectManager) ? [
                        'id' => $project->pm_id,
                        'pm' => ['user' => ['name' => optional($project->projectManager->user)->name ?? 'Project Manager']],
                        'price' => $pmBid ? (string) ($pmBid->calculated_total ?? $pmBid->price) : null,
                        'payment_status' => $pmBid ? ($pmBid->payment_status ?? 'unpaid') : null,
                        'paid_at' => $pmBid && $pmBid->paid_at ? (string) $pmBid->paid_at : null
                    ] : null,
                    'arsitek' => $project->bidsArsitek->first() ? array_merge($project->bidsArsitek->first()->toArray(), ['price' => (string) $project->bidsArsitek->first()->price]) : null,
                    'kontraktor' => $project->bidsKontraktor->first() ? array_merge($project->bidsKontraktor->first()->toArray(), ['price' => (string) $project->bidsKontraktor->first()->price]) : null,
                    'notaris' => $project->bidsNotaris->first() ? array_merge($project->bidsNotaris->first()->toArray(), ['price' => (string) $project->bidsNotaris->first()->price]) : null,
                    'interior' => $project->bidsInterior->first() ? array_merge($project->bidsInterior->first()->toArray(), ['price' => (string) $project->bidsInterior->first()->price]) : null,
                ],
                'payment_termins' => $project->paymentTermins->map(function($pt) {
                    $pt->amount = (string) $pt->amount;
                    return $pt;
                }),
            ]);
        } catch (\Exception $e) {
            Log::error('Budget Dashboard Error: ' . $e->getMessage(), ['project_id' => $project->id]);
            // No raw exception text in the response body.
            return response()->json(['message' => 'Dashboard error'], 500);
        }
    }

    public function addTransaction(Request $request, Project $project, \App\Services\ProjectFinancialService $financialService)
    {
        try {
            $userId = Auth::id();
            $isOwner = $project->user_id === $userId;
            $isPM = $project->pm_id && Auth::user()->role_type === 'project_manager' && Auth::user()->id === $project->pm_id;

            if (!$isOwner) {
                return response()->json(['message' => 'Unauthorized. Only the project owner can adjust the total balance.'], 403);
            }

            $request->validate([
                'transaction_type' => 'required|in:deposit,adjustment_down',
                'amount' => 'required|numeric|min:1|max:99999999999999',
                'title' => 'required|string|max:255',
            ]);

            // SECURITY/CORRECTNESS: a `deposit` previously wrote ONLY a ledger
            // row and never moved `projects.budget`, so the owner's "Add
            // Funds" button appeared to add money while the server — which
            // enforces `budget - SUM(payments)` — refused the resulting
            // payments with "Insufficient project budget" and no explanation.
            // The escrow CEILING now moves with the ledger row.
            //
            // `adjustment_down` is a reduction of the ceiling, which deductBudget
            // already performed for non-payment types.
            $ok = $financialService->deductBudget(
                $project,
                (float) $request->amount,
                $request->transaction_type,
                $request->title
            );

            if (! $ok) {
                return response()->json(['message' => 'Transaction failed: insufficient escrow to reduce.'], 422);
            }

            $transaction = ProjectBudgetTransaction::where('project_id', $project->id)
                ->whereNull('reference_id')
                ->where('title', $request->title)
                ->where('transaction_type', $request->transaction_type)
                ->latest('id')
                ->first();

            Log::info('Transaction Recorded', ['id' => $transaction?->id]);

            return response()->json([
                'message' => 'Transaction recorded successfully',
                'transaction' => $transaction,
                'budget' => $project->fresh()->budget,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json(['message' => 'Validation error', 'errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            Log::error('Budget Transaction Error: ' . $e->getMessage(), [
                'project_id' => $project->id,
                'error' => $e->getMessage(),
            ]);
            // Never echo raw exception text to the client (it leaks internal
            // detail); the message is logged with the project id instead.
            return response()->json(['message' => 'Transaction failed. Please try again.'], 500);
        }
    }

    public function addSandboxItem(Request $request, Project $project)
    {
        $userId = Auth::id();
        $isOwner = $project->user_id === $userId;
        $isPM = $project->pm_id && Auth::user()->role_type === 'project_manager' && Auth::user()->id === $project->pm_id;

        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'title' => 'required|string|max:255',
            'estimated_amount' => 'required|numeric|min:1',
        ]);

        $item = ProjectBudgetSandbox::create([
            'project_id' => $project->id,
            'title' => $request->title,
            'estimated_amount' => $request->estimated_amount,
            'is_active' => true,
        ]);

        return response()->json(['item' => $item]);
    }

    public function toggleSandboxItem(Request $request, Project $project, $itemId)
    {
        $userId = Auth::id();
        $isOwner = $project->user_id === $userId;
        $isPM = $project->pm_id && Auth::user()->role_type === 'project_manager' && Auth::user()->id === $project->pm_id;

        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $item = ProjectBudgetSandbox::where('project_id', $project->id)->findOrFail($itemId);
        $item->update(['is_active' => !$item->is_active]);

        return response()->json(['item' => $item]);
    }

    public function updateSandboxItem(Request $request, Project $project, $itemId)
    {
        $userId = Auth::id();
        $isOwner = $project->user_id === $userId;
        $isPM = $project->pm_id && Auth::user()->role_type === 'project_manager' && Auth::user()->id === $project->pm_id;

        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'title' => 'required|string|max:255',
            'estimated_amount' => 'required|numeric|min:1',
        ]);

        $item = ProjectBudgetSandbox::where('project_id', $project->id)->findOrFail($itemId);
        $item->update([
            'title' => $request->title,
            'estimated_amount' => $request->estimated_amount,
        ]);

        return response()->json(['item' => $item]);
    }

    public function deleteSandboxItem(Project $project, $itemId)
    {
        $userId = Auth::id();
        $isOwner = $project->user_id === $userId;
        $isPM = $project->pm_id && Auth::user()->role_type === 'project_manager' && Auth::user()->id === $project->pm_id;

        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $item = ProjectBudgetSandbox::where('project_id', $project->id)->findOrFail($itemId);
        $item->delete();

        return response()->json(['message' => 'Sandbox item deleted successfully']);
    }

    /**
     * Tell the payee their money was released, and leave an audit trail.
     *
     * `source` is recorded on the activity row so arbitration can tell an
     * owner-declared release apart from a counterparty-verified one.
     *
     * ACCEPTS `Money`, NOT JUST `float`. For a termin the amount is the net after
     * retention and arrives as an `App\Support\Money`. The old `float` signature
     * forced a `(float)` cast at the call site, which threw on the object and
     * turned a successful payment into a 500 -- after the ledger row had already
     * been written, so the professional was paid and the owner got an error.
     * Formatting goes through `Money` for the same reason it exists everywhere
     * else: `number_format` on a float is how a sen becomes a visible lie.
     */
    private function recordPaymentReleased(Project $project, string $title, \App\Support\Money|float|int|string $amount, string $type, int $id, string $source = 'owner_declared'): void
    {
        $money = $amount instanceof \App\Support\Money ? $amount : \App\Support\Money::fromColumn($amount);

        $formatted = 'Rp '.number_format($money->toFloat(), 0, ',', '.');

        \App\Models\ProjectActivityLog::create([
            'project_id' => $project->id,
            'user_id' => Auth::id(),
            'action' => 'payment_released',
            'details' => "{$title} ({$formatted}) released by the project owner [source: {$source}, ref: {$type}#{$id}].",
        ]);

        // Resolve the payee so the right person is told.
        $payeeId = null;

        if ($type === 'termin') {
            $termin = \App\Models\ProjectPaymentTermin::where('project_id', $project->id)->where('id', $id)->first();
            $payeeId = $termin?->recipient_id;
        } elseif (str_starts_with($type, 'bid_')) {
            // Relation names come from the bid models (mirroring
            // PaymentVerificationService::getBidderUserId): BidProjectManager
            // exposes `pm`, BidStructural `structuralEngineer`, BidMep
            // `mepEngineer` — not the column names.
            $map = [
                'bid_arsitek' => [\App\Models\BidArsitek::class, 'arsitek_id', 'arsitek'],
                'bid_kontraktor' => [\App\Models\BidKontraktor::class, 'kontraktor_id', 'kontraktor'],
                'bid_notaris' => [\App\Models\BidNotaris::class, 'notaris_id', 'notaris_profile'],
                'bid_interior' => [\App\Models\BidInterior::class, 'interior_id', 'interior_profile'],
                'bid_project_manager' => [\App\Models\BidProjectManager::class, 'pm_id', 'pm'],
                'bid_structural' => [\App\Models\BidStructural::class, 'structural_engineer_id', 'structuralEngineer'],
                'bid_mep' => [\App\Models\BidMep::class, 'mep_engineer_id', 'mepEngineer'],
            ];

            if (isset($map[$type])) {
                [$class, $fk, $relation] = $map[$type];
                $bid = $class::where('project_id', $project->id)->where('id', $id)->first();
                $payeeId = $bid ? $bid->{$relation}?->user_id : null;
            }
        } elseif ($type === 'addendum') {
            $addendum = \App\Models\ProjectAddendum::where('project_id', $project->id)->where('id', $id)->first();
            $payeeId = $addendum?->user_id;
        }

        if ($payeeId && (int) $payeeId !== (int) Auth::id()) {
            \App\Models\Notification::create([
                'user_id' => $payeeId,
                'type' => 'payment_verified',
                'title' => 'Payment Released',
                'body' => "The project owner confirmed payment of {$formatted} for \"{$title}\" on \"{$project->title}\".",
                'data' => [
                    'project_id' => $project->id,
                    'payment_type' => $type,
                    'payment_id' => $id,
                ],
            ]);
        }
    }

    /**
     * Refuse to re-charge a payment that dispute arbitration refunded.
     *
     * Bids track the payment in `payment_status`; termin/addendums in `status`.
     * Both end up on the negative-reversal path, so both are checked here in
     * one place instead of per branch.
     */
    private function assertNotRefunded(string $type, int $id, int $projectId): void
    {
        [$modelClass, $field] = match ($type) {
            'bid_arsitek' => [\App\Models\BidArsitek::class, 'payment_status'],
            'bid_kontraktor' => [\App\Models\BidKontraktor::class, 'payment_status'],
            'bid_notaris' => [\App\Models\BidNotaris::class, 'payment_status'],
            'bid_interior' => [\App\Models\BidInterior::class, 'payment_status'],
            'bid_structural' => [\App\Models\BidStructural::class, 'payment_status'],
            'bid_mep' => [\App\Models\BidMep::class, 'payment_status'],
            'bid_project_manager' => [\App\Models\BidProjectManager::class, 'payment_status'],
            'termin' => [\App\Models\ProjectPaymentTermin::class, 'status'],
            'addendum' => [\App\Models\ProjectAddendum::class, 'status'],
            default => [null, null],
        };

        if ($modelClass === null) {
            return;
        }

        $row = $modelClass::where('project_id', $projectId)->where('id', $id)->first();

        // Missing row: the per-branch findOrFail below produces the 404.
        if (! $row) {
            return;
        }

        if (($row->{$field} ?? null) === 'refunded') {
            throw new \Exception(
                'This payment was refunded through dispute arbitration and cannot be charged again. Open a new dispute if the refund itself is disputed.',
                422
            );
        }
    }

    public function markPaid(Request $request, Project $project, \App\Services\ProjectFinancialService $financialService)    {
        $userId = Auth::id();
        $isOwner = $project->user_id === $userId;
        $isPM = $project->pm_id && Auth::user()->role_type === 'project_manager' && Auth::user()->id === $project->pm_id;

        if (!$isOwner) {
            return response()->json(['message' => 'Unauthorized. Only the project owner can confirm payments.'], 403);
        }

        $request->validate([
            'type' => 'required|in:bid_arsitek,bid_kontraktor,bid_notaris,bid_interior,bid_structural,bid_mep,bid_project_manager,addendum,termin',
            'id' => 'required|integer'
        ]);

        DB::beginTransaction();
        try {
            // DISPUTE FREEZE: 422 so the catch below surfaces the message to
            // the client (it only echoes $e->getMessage() for code 422).
            app(\App\Services\DisputeService::class)->assertNoOpenDispute($project);

            // SECURITY (double-spend): a payment refunded through dispute
            // arbitration carries payment_status/status = 'refunded' and has a
            // NEGATIVE ledger row, while the original positive row is still
            // present. Each branch below only refused `=== 'paid'`, so the
            // owner could re-charge a refunded payment: the per-branch guard
            // passed, and then ProjectFinancialService::deductBudget found the
            // EXISTING row for that (reference_model, reference_id) and
            // short-circuited to `true` WITHOUT inserting a row — money leaves
            // the bank and the escrow ledger never learns about it.
            $this->assertNotRefunded($request->type, (int) $request->id, (int) $project->id);

            $amount = 0;
            $title = '';
            $referenceModel = '';

            if ($request->type === 'bid_arsitek') {
                $bid = \App\Models\BidArsitek::where('project_id', $project->id)->findOrFail($request->id);
                if ($bid->payment_status === 'paid') {
                    throw new \Exception('This payment has already been marked as paid.', 422);
                }
                $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);
                $amount = $bid->calculated_total ?? $bid->price;
                $title = 'Paid Architect Base Fee';
                $referenceModel = 'App\Models\BidArsitek';
            } elseif ($request->type === 'bid_kontraktor') {
                $bid = \App\Models\BidKontraktor::where('project_id', $project->id)->findOrFail($request->id);
                if ($bid->payment_status === 'paid') {
                    throw new \Exception('This payment has already been marked as paid.', 422);
                }
                $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);
                $amount = $bid->calculated_total ?? $bid->price;
                $title = 'Paid Contractor Base Fee';
                $referenceModel = 'App\Models\BidKontraktor';
            } elseif ($request->type === 'bid_project_manager') {
                $bid = \App\Models\BidProjectManager::where('project_id', $project->id)->findOrFail($request->id);
                if ($bid->payment_status === 'paid') {
                    throw new \Exception('This payment has already been marked as paid.', 422);
                }
                $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);
                $amount = $bid->calculated_total ?? $bid->price;
                $title = 'Paid Project Manager Base Fee';
                $referenceModel = 'App\Models\BidProjectManager';
                // TRAP: bids_project_manager.pm_id is a PROFILE id while
                // projects.pm_id stores the PM's USER id.
                $pmProfile = \App\Models\ProjectManager::find($bid->pm_id);
                if ($pmProfile && !$project->pm_id) {
                    $project->update(['pm_id' => $pmProfile->user_id]);
                }
            } elseif ($request->type === 'bid_notaris') {
                $bid = \App\Models\BidNotaris::where('project_id', $project->id)->findOrFail($request->id);
                if ($bid->payment_status === 'paid') {
                    throw new \Exception('This payment has already been marked as paid.', 422);
                }
                $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);
                $amount = $bid->calculated_total ?? $bid->price;
                $title = 'Paid Notaris Base Fee';
                $referenceModel = 'App\Models\BidNotaris';
            } elseif ($request->type === 'bid_interior') {
                $bid = \App\Models\BidInterior::where('project_id', $project->id)->findOrFail($request->id);
                if ($bid->payment_status === 'paid') {
                    throw new \Exception('This payment has already been marked as paid.', 422);
                }
                $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);
                $amount = $bid->calculated_total ?? $bid->price;
                $title = 'Paid Interior Designer Base Fee';
                $referenceModel = 'App\Models\BidInterior';
            } elseif ($request->type === 'bid_structural') {
                $bid = \App\Models\BidStructural::where('project_id', $project->id)->findOrFail($request->id);
                if ($bid->payment_status === 'paid') {
                    throw new \Exception('This payment has already been marked as paid.', 422);
                }
                $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);
                $amount = $bid->calculated_total ?? $bid->price;
                $title = 'Paid Structural Engineer Resource';
                $referenceModel = 'App\Models\BidStructural';
                $project->update(['structural_id' => $bid->structural_id]);
            } elseif ($request->type === 'bid_mep') {
                $bid = \App\Models\BidMep::where('project_id', $project->id)->findOrFail($request->id);
                if ($bid->payment_status === 'paid') {
                    throw new \Exception('This payment has already been marked as paid.', 422);
                }
                $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);
                $amount = $bid->calculated_total ?? $bid->price;
                $title = 'Paid MEP Engineer Resource';
                $referenceModel = 'App\Models\BidMep';
                $project->update(['mep_id' => $bid->mep_id]);
            } elseif ($request->type === 'addendum') {
                $addendum = ProjectAddendum::where('project_id', $project->id)->findOrFail($request->id);
                if ($addendum->status === 'paid') {
                    throw new \Exception('This payment has already been marked as paid.', 422);
                }
                $addendum->update(['status' => 'paid', 'paid_at' => now()]);
                $amount = $addendum->amount;
                $title = 'Paid Addendum: ' . $addendum->title;
                $referenceModel = 'App\Models\ProjectAddendum';
                // Budget math includes paid addendums — touch the project so
                // the cached calculateBudgetSummary (keyed on updated_at)
                // invalidates immediately.
                $project->touch();

                if ($addendum->procurement_request_id) {
                    $procReq = ProjectProcurementRequest::find($addendum->procurement_request_id);
                    if ($procReq) {
                        $procReq->update(['status' => 'authorized']);
                    }
                }

                // Finalize specialist assignment if this was a specialist hiring addendum
                if (in_array($addendum->type, ['specialist_assignment', 'specialist_request']) && ($addendum->team_member_id || $addendum->assigned_user_id)) {
                    $subRole = $addendum->specialist_type ?: $addendum->role_type;
                    $specialistUserId = null;
                    $specialistName = '';

                    if ($addendum->assigned_user_id) {
                        $user = \App\Models\User::find($addendum->assigned_user_id);
                        if ($user) {
                            $specialistUserId = $user->id;
                            $specialistName = $user->name;
                        }
                    } else {
                        $teamMember = \App\Models\TeamMember::find($addendum->team_member_id);
                        if ($teamMember) {
                            $specialistName = $teamMember->name;
                        }
                    }

                    if ($specialistName || $specialistUserId) {
                        \App\Models\ProjectSubProfessional::updateOrCreate(
                            ['project_id' => $project->id, 'sub_role' => $subRole],
                            [
                                'user_id' => $specialistUserId,
                                'parent_role' => $addendum->role_type,
                                // AUDIT: `assigned_by` is "who hired this sub-
                                // professional". It was being filled with
                                // `$addendum->user_id`, which is the AUTHOR of the
                                // addendum — a professional who merely proposed the
                                // hire. So the record claimed the specialist was
                                // assigned by themselves, and arbitration could not
                                // tell who actually committed to the sub-contract.
                                // The actor performing the hire is the owner (or PM)
                                // confirming payment, i.e. the authenticated caller.
                                // The column is NOT NULL, so a system-created
                                // addendum with a null author also 500'd here.
                                'assigned_by' => $userId,
                                'status' => 'active',
                                'rate' => $addendum->amount,
                                'lead_pro_notes' => "Assigned via Paid Addendum: {$specialistName}",
                                'hired_at' => now(),
                            ]
                        );

                        if ($subRole === 'structural') {
                            $struc = $specialistUserId ? \App\Models\StructuralEngineer::where('user_id', $specialistUserId)->first() : null;
                            $project->update(['structural_id' => $struc ? $struc->id : null]);
                        } elseif ($subRole === 'mep') {
                            $mep = $specialistUserId ? \App\Models\MepEngineer::where('user_id', $specialistUserId)->first() : null;
                            $project->update(['mep_id' => $mep ? $mep->id : null]);
                        } elseif ($subRole === 'interior') {
                            $interior = $specialistUserId ? \App\Models\InteriorProfile::where('user_id', $specialistUserId)->first() : null;
                            $project->update(['selected_interior_id' => $interior ? $interior->id : null]);
                        }
                    }
                }

                // Also handle 4C Specialist hiring addendums
                if ($addendum->recommended_bid_id && $addendum->recommended_bid_type) {
                    if ($addendum->recommended_bid_type === 'structural') {
                        // SCOPED TO THIS PROJECT.
                        //
                        // `find($id)` resolved the row by primary key alone, so a
                        // `recommended_bid_id` pointing at ANOTHER project's bid
                        // had its amount debited from THIS project's escrow and
                        // set `structural_id` from the other project's engineer.
                        // The addendum is validated and authorised against this
                        // project, so the bid it points at must belong to it too.
                        $bid = \App\Models\BidStructural::where('project_id', $project->id)
                            ->find($addendum->recommended_bid_id);
                        if ($bid) {
                            $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);
                            $project->update(['structural_id' => $bid->structural_id]);

                            // MONEY CORRECTNESS: this flipped the specialist bid
                            // to paid WITHOUT any ledger row, so the escrow never
                            // saw the money leave, the bid became permanently
                            // un-payable (verifyProof rejects 'paid'), and the
                            // amount vanished from every financial report.
                            //
                            // MONEY CORRECTNESS (2026-09-29): the call below also
                            // DISCARDED its return value. `recordPayment()`
                            // returns false when the escrow cannot cover the fee,
                            // in which case no ledger row is written — but the
                            // `payment_status = 'paid'` write above had already
                            // been committed, leaving a bid permanently
                            // un-payable with no money ever leaving escrow. This
                            // is the exact shape money:detect-duplicates flags
                            // (and it had already produced one such row in the
                            // dev data). Throwing rolls the whole thing back,
                            // so the bid is only marked paid if it is also paid.
                            $specialistFee = (float) ($bid->calculated_total ?? $bid->price ?? 0);
                            if ($specialistFee > 0 && ! $financialService->recordPayment(
                                $project,
                                $specialistFee,
                                'Paid Structural Engineer Fee (via specialist addendum)',
                                'App\Models\BidStructural',
                                $bid->id
                            )) {
                                throw new \Exception(
                                    'Insufficient project budget to record the structural engineer fee of '
                                    .'Rp '.number_format($specialistFee, 0, ',', '.').'.',
                                    422
                                );
                            }
                        }
                    } elseif ($addendum->recommended_bid_type === 'mep') {
                        // Scoped to this project, as above.
                        $bid = \App\Models\BidMep::where('project_id', $project->id)
                            ->find($addendum->recommended_bid_id);
                        if ($bid) {
                            $bid->update(['payment_status' => 'paid', 'paid_at' => now()]);
                            $project->update(['mep_id' => $bid->mep_id]);

                            $specialistFee = (float) ($bid->calculated_total ?? $bid->price ?? 0);
                            if ($specialistFee > 0 && ! $financialService->recordPayment(
                                $project,
                                $specialistFee,
                                'Paid MEP Engineer Fee (via specialist addendum)',
                                'App\Models\BidMep',
                                $bid->id
                            )) {
                                throw new \Exception(
                                    'Insufficient project budget to record the MEP engineer fee of '
                                    .'Rp '.number_format($specialistFee, 0, ',', '.').'.',
                                    422
                                );
                            }
                        }
                    }
                }
            } elseif ($request->type === 'termin') {
                $termin = \App\Models\ProjectPaymentTermin::where('project_id', $project->id)->findOrFail($request->id);
                if ($termin->status === 'paid') {
                    throw new \Exception('This payment has already been marked as paid.', 422);
                }
                $termin->update(['status' => 'paid', 'paid_at' => now()]);

                // DEBIT THE NET, NOT THE GROSS. This is what makes retention real.
                //
                // `$termin->amount` is the contracted stage value. Retention is the
                // slice of it held back until the warranty expires, so paying the
                // GROSS here would hand the professional money that is supposed to
                // stay in escrow -- and the later release would then be a SECOND
                // debit of the same rupiah, against a ceiling that no longer had it.
                //
                // `net_amount` is computed from the gross by
                // `ProjectPaymentTermin::creating()` using the configured retention
                // percent, so this cannot drift from the figure shown at negotiation.
                //
                // Termin rows predating D1 have `net_amount` of 0. Falling back to
                // the gross for those is the honest answer: they carry no retention
                // to withhold, and paying 0 would be worse than paying the contract.
                $retentionHeld = app(\App\Services\RetentionService::class)->forTermin($termin);
                $amount = $retentionHeld['net'];

                
                // CRITICAL FIX: Include role in title so it's not always "Contractor"
                $roleLabel = match($termin->role_type) {
                    'notaris' => 'Notary',
                    'project_manager', 'pm' => 'Project Manager',
                    'arsitek' => 'Architect',
                    'interior' => 'Interior',
                    default => 'Contractor',
                };
                
                $title = "Paid {$roleLabel} Termin: " . $termin->label;
                $referenceModel = 'App\Models\ProjectPaymentTermin';
            }

            // Debit through the shared financial service so this legacy path has
            // the same guarantees as verifyProof: project row lock (TOCTOU),
            // affordability check against budget minus ledger, and one ledger
            // row per reference (the unique index is the final backstop).
            //
            // NO `(float)` CAST. For a termin `$amount` is now an `App\Support\Money`
            // (the net, after retention), and casting it threw when the object was
            // reached. `deductBudget()` accepts `Money|string|int|float` and converts
            // internally, so passing it through untouched is both correct and the
            // reason a float never has to appear on a money path.
            $deducted = $financialService->deductBudget(
                $project,
                $amount,
                'payment',
                $title,
                $referenceModel,
                (int) $request->id
            );

            if (!$deducted) {
                throw new \Exception('Insufficient project budget to record this payment.', 422);
            }

            // AUDIT + NOTIFICATION (2026-09-23). markPaid is the owner's
            // "I already transferred it" button — the most common real flow on a
            // marketplace with no payment gateway — and it was completely
            // silent: the professional's dashboard never changed, and dispute
            // arbitration had no way to distinguish an owner-declared release
            // from a counterparty-verified one.
            $this->recordPaymentReleased($project, $title, $amount, $request->type, (int) $request->id);

            // Invalidate the cached budget summary immediately.
            $project->touch();

            DB::commit();
            return response()->json([
                'message' => 'Successfully marked as paid and deducted from budget.',
                'budget' => $project->fresh()->budget,
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            $status = is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 500 ? $e->getCode() : 500;
            if ($status !== 422) {
                Log::error('markPaid failed: ' . $e->getMessage(), [
                    'project_id' => $project->id,
                    'type' => $request->type,
                    'id' => $request->id,
                ]);
            }
            return response()->json([
                'message' => $status === 422 ? $e->getMessage() : 'Failed to process payment tracking.',
            ], $status);
        }
    }

    // Professional endpoints for Addendums
    public function createAddendum(Request $request, Project $project)
    {
        // Only hired professionals can create addendums
        $user = Auth::user();

        // Was five `== optional(...)->id` comparisons, one per role, using LOOSE
        // equality. With no architect on the project and no profile on the user
        // that is `null == null`, which is TRUE in PHP -- so any user whose
        // role_type matched a role the project had not filled would pass. It is
        // the same null-comparison family as the Hire bug, hand-rolled again.
        // Delegated to the one implementation.
        if (!Hire::matches($project, $user, (string) $user->role_type)) {
            return response()->json(['message' => 'Unauthorized. Must be hired professional.'], 403);
        }

        $roleType = $user->role_type;
        $userId = $user->id;

        $request->validate([
            'title' => 'required|string|max:255',
            'amount' => 'required|numeric|min:1',
            'description' => 'nullable|string',
            'type' => 'nullable|string|in:extra_fee,specialist_assignment',
            'team_member_id' => 'nullable|exists:team_members,id',
            'assigned_user_id' => 'nullable|exists:users,id',
            'specialist_type' => 'nullable|string|in:structural,mep',
            'attachment' => 'nullable|file|mimes:jpg,jpeg,png,webp,pdf|max:10240', // 10MB; no arbitrary types on public disk
        ]);

        $attachmentPath = null;
        if ($request->hasFile('attachment')) {
            $attachmentPath = $request->file('attachment')->store('addendums', 'public');
        }

        $addendum = ProjectAddendum::create([
            'project_id' => $project->id,
            'role_type' => $roleType,
            'user_id' => $userId,
            'title' => $request->title,
            'amount' => $request->amount,
            'description' => $request->description,
            'type' => $request->type ?? 'extra_fee',
            'team_member_id' => $request->team_member_id,
            'assigned_user_id' => $request->assigned_user_id,
            'specialist_type' => $request->specialist_type,
            'attachment_path' => $attachmentPath,
            'status' => 'pending_approval',
        ]);

        return response()->json(['message' => 'Addendum submitted for client approval.', 'addendum' => $addendum]);
    }

    public function handleAddendumStatus(Request $request, Project $project, $addendumId)
    {
        $user = Auth::user();

        $addendum = ProjectAddendum::where('project_id', $project->id)->find($addendumId);

        if (!$addendum) {
            return response()->json(['message' => 'Addendum not found.'], 404);
        }

        // Two distinct powers, deliberately not merged:
        //
        //   AUTHORISER  the owner or the assigned PM. Decides money.
        //   PROPOSER    the professional who raised it. May only respond to a
        //               counter-offer, and may never authorise their own fee.
        //
        // The bug this replaces: the gate was
        //
        //     !($isPro && $addendum->status === 'negotiating')
        //
        // which admitted the proposer ONLY while negotiating -- and then let that
        // same caller pass any status from the validator, including
        // `approved_unpaid`, plus an arbitrary `amount`. So a professional could
        // authorise their own fee and set its value in one call, and the
        // notification it produced was hardcoded to say "Budget Authorized by
        // Owner" (line 751) -- a forged approval attributed to the client.
        $isAuthoriser = Hire::isOwnerOrAssignedPm($project, $user);
        $isProposer = (int) $addendum->user_id === (int) $user->id;

        if (!$isAuthoriser && !$isProposer) {
            return response()->json(['message' => 'Unauthorized. Only the project owner or assigned PM can authorise budget items.'], 403);
        }

        $request->validate([
            'status' => 'required|in:approved_unpaid,rejected,negotiating,pending_approval,accepted_by_pro',
            'amount' => 'nullable|numeric|min:0',
            'counter_offer_amount' => 'nullable|numeric|min:0',
            'negotiation_note' => 'nullable|string',
        ]);

        // THE PROPOSER'S ALLOWED MOVES, IN ONE PLACE.
        //
        // A counter-offer may be accepted, or answered with a revised counter.
        // Both are non-monetary positions in a negotiation. Authorising,
        // rejecting and re-submitting are the author's decisions, not the
        // proposer's.
        $proposerMaySet = ['accepted_by_pro', 'negotiating'];

        if (!$isAuthoriser) {
            if (!in_array($request->status, $proposerMaySet, true)) {
                return response()->json([
                    'message' => 'A professional may accept or counter a negotiation, but cannot authorise or reject their own addendum. That is the Owner\'s or PM\'s decision.',
                ], 403);
            }

            if ($addendum->status !== 'negotiating') {
                return response()->json(['message' => 'This addendum has no open negotiation to respond to.'], 422);
            }

            // Counter-offer fields are the OTHER side's instrument. A proposer
            // writing them would be forging the counter they are responding to.
            if ($request->has('counter_offer_amount') || $request->has('negotiation_note')) {
                return response()->json([
                    'message' => 'Counter-offer amount and note are set by the Owner or PM, not by the proposing professional.',
                ], 403);
            }
        }

        if (!in_array($addendum->status, ['pending_approval', 'negotiating', 'accepted_by_pro'], true)) {
            return response()->json(['message' => 'This item has already been processed or is not in a negotiable state.'], 422);
        }

        return DB::transaction(function () use ($request, $project, $addendum, $isAuthoriser, $user) {
            $financialService = app(\App\Services\ProjectFinancialService::class);

            // WHO is acting, for the audit trail and the notification copy. The
            // old code hardcoded "Owner" for anyone who was not the PM, so a
            // professional's action was announced to the client as the client's
            // own approval.
            $actorLabel = $user->role_type === 'project_manager' ? 'Project Manager' : 'Owner';

            // The amount may only be revised while a negotiation is OPEN, and
            // only by the authoriser or the proposer (both branches reach here).
            // Once the item is authorised or accepted, the figure is binding.
            if ($request->has('amount') && in_array($addendum->status, ['pending_approval', 'negotiating'], true)) {
                $addendum->amount = $request->amount;
            } elseif ($request->has('amount')) {
                return response()->json([
                    'message' => 'The agreed amount is binding once an addendum leaves negotiation.',
                ], 422);
            }

            // ACCEPTING a counter-offer adopts the counter figure. Letting the
            // proposer keep their own number while nominally "accepting" the
            // other side's would be the forgery this whole method exists to
            // prevent.
            if ($request->status === 'accepted_by_pro' && $addendum->counter_offer_amount !== null) {
                $addendum->amount = $addendum->counter_offer_amount;
            }

            $addendum->update(['status' => $request->status]);
    
                if ($request->status === 'approved_unpaid') {
                    // Authoriser-only: the proposer is structurally unable to
                    // reach this branch (see $proposerMaySet).
                    $notificationTitle = "Budget Authorized by {$actorLabel}";
                    $notificationBody = "The {$actorLabel} has approved the budget of Rp " . number_format($addendum->amount, 0, ',', '.') . " for \"{$addendum->title}\". Please proceed with the payment.";

                    // If PM authorized, notify Owner. If Owner authorized, notify PM.
                    $notifyId = ($user->role_type === 'project_manager') ? $project->user_id : $project->pm_id;

                    if ($notifyId) {
                        \App\Models\Notification::create([
                            'user_id' => $notifyId,
                            'type' => 'budget_approved',
                            'title' => $notificationTitle,
                            'body' => $notificationBody,
                            'data' => ['project_id' => $project->id],
                        ]);
                    }

                    \App\Models\ProjectActivityLog::create([
                        'project_id' => $project->id,
                        'user_id' => Auth::id(),
                        'action' => 'budget_authorized',
                        'details' => "{$actorLabel} authorized budget: {$addendum->title} (Rp " . number_format($addendum->amount, 0, ',', '.') . ") - Awaiting Payment",
                    ]);

                    return response()->json(['message' => 'Budget authorized successfully. Awaiting payment from the Project Owner.']);
                }

            if ($request->status === 'negotiating') {
                // Reachable by BOTH sides now: the authoriser opening a
                // negotiation, or the proposer answering one with a revised
                // counter. Each notifies the OTHER side.
                if ($isAuthoriser) {
                    // Notify the professional who proposed it.
                    if ($addendum->user_id) {
                        \App\Models\Notification::create([
                            'user_id' => $addendum->user_id,
                            'type' => 'budget_negotiation',
                            'title' => 'Fee Negotiation Requested',
                            'body' => "The {$actorLabel} has requested a fee negotiation for \"{$addendum->title}\". Counter-offer: Rp " . number_format($request->counter_offer_amount, 0, ',', '.'),
                            'data' => ['project_id' => $project->id],
                        ]);
                    }

                    $addendum->update([
                        'status' => 'negotiating',
                        'counter_offer_amount' => $request->counter_offer_amount,
                        'negotiation_note' => $request->negotiation_note
                    ]);

                    \App\Models\ProjectActivityLog::create([
                        'project_id' => $project->id,
                        'user_id' => Auth::id(),
                        'action' => 'budget_negotiating',
                        'details' => "{$actorLabel} requested fee negotiation for: {$addendum->title} (Counter-offer: Rp " . number_format($request->counter_offer_amount, 0, ',', '.') . ")",
                    ]);
                } else {
                    // The proposer revising their own counter. The author's
                    // instrument is left untouched -- overwriting
                    // `counter_offer_amount` here would destroy the position
                    // they are answering.
                    $addendum->update(['status' => 'negotiating']);

                    $notifyId = ($project->pm_id) ? $project->pm_id : $project->user_id;

                    \App\Models\Notification::create([
                        'user_id' => $notifyId,
                        'type' => 'budget_negotiation',
                        'title' => 'Revised Fee Proposed',
                        'body' => "The {$addendum->role_type} revised their fee for \"{$addendum->title}\" to Rp " . number_format($addendum->amount, 0, ',', '.') . '.',
                        'data' => ['project_id' => $project->id],
                    ]);

                    \App\Models\ProjectActivityLog::create([
                        'project_id' => $project->id,
                        'user_id' => Auth::id(),
                        'action' => 'budget_negotiating',
                        'details' => "Professional revised fee for: {$addendum->title} (Rp " . number_format($addendum->amount, 0, ',', '.') . ")",
                    ]);
                }

                return response()->json(['message' => 'Negotiation request sent.']);
            }

            if ($request->status === 'accepted_by_pro') {
                // The proposer accepted the author's counter-offer. The figure was
                // already moved onto `$addendum->amount` above.
                $addendum->update(['status' => 'accepted_by_pro']);

                \App\Models\Notification::create([
                    'user_id' => ($project->pm_id) ? $project->pm_id : $project->user_id,
                    'type' => 'budget_counter_accepted',
                    'title' => 'Counter-offer Accepted',
                    'body' => "The {$addendum->role_type} accepted the fee of Rp " . number_format($addendum->amount, 0, ',', '.') . " for \"{$addendum->title}\". It is ready to be authorised.",
                    'data' => ['project_id' => $project->id, 'addendum_id' => $addendum->id],
                ]);

                \App\Models\ProjectActivityLog::create([
                    'project_id' => $project->id,
                    'user_id' => Auth::id(),
                    'action' => 'budget_counter_accepted',
                    'details' => "Professional accepted counter-offer for: {$addendum->title} (Rp " . number_format($addendum->amount, 0, ',', '.') . ")",
                ]);

                return response()->json(['message' => 'Counter-offer accepted. Awaiting authorisation.']);
            }

            // Rejected — authoriser-only, same reason as approved_unpaid.
            $notifyId = ($user->role_type === 'project_manager') ? $project->user_id : $project->pm_id;

            if ($notifyId) {
                \App\Models\Notification::create([
                    'user_id' => $notifyId,
                    'type' => 'budget_rejected',
                    'title' => "Budget Authorization Rejected by {$actorLabel}",
                    'body' => "The {$actorLabel} has rejected the budget for \"{$addendum->title}\". Please discuss with the {$actorLabel}.",
                    'data' => ['project_id' => $project->id],
                ]);
            }

            \App\Models\ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'budget_rejected',
                'details' => "{$actorLabel} rejected budget: {$addendum->title}",
            ]);

            return response()->json(['message' => 'Budget authorization rejected.']);
        });
    }
}
