<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProjectRequest;
use App\Http\Requests\UpdateProjectRequest;
use App\Http\Resources\ProjectResource;
use App\Services\ProjectPhaseService;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectMilestone;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ProjectController extends Controller
{
    public function index(\Illuminate\Http\Request $request)
    {
        $user = Auth::guard('sanctum')->user();

        $query = Project::with([
            'images', 
            'milestones', 
            'requirements',
            'user',
            'arsitek.user.phoneNumber',
            'kontraktor.user.phoneNumber',
            'notaris.user.phoneNumber',
            'interior.user.phoneNumber',
            'projectManager.user',
            'addendums',
            'documents.uploader'
        ])
            ->withCount(['bidsArsitek', 'bidsKontraktor', 'bidsNotaris', 'bidsInterior', 'bidsProjectManager', 'bidsStructural']);

        if ($request->query('with_bids') === 'true') {
            $query->with([
                'bidsArsitek.arsitek.user',
                'bidsKontraktor.kontraktor.user',
                'bidsNotaris.notaris.user',
                'bidsInterior.interior.user',
                'bidsProjectManager.pm.user',
                'bidsStructural.structuralEngineer.user',
            ]);
        }

        if (! $user) {
            // Public failsafe: only show open projects tagged for 'both' (or just don't show any)
            $query->where('status', 'open');

            return ProjectResource::collection($query->paginate(50));
        }

        // Professional Discovery Logic - ONLY if specifically requested
        if ($user->role_type !== 'user' && ($request->query('feed') === 'true' || $request->query('discovery') === 'true')) {
            $query->where('user_id', '!=', $user->id); // Exclude own projects

            if ($user->role_type === 'arsitek') {
                $arsitekId = optional($user->arsitek)->id;
                $query->whereIn('target_role', ['both', 'arsitek'])
                    ->whereJsonContains('published_bidding_roles', 'arsitek')
                    ->whereIn('status', ['open', 'accepted_kontraktor', 'in_progress'])
                    ->whereNull('selected_arsitek_id')
                    ->whereDoesntHave('bidsArsitek', function ($q) use ($arsitekId) {
                        $q->where('arsitek_id', $arsitekId);
                    });
            } elseif ($user->role_type === 'kontraktor') {
                $kontraktorId = optional($user->kontraktor)->id;
                $query->where(function ($q) {
                    $q->where('target_role', 'kontraktor')
                        ->orWhere(function ($sq) {
                            $sq->where('target_role', 'both')
                                ->whereNotNull('design_completed_at');
                        });
                })
                    ->whereJsonContains('published_bidding_roles', 'kontraktor')
                    ->whereIn('status', ['open', 'accepted_arsitek', 'procurement', 'in_progress'])
                    ->whereNull('selected_kontraktor_id')
                    ->whereDoesntHave('bidsKontraktor', function ($q) use ($kontraktorId) {
                        $q->where('kontraktor_id', $kontraktorId);
                    });
            } elseif ($user->role_type === 'notaris') {
                $notarisId = optional($user->notaris_profile)->id;
                $query->where(function ($q) {
                    $q->whereJsonContains('needed_phases', 'legal')
                        ->orWhereNull('needed_phases')
                        ->orWhere('needed_phases', '[]');
                })
                    ->whereJsonContains('published_bidding_roles', 'notaris')
                    ->whereIn('status', ['open', 'accepted_arsitek', 'accepted_kontraktor', 'in_progress']);
            } elseif ($user->role_type === 'interior') {
                $interiorId = optional($user->interior_profile)->id;
                $query->where(function ($q) {
                    $q->whereJsonContains('needed_phases', 'interior')
                        ->orWhereNull('needed_phases')
                        ->orWhere('needed_phases', '[]');
                })
                    ->whereJsonContains('published_bidding_roles', 'interior')
                    ->whereIn('status', ['open', 'accepted_arsitek', 'accepted_kontraktor', 'in_progress']);
            } elseif ($user->role_type === 'project_manager') {
                $pmId = optional($user->project_manager)->id;
                $query->where('wants_project_manager', true)
                    ->whereJsonContains('published_bidding_roles', 'project_manager')
                    ->whereNull('pm_id')
                    ->whereIn('status', ['open', 'accepted_arsitek', 'accepted_kontraktor', 'in_progress'])
                    ->whereDoesntHave('bidsProjectManager', function ($q) use ($pmId) {
                        $q->where('pm_id', $pmId);
                    });
            }

            return ProjectResource::collection($query->latest()->limit(50)->get());
        }

        if ($user->role_type === 'user') {
            // Client only sees their own projects by default
            $query->where('user_id', $user->id);
            // Default sort for user
            $query->latest();
        } elseif ($user->role_type === 'arsitek') {
            $arsitek = \App\Models\Arsitek::where('user_id', $user->id)->first();
            if ($arsitek) {
                $query->where('selected_arsitek_id', $arsitek->id);
            } else {
                $query->whereRaw('1 = 0'); // Return empty if no profile
            }
            $query->latest();
        } elseif ($user->role_type === 'kontraktor') {
            $kontraktor = \App\Models\Kontraktor::where('user_id', $user->id)->first();
            if ($kontraktor) {
                $query->where('selected_kontraktor_id', $kontraktor->id);
            } else {
                $query->whereRaw('1 = 0');
            }
            $query->latest();
        } elseif ($user->role_type === 'notaris') {
            $notaris = \App\Models\NotarisProfile::where('user_id', $user->id)->first();
            if ($notaris) {
                $query->where('selected_notaris_id', $notaris->id);
            } else {
                $query->whereRaw('1 = 0');
            }
            $query->latest();
        } elseif ($user->role_type === 'interior') {
            $interior = \App\Models\InteriorProfile::where('user_id', $user->id)->first();
            if ($interior) {
                $query->where('selected_interior_id', $interior->id);
            } else {
                $query->whereRaw('1 = 0');
            }
            $query->latest();
        } elseif ($user->role_type === 'project_manager') {
            $query->where('pm_id', $user->id);
            $query->latest();
        } elseif ($user->role_type === 'structural') {
            $structural = \App\Models\StructuralEngineer::where('user_id', $user->id)->first();
            if ($structural) {
                $query->where('structural_id', $structural->id);
            } else {
                $query->whereRaw('1 = 0');
            }
            $query->latest();
        } elseif ($user->role_type === 'mep') {
            $mep = \App\Models\MepEngineer::where('user_id', $user->id)->first();
            if ($mep) {
                $query->where('mep_id', $mep->id);
            } else {
                $query->whereRaw('1 = 0');
            }
            $query->latest();
        } else {
            // General professionals or unknown roles: show nothing in "My projects" unless hired
            $query->whereRaw('1 = 0');
        }

        if ($request->query('all') === 'true') {
            return ProjectResource::collection($query->latest()->get());
        }

        return ProjectResource::collection($query->latest()->paginate(50));
    }

    public function store(StoreProjectRequest $request)
    {
        $data = $request->validated();
        $data['user_id'] = Auth::id();
        $data['status'] = 'open';
        $data['wants_project_manager'] = filter_var($request->wants_project_manager, FILTER_VALIDATE_BOOLEAN);
        $data['project_dimensions'] = json_decode($request->project_dimensions, true);
        
        $neededPhases = json_decode($request->needed_phases, true) ?? [];
        $data['needed_phases'] = $neededPhases;

        // Auto-publish the first non-management phase if PM is not wanted, 
        // or just management if PM is wanted.
        $published = [];
        if ($data['wants_project_manager']) {
            $published[] = 'project_manager';
        } else {
            // Find the first professional role needed
            $roleMap = [
                'legal' => 'notaris',
                'design' => 'arsitek',
                'build' => 'kontraktor',
                'interior' => 'interior'
            ];
            foreach ($neededPhases as $phase) {
                if (isset($roleMap[$phase])) {
                    $published[] = $roleMap[$phase];
                    break;
                }
            }
        }
        $data['published_bidding_roles'] = $published;

        if ($request->hasFile('attachment')) {
            $data['attachment'] = $request->file('attachment')->store('project_attachments', 'public');
        }

        DB::beginTransaction();
        try {
            $project = Project::create($data);

            // Save multiple images
            if ($request->hasFile('images')) {
                foreach ($request->file('images') as $i => $image) {
                    $path = $image->store('project_images', 'public');
                    $project->images()->create([
                        'image_path' => $path,
                        'sort_order' => $i,
                    ]);
                }
            }

            $project->load('images');

            ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'project_created',
                'details' => "Project \"{$project->title}\" was posted",
            ]);

            DB::commit();
            return new ProjectResource($project);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Failed to publish project.',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function show(Project $project)
    {
        $project->load([
            'arsitek.user.phoneNumber',
            'kontraktor.user.phoneNumber',
            'notaris.user.phoneNumber',
            'interior.user.phoneNumber',
            'structuralEngineer.user.phoneNumber',
            'mepEngineer.user.phoneNumber',
            'bidsArsitek.arsitek.user.phoneNumber',
            'bidsKontraktor.kontraktor.user.phoneNumber',
            'bidsNotaris.notaris.user.phoneNumber',
            'bidsInterior.interior.user.phoneNumber',
            'bidsStructural.structuralEngineer.user.phoneNumber',
            'bidsMep.mepEngineer.user.phoneNumber',
            'bidsProjectManager.pm.user',
            'images',
            'milestones',
            'user',
            'ratings',
            'kontraktorRating',
            'materialOrders.deliveryJob',
            'requirements',
            'projectManager.user',
            'addendums',
            'documents.uploader'
        ])->loadCount(['bidsArsitek', 'bidsKontraktor', 'bidsNotaris', 'bidsInterior', 'bidsProjectManager', 'bidsStructural', 'bidsMep']);

        return new ProjectResource($project);
    }

    public function submitBid(Request $request, Project $project, \App\Services\BidCalculationService $calculationService)
    {
        $user = Auth::user();

        if (! in_array($user->role_type, ['arsitek', 'kontraktor', 'notaris', 'interior', 'structural', 'mep'])) {
            return response()->json(['message' => 'Only verified professionals can submit bids.'], 403);
        }

        $allowedStatuses = ['open', 'accepted_arsitek', 'accepted_kontraktor', 'procurement', 'in_progress'];
        if (! in_array($project->status, $allowedStatuses)) {
            return response()->json(['message' => 'This project is no longer accepting bids.'], 422);
        }

        // Role-specific vacancy check
        if ($user->role_type === 'arsitek' && $project->selected_arsitek_id) {
            return response()->json(['message' => 'An architect has already been hired for this project.'], 422);
        }
        if ($user->role_type === 'kontraktor' && $project->selected_kontraktor_id) {
            return response()->json(['message' => 'A contractor has already been hired for this project.'], 422);
        }
        if ($user->role_type === 'notaris' && $project->selected_notaris_id) {
            return response()->json(['message' => 'A notary has already been hired for this project.'], 422);
        }
        if ($user->role_type === 'interior' && $project->selected_interior_id) {
            return response()->json(['message' => 'An interior designer has already been hired for this project.'], 422);
        }
        if ($user->role_type === 'structural' && $project->structural_id) {
            return response()->json(['message' => 'A structural engineer has already been hired for this project.'], 422);
        }
        if ($user->role_type === 'mep' && $project->mep_id) {
            return response()->json(['message' => 'An MEP engineer has already been hired for this project.'], 422);
        }

        // Project target role check
        if ($project->target_role !== 'both' && $project->target_role !== $user->role_type) {
            return response()->json(['message' => "This project is not seeking a {$user->role_type}."], 422);
        }

        // Sequential Bidding Constraint
        if ($user->role_type === 'kontraktor' && $project->target_role === 'both' && !$project->design_completed_at) {
            return response()->json(['message' => 'Contractor bids are only accepted after the design package has been finalized and sealed by the Architect.'], 422);
        }

        $request->validate([
            'price' => 'required|numeric|min:0',
            'proposal' => 'required|string|max:2000',
            'estimated_duration' => 'nullable|integer|min:1',
            'duration_unit' => 'nullable|string|in:days,weeks,months',
            'fee_type' => 'nullable|string|in:fixed,percentage,unit',
            'unit_price' => 'nullable|numeric|min:0',
            'quantity' => 'nullable|numeric|min:0',
        ]);
        $attachments = [];
        for ($i = 1; $i <= 3; $i++) {
            $key = "attachment_$i";
            if ($request->hasFile($key)) {
                $path = $request->file($key)->store('bid_attachments', 'public');
                $attachments[$key] = $path;
            } else {
                $attachments[$key] = null;
            }
        }

        // Calculate the actual total based on fee type
        $calc = $calculationService->calculate($request->all(), $project);

        $baseData = [
            'project_id' => $project->id,
            'price' => $calc['price'],
            'fee_type' => $calc['fee_type'],
            'unit_price' => $calc['unit_price'],
            'quantity' => $calc['quantity'],
            'calculated_total' => $calc['calculated_total'],
            'proposal' => $request->proposal,
            'estimated_duration' => $request->estimated_duration,
            'duration_unit' => $request->duration_unit,
            'attachment_1' => $attachments['attachment_1'],
            'attachment_2' => $attachments['attachment_2'],
            'attachment_3' => $attachments['attachment_3'],
            'status' => 'pending',
        ];

        if ($user->role_type === 'arsitek') {
            $profile = \App\Models\Arsitek::where('user_id', $user->id)->firstOrFail();

            if ($profile->verification_status !== 'verified') {
                return response()->json(['message' => 'Your account is pending verification. You can only bid once verified.'], 403);
            }

            // Prevent duplicate bids
            $existing = \App\Models\BidArsitek::where('project_id', $project->id)
                ->where('arsitek_id', $profile->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }

            \App\Models\BidArsitek::create(array_merge($baseData, [
                'arsitek_id' => $profile->id,
                'scopes' => is_string($request->scopes) ? json_decode($request->scopes, true) : $request->scopes,
                'deliverables' => is_string($request->deliverables) ? json_decode($request->deliverables, true) : $request->deliverables,
            ]));
        } elseif ($user->role_type === 'kontraktor') {
            $profile = \App\Models\Kontraktor::where('user_id', $user->id)->firstOrFail();

            if ($profile->verification_status !== 'verified') {
                return response()->json(['message' => 'Your account is pending verification. You can only bid once verified.'], 403);
            }

            $existing = \App\Models\BidKontraktor::where('project_id', $project->id)
                ->where('kontraktor_id', $profile->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }

            \App\Models\BidKontraktor::create(array_merge($baseData, [
                'kontraktor_id' => $profile->id,
                'construction_method' => $request->construction_method,
                'cost_breakdown' => $request->cost_breakdown ? json_decode($request->cost_breakdown, true) : null,
                'workforce_count' => $request->workforce_count,
                'equipment_owned' => $request->equipment_owned,
                'warranty_months' => $request->warranty_months ?? 6,
                'payment_preference' => $request->payment_preference,
                'scopes' => is_string($request->scopes) ? json_decode($request->scopes, true) : $request->scopes,
                'deliverables' => is_string($request->deliverables) ? json_decode($request->deliverables, true) : $request->deliverables,
            ]));
        } elseif ($user->role_type === 'notaris') {
            $profile = \App\Models\NotarisProfile::where('user_id', $user->id)->firstOrFail();

            if ($profile->verification_status !== 'verified') {
                return response()->json(['message' => 'Your account is pending verification. You can only bid once verified.'], 403);
            }

            $existing = \App\Models\BidNotaris::where('project_id', $project->id)
                ->where('notaris_id', $profile->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }

            \App\Models\BidNotaris::create(array_merge($baseData, [
                'notaris_id' => $profile->id,
                'tax_estimate' => $request->tax_estimate,
                'selected_services' => $request->selected_services ? json_decode($request->selected_services, true) : null,
            ]));
        } elseif ($user->role_type === 'interior') {
            $profile = \App\Models\InteriorProfile::where('user_id', $user->id)->firstOrFail();

            if ($profile->verification_status !== 'verified') {
                return response()->json(['message' => 'Your account is pending verification. You can only bid once verified.'], 403);
            }

            $existing = \App\Models\BidInterior::where('project_id', $project->id)
                ->where('interior_id', $profile->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }

            \App\Models\BidInterior::create(array_merge($baseData, [
                'interior_id' => $profile->id,
                'scopes' => $request->scopes,
                'deliverables' => $request->deliverables,
            ]));
        } elseif ($user->role_type === 'structural') {
            $profile = \App\Models\StructuralEngineer::where('user_id', $user->id)->firstOrFail();
            if ($profile->verification_status !== 'verified') {
                return response()->json(['message' => 'Your account is pending verification.'], 403);
            }
            \App\Models\BidStructural::create(array_merge($baseData, [
                'structural_id' => $profile->id,
                'scopes' => $request->scopes,
                'deliverables' => $request->deliverables,
                'fee_type' => $request->fee_type ?? 'fixed',
                'unit_price' => $request->unit_price,
                'quantity' => $request->quantity,
                'calculated_total' => $request->calculated_total,
            ]));
        } elseif ($user->role_type === 'mep') {
            $profile = \App\Models\MepEngineer::where('user_id', $user->id)->firstOrFail();
            if ($profile->verification_status !== 'verified') {
                return response()->json(['message' => 'Your account is pending verification.'], 403);
            }
            \App\Models\BidMep::create(array_merge($baseData, [
                'mep_id' => $profile->id,
                'scopes' => $request->scopes,
                'deliverables' => $request->deliverables,
                'fee_type' => $request->fee_type ?? 'fixed',
                'unit_price' => $request->unit_price,
                'quantity' => $request->quantity,
                'calculated_total' => $request->calculated_total,
            ]));
        }

        // Notify Project Owner
        Notification::create([
            'user_id' => $project->user_id,
            'type' => 'bid_received',
            'title' => 'New Bid Received!',
            'body' => "A professional has submitted a bid for your project: \"{$project->title}\".",
            'data' => ['project_id' => $project->id, 'bidder_name' => $user->name],
        ]);

        $project->load([
            'bidsArsitek.arsitek.user', 
            'bidsKontraktor.kontraktor.user', 
            'bidsNotaris.notaris.user', 
            'bidsInterior.interior.user', 
            'bidsProjectManager.pm.user',
            'images', 
            'user', 
            'ratings', 
            'kontraktorRating',
            'projectManager.user'
        ]);

        return new ProjectResource($project);
    }

    /**
     * PBG Verification Gate. Unlocks physical construction.
     */
    public function verifyPBG(Project $project)
    {
        $user = Auth::user();
        $isOwner = $project->user_id === $user->id;
        $isPM = $project->pm_id && $user->role_type === 'project_manager' && $user->id === $project->pm_id;
        
        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Only the Project Owner or assigned Project Manager can verify PBG compliance.'], 403);
        }

        return DB::transaction(function () use ($project, $user) {
            $project->update([
                'pbg_verified_at' => now()
            ]);

            \App\Models\ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => $user->id,
                'action' => 'pbg_verified',
                'details' => "PBG (Building Permit) verified. The construction phase is now officially unlocked.",
            ]);

            return new ProjectResource($project);
        });
    }

    /**
     * SLF Verification Gate. Unlocks final handover.
     */
    public function verifySLF(Project $project)
    {
        $user = Auth::user();
        $isOwner = $project->user_id === $user->id;
        $isPM = $project->pm_id && $user->role_type === 'project_manager' && $user->id === $project->pm_id;
        
        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Only the Project Owner or assigned Project Manager can verify SLF compliance.'], 403);
        }

        return DB::transaction(function () use ($project, $user) {
            $project->update([
                'slf_verified_at' => now()
            ]);

            \App\Models\ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => $user->id,
                'action' => 'slf_verified',
                'details' => "SLF (Certificate of Occupancy) verified. Final completion is authorized.",
            ]);

            return new ProjectResource($project);
        });
    }

    /**
     * PM/Owner approves the construction brief and locks it.
     */
    public function approveConstructionBrief(Project $project)
    {
        $user = Auth::user();
        $isOwner = $project->user_id === $user->id;
        $isPM = $project->pm_id && $user->role_type === 'project_manager' && $user->id === $project->pm_id;

        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Only the Project Owner or PM can approve the construction brief.'], 403);
        }

        if ($project->construction_brief_status !== 'pending_review') {
            return response()->json(['message' => 'Brief is not pending review.'], 422);
        }

        return DB::transaction(function () use ($project, $user) {
            $project->update([
                'construction_brief_status' => 'approved',
                'construction_locked_at' => now(),
                'construction_brief_revision_notes' => null,
            ]);

            \App\Models\ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => $user->id,
                'action' => 'construction_brief_approved',
                'details' => 'Construction brief approved and locked. Contractor may proceed once PBG is verified.',
            ]);

            return new ProjectResource($project);
        });
    }

    /**
     * PM/Owner requests revision on the construction brief.
     */
    public function reviseConstructionBrief(Request $request, Project $project)
    {
        $user = Auth::user();
        $isOwner = $project->user_id === $user->id;
        $isPM = $project->pm_id && $user->role_type === 'project_manager' && $user->id === $project->pm_id;

        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Only the Project Owner or PM can request revision.'], 403);
        }

        $request->validate([
            'notes' => 'required|string|max:2000',
        ]);

        $project->update([
            'construction_brief_status' => 'revision_requested',
            'construction_brief_revision_notes' => $request->notes,
            'construction_locked_at' => null,
        ]);

        \App\Models\ProjectActivityLog::create([
            'project_id' => $project->id,
            'user_id' => $user->id,
            'action' => 'construction_brief_revision',
            'details' => 'Revision requested: ' . $request->notes,
        ]);

        return new ProjectResource($project);
    }

    public function lockPhaseBrief(Request $request, Project $project)
    {
        $request->validate([
            'phase' => 'required|in:design,build',
        ]);

        $user = Auth::user();
        $phase = $request->phase;

        if ($phase === 'design') {
            $proProfile = $user->arsitek;
            if (!$proProfile || $project->selected_arsitek_id !== $proProfile->id) {
                return response()->json(['message' => 'Only the assigned architect can lock the design brief.'], 403);
            }
            // If already locked, just return success
            if (!$project->design_locked_at) {
                $project->update(['design_locked_at' => now()]);
            }
        } elseif ($phase === 'build') {
            $proProfile = $user->kontraktor;
            if (!$proProfile || $project->selected_kontraktor_id !== $proProfile->id) {
                return response()->json(['message' => 'Only the assigned contractor can submit the construction brief.'], 403);
            }
            // Contractor submits for review — does NOT lock directly
            if (!$project->construction_locked_at) {
                $project->update([
                    'construction_brief_status' => 'pending_review',
                    'construction_brief_revision_notes' => null,
                ]);
            }
        }

        $project->load([
            'bidsArsitek.arsitek.user', 
            'bidsKontraktor.kontraktor.user', 
            'bidsNotaris.notaris.user', 
            'bidsInterior.interior.user', 
            'bidsProjectManager.pm.user',
            'images', 
            'user', 
            'ratings', 
            'kontraktorRating',
            'projectManager.user'
        ]);

        return new ProjectResource($project);
    }

    public function acceptBid(Request $request, Project $project)
    {
        return DB::transaction(function () use ($request, $project) {
            $user = Auth::user();
            $isOwner = $project->user_id === $user->id;
            $isPM = $project->pm_id && $user->role_type === 'project_manager' && $user->id === $project->pm_id;

            if (!$isOwner && !$isPM) {
                return response()->json(['message' => 'Unauthorized. Must be project owner or the assigned Project Manager.'], 403);
            }

            if ($isOwner && $project->wants_project_manager) {
                return response()->json(['message' => 'This project is managed by a Project Manager. Only the Project Manager can hire professionals.'], 403);
            }

            $request->validate([
                'bid_id' => 'required|integer',
                'bid_type' => 'required|in:arsitek,kontraktor,notaris,interior,structural,mep',
            ]);

            $totalDeduction = 0;
            $bidderName = 'Professional';
            $bidderUserId = null;

            if ($request->bid_type === 'arsitek') {
                $bid = \App\Models\BidArsitek::where('id', $request->bid_id)->where('project_id', $project->id)->firstOrFail();
                $bid->update(['status' => 'accepted']);
                \App\Models\BidArsitek::where('project_id', $project->id)->where('id', '!=', $bid->id)->update(['status' => 'rejected']);

                $totalDeduction = $bid->calculated_total ?? $bid->price;
                $bidderName = $bid->arsitek->user->name ?? 'Architect';
                $bidderUserId = $bid->arsitek->user_id;

                if ($project->target_role === 'arsitek' || $project->status === 'accepted_kontraktor') {
                    $project->update(['selected_arsitek_id' => $bid->arsitek_id, 'status' => 'in_progress']);
                } else {
                    $project->update(['selected_arsitek_id' => $bid->arsitek_id, 'status' => 'accepted_arsitek']);
                }
            } elseif ($request->bid_type === 'kontraktor') {
                $bid = \App\Models\BidKontraktor::where('id', $request->bid_id)->where('project_id', $project->id)->firstOrFail();
                $bid->update(['status' => 'accepted']);
                \App\Models\BidKontraktor::where('project_id', $project->id)->where('id', '!=', $bid->id)->update(['status' => 'rejected']);

                $totalDeduction = $bid->calculated_total ?? $bid->price;
                $bidderName = $bid->kontraktor->user->name ?? 'Contractor';
                $bidderUserId = $bid->kontraktor->user_id;

                if ($project->target_role === 'kontraktor' || $project->status === 'accepted_arsitek') {
                    $project->update(['selected_kontraktor_id' => $bid->kontraktor_id, 'status' => 'in_progress']);
                } else {
                    $project->update(['selected_kontraktor_id' => $bid->kontraktor_id, 'status' => 'accepted_kontraktor']);
                }
            } elseif ($request->bid_type === 'notaris') {
                $bid = \App\Models\BidNotaris::where('id', $request->bid_id)->where('project_id', $project->id)->firstOrFail();
                $bid->update(['status' => 'accepted']);
                \App\Models\BidNotaris::where('project_id', $project->id)->where('id', '!=', $bid->id)->update(['status' => 'rejected']);

                $professionalFee = $bid->calculated_total ?? $bid->price;
                $taxEstimate = $bid->tax_estimate ?? 0;
                $totalDeduction = $professionalFee + $taxEstimate;
                $bidderName = $bid->notaris->user->name ?? 'Notary';
                $bidderUserId = $bid->notaris->user_id;

                $project->update(['selected_notaris_id' => $bid->notaris_id, 'status' => 'in_progress']);

                // Seed Legal Milestones
                $rawRequirements = is_array($project->legal_requirements) ? $project->legal_requirements : [];
                if (empty($rawRequirements) && is_array($bid->selected_services)) {
                    $rawRequirements = $bid->selected_services;
                }
                $requirements = array_unique(['spk_contract', ...$rawRequirements, 'as_built_drawings', 'misc_legal']);
                $labels = [
                    'spk_contract' => 'SPK (Owner-Pro Contract)',
                    'land_verification' => 'AJB & Balik Nama (Title Due Diligence)',
                    'pbg_permit' => 'PBG (Building & Planning Permit)',
                    'as_built_drawings' => 'As-Built Drawings (Record Drawings)',
                    'slf_certification' => 'SLF Certification (Certificate of Occupancy)',
                    'misc_legal' => 'Field Reports (Misc Progress)'
                ];

                foreach ($requirements as $index => $req) {
                    $title = $labels[$req] ?? ucwords(str_replace(['_', '-'], ' ', (string)$req));

                    \App\Models\ProjectMilestone::firstOrCreate(
                        ['project_id' => $project->id, 'title' => $title],
                        [
                            'notaris_id' => $bid->notaris->user_id,
                            'description' => 'Final verified ' . $title . ' document and legal processing notes.',
                            'type' => 'legal',
                            'phase_context' => 'legal',
                            'sort_order' => $index,
                            'is_completed' => false,
                            'approval_status' => 'in_progress',
                        ]
                    );
                }
            } elseif ($request->bid_type === 'interior') {
                $bid = \App\Models\BidInterior::where('id', $request->bid_id)->where('project_id', $project->id)->firstOrFail();
                $bid->update(['status' => 'accepted']);
                \App\Models\BidInterior::where('project_id', $project->id)->where('id', '!=', $bid->id)->update(['status' => 'rejected']);

                $totalDeduction = $bid->calculated_total ?? $bid->price;
                $bidderName = $bid->interior->user->name ?? 'Interior Designer';
                $bidderUserId = $bid->interior->user_id;
                $project->update(['selected_interior_id' => $bid->interior_id]);
            } elseif ($request->bid_type === 'structural') {
                $bid = \App\Models\BidStructural::where('id', $request->bid_id)->where('project_id', $project->id)->firstOrFail();

                // GLOBAL STANDARD: Create a Change Order (Addendum) for Owner approval instead of direct hire
                $project->addendums()->create([
                    'role_type' => 'structural',
                    'user_id' => $user->id,
                    'title' => 'Engineering Resource: Structural Engineer Selection',
                    'description' => "Recommendation to hire " . ($bid->structuralEngineer->user->name ?? 'Specialist') . " for structural analysis.\nProposed Fee: Rp " . number_format($bid->price, 0, ',', '.'),
                    'amount' => $bid->calculated_total ?? $bid->price,
                    'status' => 'pending_approval',
                    'recommended_bid_id' => $bid->id,
                    'recommended_bid_type' => 'structural',
                ]);

                return response()->json(['message' => 'Structural engineering recommendation sent to project owner for budget authorization.']);
            } elseif ($request->bid_type === 'mep') {
                $bid = \App\Models\BidMep::where('id', $request->bid_id)->where('project_id', $project->id)->firstOrFail();

                // GLOBAL STANDARD: Create a Change Order (Addendum) for Owner approval instead of direct hire
                $project->addendums()->create([
                    'role_type' => 'mep',
                    'user_id' => $user->id,
                    'title' => 'Engineering Resource: MEP Engineer Selection',
                    'description' => "Recommendation to hire " . ($bid->mepEngineer->user->name ?? 'Specialist') . " for Mechanical, Electrical, and Plumbing design.\nProposed Fee: Rp " . number_format($bid->price, 0, ',', '.'),
                    'amount' => $bid->calculated_total ?? $bid->price,
                    'status' => 'pending_approval',
                    'recommended_bid_id' => $bid->id,
                    'recommended_bid_type' => 'mep',
                ]);

                return response()->json(['message' => 'MEP engineering recommendation sent to project owner for budget authorization.']);
            }

            // --- BUDGET AUTHORIZATION GATE (Indonesian Standard: Permen PUPR) ---
            // Instead of immediately deducting the budget, create an addendum
            // that requires explicit Owner approval before funds are allocated.
            $project->addendums()->create([
                'role_type' => $request->bid_type,
                'user_id' => $user->id,
                'title' => ucwords($request->bid_type) . ' Professional Fee Authorization',
                'description' => "PM recommends hiring {$bidderName} for project \"{$project->title}\".\nProposed Fee: Rp " . number_format($totalDeduction, 0, ',', '.'),
                'amount' => $totalDeduction,
                'status' => 'pending_approval',
                'recommended_bid_id' => $bid->id,
                'recommended_bid_type' => $request->bid_type,
            ]);

            // Notify the Owner that a budget authorization is pending
            Notification::create([
                'user_id' => $project->user_id,
                'type' => 'budget_authorization',
                'title' => 'Budget Authorization Required',
                'body' => "Your PM has hired {$bidderName} for project \"{$project->title}\". Please authorize the budget of Rp " . number_format($totalDeduction, 0, ',', '.') . ".",
                'data' => ['project_id' => $project->id],
            ]);

            // Notify the hired professional
            if ($bidderUserId) {
                Notification::create([
                    'user_id' => $bidderUserId,
                    'type' => 'bid_accepted',
                    'title' => 'Congratulations! Your Bid was Accepted',
                    'body' => "Your proposal for project \"{$project->title}\" has been accepted. Awaiting owner budget authorization.",
                    'data' => ['project_id' => $project->id],
                ]);
            }

            if ($project->status === 'in_progress') {
                \App\Models\ProjectMilestone::firstOrCreate(
                    ['project_id' => $project->id, 'title' => 'Project Kickoff'],
                    ['description' => 'Contract executed. The project is ready to begin.', 'status' => 'pending']
                );
            }

            ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'bid_accepted',
                'details' => "Accepted {$request->bid_type} bid. Budget authorization pending owner approval.",
            ]);

            $project->load([
                'arsitek.user.phoneNumber',
                'kontraktor.user.phoneNumber',
                'notaris.user.phoneNumber',
                'interior.user.phoneNumber',
                'bidsArsitek.arsitek.user.phoneNumber',
                'bidsKontraktor.kontraktor.user.phoneNumber',
                'bidsNotaris.notaris.user.phoneNumber',
                'bidsInterior.interior.user.phoneNumber',
                'bidsProjectManager.pm.user',
                'user',
                'images',
                'ratings',
                'kontraktorRating',
                'projectManager.user'
            ])->loadCount(['bidsArsitek', 'bidsKontraktor', 'bidsNotaris', 'bidsInterior', 'bidsProjectManager']);

            return new ProjectResource($project);
        });
    }

    /**
     * Submit planning brief for client approval.
     */
    public function submitPlanning(Project $project, Request $request)
    {
        // Only the selected architect can propose the plan
        if ($project->selected_arsitek_id !== Auth::user()->arsitek?->id) {
            return response()->json(['message' => 'Only the assigned architect can propose a design brief.'], 403);
        }

        $project->increment('planning_iteration');
        $project->update([
            'planning_status' => 'proposed',
            'planning_submitted_at' => now(),
            'architect_notes' => $request->architect_notes,
        ]);

        return new ProjectResource($project);
    }

    /**
     * Client approves the proposed planning brief.
     */
    public function approvePlanning(Project $project)
    {
        // Only the client (owner) can approve
        if ($project->user_id !== Auth::id()) {
            return response()->json(['message' => 'Only the project owner can approve the design brief.'], 403);
        }

        // If a PM exists, it must be PM verified first
        if ($project->pm_id && $project->planning_status !== 'pm_verified') {
            return response()->json(['message' => 'The project manager must verify the technical plan before you can approve.'], 422);
        }

        if ($project->planning_status !== 'proposed' && $project->planning_status !== 'pm_verified') {
            return response()->json(['message' => 'No active planning proposal found to approve.'], 422);
        }

        return DB::transaction(function () use ($project) {
            $project->update([
                'planning_status' => 'approved',
                'planning_approved_at' => now(),
                'design_payment_verified_at' => now(),
            ]);
            
            return new ProjectResource($project);
        });
    }

    /**
     * PM verifies the technical feasibility of the plan.
     */
    /**
     * PM saves draft audit notes or progress.
     */
    public function updatePlanningAudit(Project $project, Request $request)
    {
        if ($project->pm_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $request->validate([
            'pm_audit_notes' => 'nullable|string',
            'attachments.*' => 'nullable|file|mimes:jpg,jpeg,png,webp,pdf|max:5120',
        ]);

        return DB::transaction(function () use ($project, $request) {
            $attachments = $project->pm_audit_attachments ?? [];
            
            if ($request->hasFile('attachments')) {
                foreach ($request->file('attachments') as $file) {
                    if (count($attachments) < 3) {
                        $attachments[] = $file->store("projects/{$project->id}/pm_audits", 'public');
                    }
                }
            }

            $project->update([
                'pm_audit_notes' => $request->pm_audit_notes ?? $project->pm_audit_notes,
                'pm_audit_attachments' => $attachments,
            ]);

            return new ProjectResource($project);
        });
    }

    /**
     * PM verifies the technical feasibility of the plan.
     */
    public function verifyPlanningPM(Project $project, Request $request)
    {
        // Only the assigned PM can verify
        if ($project->pm_id !== Auth::id()) {
            return response()->json(['message' => 'Only the assigned project manager can verify this plan.'], 403);
        }

        if ($project->planning_status !== 'proposed') {
            return response()->json(['message' => 'No active planning proposal found for verification.'], 422);
        }

        return DB::transaction(function () use ($project, $request) {
            // Handle final notes/attachments during verification
            $attachments = $project->pm_audit_attachments ?? [];
            if ($request->hasFile('attachments')) {
                foreach ($request->file('attachments') as $file) {
                    if (count($attachments) < 3) {
                        $attachments[] = $file->store("projects/{$project->id}/pm_audits", 'public');
                    }
                }
            }

            $project->update([
                'planning_status' => 'pm_verified',
                'planning_pm_verified_at' => now(),
                'pm_audit_notes' => $request->pm_audit_notes ?? $project->pm_audit_notes,
                'pm_audit_attachments' => $attachments,
            ]);

            return new ProjectResource($project);
        });
    }

    /**
     * PM or Owner rejects the planning brief, sending it back to draft.
     */
    public function rejectPlanning(Project $project, Request $request)
    {
        $user = Auth::user();
        $isPM = $project->pm_id === $user->id;
        $isOwner = $project->user_id === $user->id;

        if (!$isPM && !$isOwner) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        // Logic gating based on current status
        if ($isPM && $project->planning_status !== 'proposed') {
            return response()->json(['message' => 'No active proposal to reject.'], 422);
        }
        if ($isOwner && $project->planning_status !== 'pm_verified') {
            $validStatus = !$project->pm_id ? 'proposed' : 'pm_verified';
            if ($project->planning_status !== $validStatus) {
                return response()->json(['message' => 'No active proposal to reject.'], 422);
            }
        }

        return DB::transaction(function () use ($project, $user, $request) {
            // If PM is rejecting, they can leave a final note/attachment
            if ($project->pm_id === $user->id) {
                $attachments = $project->pm_audit_attachments ?? [];
                if ($request->hasFile('attachments')) {
                    foreach ($request->file('attachments') as $file) {
                        if (count($attachments) < 3) {
                            $attachments[] = $file->store("projects/{$project->id}/pm_audits", 'public');
                        }
                    }
                }
                $project->pm_audit_attachments = $attachments;
                $project->pm_audit_notes = $request->pm_audit_notes ?? $project->pm_audit_notes;
            }

            $project->planning_status = 'draft';
            $project->planning_pm_verified_at = null;
            $project->save();

            ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => $user->id,
                'action' => 'planning_rejected',
                'details' => "Planning rejected by {$user->role_type}. Reason: " . ($request->pm_audit_notes ?? 'No reason provided'),
            ]);

            return new ProjectResource($project);
        });
    }

    /**
     * Architect verifies offline payment and unlocks the design phase.
     */
    public function verifyDesignPayment(Project $project)
    {
        // Only the selected architect can verify payment
        if ($project->selected_arsitek_id !== Auth::user()->arsitek?->id) {
            return response()->json(['message' => 'Only the assigned architect can verify payments.'], 403);
        }

        if ($project->planning_status !== 'approved') {
            return response()->json(['message' => 'The project must be approved before payment can be verified.'], 422);
        }

        \DB::beginTransaction();
        try {
            $project->update([
                'design_payment_verified_at' => now(),
            ]);

            // Record in budget ledger (Link professional verification to balance reduction)
            $acceptedBid = $project->bidsArsitek()->where('status', 'accepted')->first();
            if ($acceptedBid) {
                // Update the bid status itself so the Budget Dashboard card turns GREEN
                $acceptedBid->update([
                    'payment_status' => 'paid',
                    'paid_at' => now()
                ]);

                \App\Models\ProjectBudgetTransaction::updateOrCreate(
                    [
                        'project_id' => $project->id,
                        'reference_model' => 'App\Models\BidArsitek',
                        'reference_id' => $acceptedBid->id,
                    ],
                    [
                        'transaction_type' => 'payment',
                        'amount' => $acceptedBid->price,
                        'title' => 'Paid Architect Base Fee (Verified by Professional)',
                        'transaction_date' => now(),
                    ]
                );
            }
            

            // Auto-Generate Roadmap based on deliverables
            $deliverables = $project->design_details['deliverables'] ?? [];
            
            $mapping = [
                '3d_render' => [
                    'title' => '3D Visualization: Photorealistic Renders',
                    'type' => 'development',
                    'description' => 'High-quality 3D renderings to visualize the final architectural design.'
                ],
                'floor_plan' => [
                    'title' => 'Architectural Design: Detailed Floor Plans',
                    'type' => 'schematic',
                    'description' => 'Precise layout of rooms, dimensions, and spatial flow.'
                ],
                'mep_plan' => [
                    'title' => 'Technical Phase: MEP Engineering Plans',
                    'type' => 'construction',
                    'description' => 'Mechanical, Electrical, and Plumbing blueprints for site implementation.'
                ],
                'structural' => [
                    'title' => 'Engineering Phase: Structural Blueprints',
                    'type' => 'construction',
                    'description' => 'Technical specifications for foundations, beams, and load-bearing elements.'
                ],
                'vr_walkthrough' => [
                    'title' => 'Digital Twin: 360/VR Walkthrough',
                    'type' => 'development',
                    'description' => 'Immersive virtual tour to explore the space before construction starts.'
                ],
                'interior_concept' => [
                    'title' => 'Interior Phase: Concept & Material Selection',
                    'type' => 'schematic',
                    'description' => 'Moodboards and material specifications for internal finishes.'
                ],
            ];

            // Clear existing milestones if any (optional, but safer for a fresh sync)
            \App\Models\ProjectMilestone::where('project_id', $project->id)
                ->where('arsitek_id', $project->selected_arsitek_id)
                ->delete();

            foreach ($deliverables as $index => $delId) {
                if (isset($mapping[$delId])) {
                    $config = $mapping[$delId];
                    \App\Models\ProjectMilestone::create([
                        'project_id' => $project->id,
                        'arsitek_id' => $project->selected_arsitek_id,
                        'title' => $config['title'],
                        'type' => $config['type'],
                        'description' => $config['description'],
                        'sort_order' => $index,
                        'is_completed' => false,
                        'content' => [
                            'synced_from_brief' => true,
                            'checklist' => $this->getDefaultChecklistForDeliverable($delId)
                        ]
                    ]);
                }
            }

            \DB::commit();
            return new ProjectResource($project);
        } catch (\Exception $e) {
            \DB::rollBack();
            return response()->json([
                'message' => 'Failed to verify payment and generate roadmap.',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    private function getDefaultChecklistForDeliverable($id)
    {
        $checklists = [
            '3d_render' => [
                ['label' => 'Exterior Lighting & Mood', 'checked' => false],
                ['label' => 'Primary Material Textures', 'checked' => false],
                ['label' => 'Landscape & Surroundings', 'checked' => false],
            ],
            'floor_plan' => [
                ['label' => 'Accurate Room Dimensions', 'checked' => false],
                ['label' => 'Furniture Layout', 'checked' => false],
                ['label' => 'Wall Thickness & Material Specs', 'checked' => false],
            ],
            'mep_plan' => [
                ['label' => 'Electrical Outlet Layout', 'checked' => false],
                ['label' => 'Plumbing & Drainage Schematic', 'checked' => false],
                ['label' => 'HVAC / AC Positioning', 'checked' => false],
            ],
            'structural' => [
                ['label' => 'Foundation Engineering', 'checked' => false],
                ['label' => 'Beam & Column Schedules', 'checked' => false],
                ['label' => 'Concrete / Steel Specifications', 'checked' => false],
            ],
            'vr_walkthrough' => [
                ['label' => 'Navigation Hotspots', 'checked' => false],
                ['label' => '360 Render Quality', 'checked' => false],
            ],
            'interior_concept' => [
                ['label' => 'Color Palette Selection', 'checked' => false],
                ['label' => 'Furniture Proposals', 'checked' => false],
                ['label' => 'Lighting Style', 'checked' => false],
            ],
        ];

        return $checklists[$id] ?? [];
    }

    public function declineBid(Request $request, Project $project)
    {
        $user = Auth::user();
        $isOwner = $project->user_id === $user->id;
        $isPM = $project->pm_id && $user->role_type === 'project_manager' && $user->id === $project->pm_id;

        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized. Must be project owner or the assigned Project Manager.'], 403);
        }

        if ($isOwner && $project->wants_project_manager) {
            return response()->json(['message' => 'This project is managed by a Project Manager. Only the Project Manager can decline professionals.'], 403);
        }

        $request->validate([
            'bid_id' => 'required|integer',
            'bid_type' => 'required|in:arsitek,kontraktor,notaris,interior,structural,mep',
        ]);

        if ($request->bid_type === 'arsitek') {
            $bid = \App\Models\BidArsitek::where('id', $request->bid_id)->where('project_id', $project->id)->firstOrFail();
            $bid->update(['status' => 'rejected']);
        } elseif ($request->bid_type === 'kontraktor') {
            $bid = \App\Models\BidKontraktor::where('id', $request->bid_id)->where('project_id', $project->id)->firstOrFail();
            $bid->update(['status' => 'rejected']);
        } elseif ($request->bid_type === 'notaris') {
            $bid = \App\Models\BidNotaris::where('id', $request->bid_id)->where('project_id', $project->id)->firstOrFail();
            $bid->update(['status' => 'rejected']);
        } elseif ($request->bid_type === 'interior') {
            $bid = \App\Models\BidInterior::where('id', $request->bid_id)->where('project_id', $project->id)->firstOrFail();
            $bid->update(['status' => 'rejected']);
        } elseif ($request->bid_type === 'structural') {
            $bid = \App\Models\BidStructural::where('id', $request->bid_id)->where('project_id', $project->id)->firstOrFail();
            $bid->update(['status' => 'rejected']);
        } elseif ($request->bid_type === 'mep') {
            $bid = \App\Models\BidMep::where('id', $request->bid_id)->where('project_id', $project->id)->firstOrFail();
            $bid->update(['status' => 'rejected']);
        }

        // Notify the rejected professional
        $bidderUserId = match ($request->bid_type) {
            'arsitek' => $bid->arsitek->user_id,
            'kontraktor' => $bid->kontraktor->user_id,
            'notaris' => $bid->notaris->user_id,
            'interior' => $bid->interior->user_id,
            'structural' => $bid->structuralEngineer->user_id,
            'mep' => $bid->mepEngineer->user_id,
        };
        Notification::create([
            'user_id' => $bidderUserId,
            'type' => 'bid_rejected',
            'title' => 'Proposal Update',
            'body' => "Your proposal for project \"{$project->title}\" was not selected this time.",
            'data' => ['project_id' => $project->id],
        ]);

        $project->load([
            'arsitek.user.phoneNumber',
            'kontraktor.user.phoneNumber',
            'notaris.user.phoneNumber',
            'interior.user.phoneNumber',
            'bidsArsitek.arsitek.user.phoneNumber',
            'bidsKontraktor.kontraktor.user.phoneNumber',
            'bidsNotaris.notaris.user.phoneNumber',
            'bidsInterior.interior.user.phoneNumber',
            'bidsStructural.structuralEngineer.user',
            'bidsMep.mepEngineer.user',
            'user',
            'images',
            'ratings',
            'kontraktorRating',
        ]);
        $project->loadCount(['bidsArsitek', 'bidsKontraktor', 'bidsNotaris', 'bidsInterior', 'bidsProjectManager', 'bidsStructural', 'bidsMep']);

        return new ProjectResource($project);
    }

    public function update(UpdateProjectRequest $request, Project $project)
    {
        $user = Auth::user();
        $isOwner = $project->user_id === $user->id;

        // Find if user is the selected professional
        $isWorker = false;
        if ($user->role_type === 'arsitek' && $project->selected_arsitek_id) {
            $arsitek = \App\Models\Arsitek::where('user_id', $user->id)->first();
            if ($arsitek && $arsitek->id === $project->selected_arsitek_id) {
                $isWorker = true;
            }
        } elseif ($user->role_type === 'kontraktor' && $project->selected_kontraktor_id) {
            $kontraktor = \App\Models\Kontraktor::where('user_id', $user->id)->first();
            if ($kontraktor && $kontraktor->id === $project->selected_kontraktor_id) {
                $isWorker = true;
            }
        }

        $isPM = $project->pm_id === $user->id;
        
        if (! $isOwner && ! $isWorker && ! $isPM) {
            return response()->json(['message' => 'Unauthorized. Must be project owner, hired professional, or PM.'], 403);
        }

        $data = $request->validated();
        if ($request->hasFile('attachment')) {
            $data['attachment'] = $request->file('attachment')->store('project_attachments', 'public');
        }

        // Handle deleted images
        if ($request->has('deleted_images')) {
            $project->images()->whereIn('id', $request->deleted_images)->delete();
        }

        // Save multiple new images
        if ($request->hasFile('images')) {
            $maxSortOrder = $project->images()->max('sort_order') ?? -1;
            foreach ($request->file('images') as $i => $image) {
                $path = $image->store('project_images', 'public');
                $project->images()->create([
                    'image_path' => $path,
                    'sort_order' => $maxSortOrder + $i + 1,
                ]);
            }
        }

        if ($request->has('wants_project_manager')) {
            $data['wants_project_manager'] = filter_var($request->wants_project_manager, FILTER_VALIDATE_BOOLEAN);
        }
        if ($request->has('requires_structural')) {
            $data['requires_structural'] = filter_var($request->requires_structural, FILTER_VALIDATE_BOOLEAN);
        }
        if ($request->has('requires_mep')) {
            $data['requires_mep'] = filter_var($request->requires_mep, FILTER_VALIDATE_BOOLEAN);
        }

        // Only architect can update negotiated fee and payment instructions
        $isArsitek = Auth::user()->role_type === 'arsitek' && Auth::user()->arsitek?->id === $project->selected_arsitek_id;
        if (!$isArsitek && !$isOwner) {
            unset($data['negotiated_fee'], $data['payment_instructions']);
        }

        $project->update($data);

        // Sync Payment Termins if provided
        if ($request->has('payment_termins')) {
            $targetRole = $request->input('target_role', $user->role_type);
            
            $project->paymentTermins()->where('role_type', $targetRole)->delete();
            
            foreach ($request->payment_termins as $termin) {
                $project->paymentTermins()->create([
                    'label' => $termin['label'],
                    'percentage' => $termin['percentage'],
                    'amount' => $termin['amount'],
                    'trigger_description' => $termin['trigger_description'] ?? null,
                    'milestone_id' => $termin['milestone_id'] ?? null,
                    'notes' => $termin['notes'] ?? null,
                    'role_type' => $targetRole,
                    'recipient_id' => $targetRole === $user->role_type ? $user->id : null,
                    'status' => 'locked',
                ]);
            }
        }

        if (isset($data['status'])) {
            ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'status_changed',
                'details' => "Status changed to {$data['status']}",
            ]);
        }

        return new ProjectResource($project);
    }

    public function destroy(Project $project)
    {
        if ($project->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $project->delete();

        return response()->json(['message' => 'Project deleted successfully']);
    }

    public function myBids()
    {
        $user = Auth::user();
        if ($user->role_type === 'arsitek') {
            $arsitek = \App\Models\Arsitek::where('user_id', $user->id)->first();
            if (! $arsitek) {
                return response()->json(['data' => []]);
            }
            $bids = \App\Models\BidArsitek::with(['project'])->where('arsitek_id', $arsitek->id)->orderBy('created_at', 'desc')->get();

            return response()->json(['data' => $bids]);
        } elseif ($user->role_type === 'kontraktor') {
            $kontraktor = \App\Models\Kontraktor::where('user_id', $user->id)->first();
            if (! $kontraktor) {
                return response()->json(['data' => []]);
            }
            $bids = \App\Models\BidKontraktor::with(['project'])->where('kontraktor_id', $kontraktor->id)->orderBy('created_at', 'desc')->get();

            return response()->json(['data' => $bids]);
        } elseif ($user->role_type === 'notaris') {
            $notaris = \App\Models\NotarisProfile::where('user_id', $user->id)->first();
            if (! $notaris) {
                return response()->json(['data' => []]);
            }
            $bids = \App\Models\BidNotaris::with(['project'])->where('notaris_id', $notaris->id)->orderBy('created_at', 'desc')->get();

            return response()->json(['data' => $bids]);
        } elseif ($user->role_type === 'interior') {
            $interior = \App\Models\InteriorProfile::where('user_id', $user->id)->first();
            if (! $interior) {
                return response()->json(['data' => []]);
            }
            $bids = \App\Models\BidInterior::with(['project'])->where('interior_id', $interior->id)->orderBy('created_at', 'desc')->get();

            return response()->json(['data' => $bids]);
        } elseif ($user->role_type === 'project_manager') {
            $pm = \App\Models\ProjectManager::where('user_id', $user->id)->first();
            if (!$pm) {
                return response()->json(['data' => []]);
            }
            $bids = \App\Models\BidProjectManager::with(['project'])
                ->where('pm_id', $pm->id)
                ->orderBy('created_at', 'desc')
                ->get();

            return response()->json(['data' => $bids]);
        }

        return response()->json(['data' => []]);
    }

    public function getNotarisServices()
    {
        $user = Auth::user();
        if ($user->role_type !== 'notaris') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $profile = $user->notaris_profile;
        if (! $profile) {
            return response()->json(['data' => []]);
        }

        return response()->json(['data' => $profile->services]);
    }

    /**
     * Generate a shareable link token for a project's construction brief.
     * Only the hired contractor can generate this.
     */
    public function generateShareToken(Project $project)
    {
        $user = Auth::guard('sanctum')->user();

        // Only the hired contractor or project owner can generate
        $isContractor = $user->role_type === 'kontraktor' 
            && $user->kontraktor 
            && $project->selected_kontraktor_id === $user->kontraktor->id;
        $isOwner = $project->user_id === $user->id;

        if (!$isContractor && !$isOwner) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        if (!$project->share_token) {
            $project->update(['share_token' => bin2hex(random_bytes(12))]);
        }

        return response()->json([
            'share_token' => $project->share_token,
            'share_url' => url('/brief/' . $project->share_token),
        ]);
    }

    /**
     * Revoke the shareable link.
     */
    public function revokeShareToken(Project $project)
    {
        $user = Auth::guard('sanctum')->user();

        $isContractor = $user->role_type === 'kontraktor' 
            && $user->kontraktor 
            && $project->selected_kontraktor_id === $user->kontraktor->id;
        $isOwner = $project->user_id === $user->id;

        if (!$isContractor && !$isOwner) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $project->update(['share_token' => null]);

        return response()->json(['message' => 'Share link revoked.']);
    }

    /**
     * Public endpoint — no auth required.
     * Returns only the construction brief data for the given token.
     */
    public function getPublicBrief(string $token)
    {
        $project = Project::where('share_token', $token)->first();

        if (!$project) {
            return response()->json(['message' => 'Brief not found or link has been revoked.'], 404);
        }

        // Security: Strip RAB from construction details
        $details = $project->construction_details ?? [];
        if (isset($details['rab'])) {
            unset($details['rab']);
        }

        return response()->json([
            'title' => $project->title,
            'location' => $project->lokasi,
            'city' => $project->city,
            'construction_details' => $details,
            'construction_locked_at' => $project->construction_locked_at,
            'milestones' => $project->milestones()->orderBy('sort_order')->get(),
            'requirements' => $project->requirements()->orderBy('name')->get(),
            'comments' => $project->comments()->whereNull('parent_id')
                ->with(['user', 'replies.user'])
                ->get(),
        ]);
    }

    public function broadcastPhase(Project $project, Request $request, ProjectPhaseService $service)
    {
        $request->validate(['role' => 'required|string|in:arsitek,kontraktor,notaris,interior']);
        
        $user = Auth::user();
        if ($project->user_id !== $user->id && $project->pm_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $project = $service->broadcastPhase($project, $request->role);
        return new ProjectResource($project);
    }

    public function importExternalVendor(Project $project, Request $request, ProjectPhaseService $service)
    {
        $request->validate([
            'phase_role' => 'required|string|in:arsitek,kontraktor,notaris,interior',
            'company_name' => 'nullable|string|max:255',
            'contact_person' => 'required|string|max:255',
            'phone_number' => 'required|string|max:20',
            'email' => 'nullable|email|max:255',
            'agreed_fee' => 'nullable|numeric|min:0',
        ]);

        $user = Auth::user();
        if ($project->user_id !== $user->id && $project->pm_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $vendor = $service->importExternalVendor($project, $request->all());
        return response()->json([
            'message' => 'External professional imported successfully.',
            'vendor' => $vendor,
            'project' => new ProjectResource($project->fresh())
        ]);
    }
}
