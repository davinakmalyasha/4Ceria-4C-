<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProjectRequest;
use App\Http\Requests\UpdateProjectRequest;
use App\Http\Resources\ProjectResource;
use App\Services\ProjectPhaseService;
use App\Support\Hire;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectActivityLog;
use App\Models\ProjectBudgetTransaction;
use App\Models\ProjectMilestone;
use App\Models\ProjectExternalVendor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ProjectController extends Controller
{
    protected $lifecycleService;
    protected $negotiationService;

    public function __construct(
        \App\Services\ProjectLifecycleService $lifecycleService,
        \App\Services\NegotiationService $negotiationService
    ) {
        $this->lifecycleService = $lifecycleService;
        $this->negotiationService = $negotiationService;
    }
    public function index(\Illuminate\Http\Request $request)
    {
        $user = Auth::guard('sanctum')->user();

        // Strict-mode safety: eager-load the role profiles we are about to
        // touch below instead of lazy-loading them.
        if ($user) {
            $user->loadMissing(['arsitek', 'kontraktor', 'notaris_profile', 'interior_profile', 'project_manager', 'structural_engineer', 'mep_engineer', 'supplier']);
        }

        $relations = [
            'images',
            'milestones',
            'user.phoneNumber',
        ];

        if ($user) {
            // PERF: ProjectResource decides contact visibility with
            // subProfessionals()->where('user_id', $viewer)->where('status','active')->exists()
            // whenever the viewer is not the owner / PM / selected pro, so an
            // un-eager-loaded list cost one extra query per row (up to +50 per
            // request). Eager-load exactly the rows that predicate looks at, so
            // the resource's relationLoaded() branch answers it from memory
            // and returns the identical boolean.
            //
            // Scoped to (user_id = viewer, status = 'active') on purpose: the
            // relation is also serialized by ProjectResource's
            // whenLoaded('subProfessionals') block, and this constraint keeps
            // that block limited to the viewer's own assignments — no other
            // sub-professional's rates, fees, scope notes or contact details
            // are ever attached to the list response.
            //
            // The select is the union of the columns both relationLoaded()
            // branches touch: user_id + status for the canViewPhone check, and
            // project_id + the full serialized set for the sub_professionals
            // block. project_id is the hasMany match key and MUST be present.
            $relations['subProfessionals'] = function ($q) use ($user) {
                $q->where('user_id', $user->id)
                  ->where('status', 'active')
                  ->select([
                      'id', 'project_id', 'user_id', 'parent_role', 'sub_role',
                      'assigned_by', 'status', 'rate', 'scope_notes',
                      'lead_pro_notes', 'suggested_fee', 'accepted_at',
                      'recommended_at', 'hired_at', 'completed_at',
                      'created_at', 'updated_at',
                  ])
                  ->with(['user' => fn ($uq) => $uq->with('phoneNumber')]);
            };

            $role = $user->role_type;
            if ($role === 'arsitek' && $user->arsitek) {
                $relations['bidsArsitek'] = function ($q) use ($user) {
                    $q->where('arsitek_id', $user->arsitek->id)
                      ->with('arsitek.user.phoneNumber');
                };
            } elseif ($role === 'kontraktor' && $user->kontraktor) {
                $relations['bidsKontraktor'] = function ($q) use ($user) {
                    $q->where('kontraktor_id', $user->kontraktor->id)
                      ->with('kontraktor.user.phoneNumber');
                };
            } elseif ($role === 'notaris' && $user->notaris_profile) {
                $relations['bidsNotaris'] = function ($q) use ($user) {
                    $q->where('notaris_id', $user->notaris_profile->id)
                      ->with(['notaris.user.phoneNumber', 'notaris.services']);
                };
            } elseif ($role === 'interior' && $user->interior_profile) {
                $relations['bidsInterior'] = function ($q) use ($user) {
                    $q->where('interior_id', $user->interior_profile->id)
                      ->with('interior.user.phoneNumber');
                };
            } elseif ($role === 'project_manager') {
                $pm = $user->project_manager ?: \App\Models\ProjectManager::where('user_id', $user->id)->first();
                if ($pm) {
                    $relations['bidsProjectManager'] = function ($q) use ($pm) {
                        $q->where('pm_id', $pm->id)
                          ->with('pm.user.phoneNumber');
                    };
                }
            } elseif ($role === 'structural') {
                $se = $user->structural_engineer ?: \App\Models\StructuralEngineer::where('user_id', $user->id)->first();
                if ($se) {
                    $relations['bidsStructural'] = function ($q) use ($se) {
                        $q->where('structural_id', $se->id)
                          ->with('structuralEngineer.user.phoneNumber');
                    };
                }
            } elseif ($role === 'mep') {
                $me = $user->mep_engineer ?: \App\Models\MepEngineer::where('user_id', $user->id)->first();
                if ($me) {
                    $relations['bidsMep'] = function ($q) use ($me) {
                        $q->where('mep_id', $me->id)
                          ->with('mepEngineer.user.phoneNumber');
                    };
                }
            }
        }

        $query = Project::with($relations)
            ->withCount(['bidsArsitek', 'bidsKontraktor', 'bidsNotaris', 'bidsInterior', 'bidsProjectManager', 'bidsStructural', 'bidsMep']);

        if ($request->query('with_bids') === 'true') {
            $query->with([
                'bidsArsitek.arsitek.user.phoneNumber',
                'bidsKontraktor.kontraktor.user.phoneNumber',
                'bidsNotaris.notaris.user.phoneNumber',
                'bidsNotaris.notaris.services',
                'bidsInterior.interior.user.phoneNumber',
                'bidsProjectManager.pm.user.phoneNumber',
                'bidsStructural.structuralEngineer.user.phoneNumber',
                'bidsMep.mepEngineer.user.phoneNumber',
            ]);
        }

        if (!$user) {
            // Public failsafe: only show open projects tagged for 'both' (or just don't show any)
            $query->where('status', 'open');
            $paginator = $query->paginate(50);
            $this->attachClientHistory($paginator->getCollection());
            return ProjectResource::collection($paginator);
        }

        // Professional Discovery Logic / Bidding Board Feed
        if ($request->query('feed') === 'true' || $request->query('discovery') === 'true' || $request->query('bidding_board') === 'true') {
            if ($user) {
                $query->where('user_id', '!=', $user->id); // Exclude own projects
                
                // Exclude projects where the user is already assigned/invited as a sub-professional
                $query->whereDoesntHave('subProfessionals', function ($sq) use ($user) {
                    $sq->where('user_id', $user->id);
                });
            }

            if ($user && $user->role_type === 'arsitek') {
                $arsitekId = optional($user->arsitek)->id;
                $query->whereIn('target_role', ['both', 'arsitek'])
                    ->whereJsonContains('published_bidding_roles', 'arsitek')
                    ->whereIn('status', ['open', 'accepted_kontraktor', 'in_progress', 'awaiting_payment', 'contract_pending', 'planning'])
                    ->whereNull('selected_arsitek_id')
                    ->whereDoesntHave('bidsArsitek', function ($q) use ($arsitekId) {
                        $q->where('arsitek_id', $arsitekId);
                    });
            } elseif ($user && $user->role_type === 'kontraktor') {
                $kontraktorId = optional($user->kontraktor)->id;
                $query->where(function ($q) {
                    $q->where('target_role', 'kontraktor')
                        ->orWhere(function ($sq) {
                            $sq->where('target_role', 'both')
                                ->where(function ($inner) {
                                    $inner->whereNotNull('design_completed_at')
                                        ->orWhereJsonContains('published_bidding_roles', 'kontraktor');
                                });
                        });
                })
                    ->whereJsonContains('published_bidding_roles', 'kontraktor')
                    ->whereIn('status', ['open', 'accepted_arsitek', 'procurement', 'in_progress', 'awaiting_payment', 'contract_pending', 'planning'])
                    ->whereNull('selected_kontraktor_id')
                    ->whereDoesntHave('bidsKontraktor', function ($q) use ($kontraktorId) {
                        $q->where('kontraktor_id', $kontraktorId);
                    });
            } elseif ($user && $user->role_type === 'notaris') {
                $notarisId = optional($user->notaris_profile)->id;
                $query->where(function ($q) {
                    $q->whereJsonContains('needed_phases', 'legal')
                        ->orWhereNull('needed_phases')
                        ->orWhere('needed_phases', '[]');
                })
                    ->whereJsonContains('published_bidding_roles', 'notaris')
                    ->whereNull('selected_notaris_id')
                    ->whereIn('status', ['open', 'accepted_arsitek', 'accepted_kontraktor', 'in_progress', 'awaiting_payment', 'contract_pending', 'planning'])
                    ->whereDoesntHave('bidsNotaris', function ($q) use ($notarisId) {
                        $q->where('notaris_id', $notarisId);
                    });
            } elseif ($user && $user->role_type === 'structural') {
                $structuralId = optional($user->structural_engineer)->id;
                $query->where('requires_structural', true)
                    ->whereJsonContains('published_bidding_roles', 'structural')
                    ->whereNull('structural_id')
                    ->whereIn('status', ['open', 'accepted_arsitek', 'accepted_kontraktor', 'in_progress', 'awaiting_payment', 'contract_pending', 'planning'])
                    ->whereDoesntHave('bidsStructural', function ($q) use ($structuralId) {
                        $q->where('structural_id', $structuralId);
                    });
            } elseif ($user && $user->role_type === 'mep') {
                $mepId = optional($user->mep_engineer)->id;
                $query->where('requires_mep', true)
                    ->whereJsonContains('published_bidding_roles', 'mep')
                    ->whereNull('mep_id')
                    ->whereIn('status', ['open', 'accepted_arsitek', 'accepted_kontraktor', 'in_progress', 'awaiting_payment', 'contract_pending', 'planning'])
                    ->whereDoesntHave('bidsMep', function ($q) use ($mepId) {
                        $q->where('mep_id', $mepId);
                    });
            } elseif ($user && $user->role_type === 'interior') {
                $interiorId = optional($user->interior_profile)->id;
                $query->where(function ($q) {
                    $q->whereJsonContains('needed_phases', 'interior')
                        ->orWhereNull('needed_phases')
                        ->orWhere('needed_phases', '[]');
                })
                    ->whereJsonContains('published_bidding_roles', 'interior')
                    ->whereNull('selected_interior_id')
                    ->whereIn('status', ['open', 'accepted_arsitek', 'accepted_kontraktor', 'in_progress', 'awaiting_payment', 'contract_pending', 'planning', 'completed_build'])
                    ->whereDoesntHave('bidsInterior', function ($q) use ($interiorId) {
                        $q->where('interior_id', $interiorId);
                    });
            } elseif ($user && $user->role_type === 'project_manager') {
                $pmId = optional($user->project_manager)->id;
                $query->where('wants_project_manager', true)
                    ->whereJsonContains('published_bidding_roles', 'project_manager')
                    ->whereNull('pm_id')
                    ->whereIn('status', ['open', 'accepted_arsitek', 'accepted_kontraktor', 'in_progress', 'awaiting_payment', 'contract_pending', 'planning'])
                    ->whereDoesntHave('bidsProjectManager', function ($q) use ($pmId) {
                        $q->where('pm_id', $pmId);
                    });
            } else {
                // For normal users viewing the Bidding Board, show all open projects accepting bids
                $query->whereIn('status', ['open', 'accepted_arsitek', 'accepted_kontraktor', 'procurement', 'in_progress', 'awaiting_payment', 'contract_pending', 'planning']);
            }

            $projects = $query->latest()->limit(50)->get();
            $this->attachClientHistory($projects);
            return ProjectResource::collection($projects);
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
            $query->where(function ($q) use ($user, $interior) {
                if ($interior) {
                    $q->where('selected_interior_id', $interior->id);
                } else {
                    $q->whereRaw('1 = 0');
                }
                $q->orWhereHas('subProfessionals', function ($sq) use ($user) {
                    $sq->where('user_id', $user->id)
                       ->whereIn('status', ['invited', 'accepted', 'interviewing', 'recommended', 'active']);
                });
            });
            $query->latest();
        } elseif ($user->role_type === 'project_manager') {
            $query->where('pm_id', $user->id);
            $query->latest();
        } elseif ($user->role_type === 'structural') {
            $structural = \App\Models\StructuralEngineer::where('user_id', $user->id)->first();
            $query->where(function ($q) use ($user, $structural) {
                if ($structural) {
                    $q->where('structural_id', $structural->id);
                } else {
                    $q->whereRaw('1 = 0');
                }
                $q->orWhereHas('subProfessionals', function ($sq) use ($user) {
                    $sq->where('user_id', $user->id)
                       ->whereIn('status', ['invited', 'accepted', 'interviewing', 'recommended', 'active']);
                });
            });
            $query->latest();
        } elseif ($user->role_type === 'mep') {
            $mep = \App\Models\MepEngineer::where('user_id', $user->id)->first();
            $query->where(function ($q) use ($user, $mep) {
                if ($mep) {
                    $q->where('mep_id', $mep->id);
                } else {
                    $q->whereRaw('1 = 0');
                }
                $q->orWhereHas('subProfessionals', function ($sq) use ($user) {
                    $sq->where('user_id', $user->id)
                       ->whereIn('status', ['invited', 'accepted', 'interviewing', 'recommended', 'active']);
                });
            });
            $query->latest();
        } elseif (in_array($user->role_type, ['civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing', 'general'])) {
            $query->whereHas('subProfessionals', function ($sq) use ($user) {
                $sq->where('user_id', $user->id)
                   ->whereIn('status', ['invited', 'accepted', 'interviewing', 'recommended', 'active']);
            });
            $query->latest();
        } else {
            // General professionals or unknown roles: show nothing in "My projects" unless hired
            $query->whereRaw('1 = 0');
        }

        if ($request->query('all') === 'true') {
            // PERF: called on every dashboard load. Uncapped ->get() here
            // serialized N x (images + milestones + bid trees) through
            // ProjectResource. Cap hard; clients beyond this need the
            // paginated branch.
            $projects = $query->latest()->limit(200)->get();
            $this->attachClientHistory($projects);
            return ProjectResource::collection($projects);
        }

        $paginator = $query->latest()->paginate(50);
        $this->attachClientHistory($paginator->getCollection());
        return ProjectResource::collection($paginator);
    }

    public function store(StoreProjectRequest $request)
    {
        $data = $request->validated();
        $data['user_id'] = Auth::id();
        $data['status'] = 'open';
        $data['wants_project_manager'] = filter_var($request->wants_project_manager, FILTER_VALIDATE_BOOLEAN);
        $data['wants_to_discuss_later'] = filter_var($request->wants_to_discuss_later, FILTER_VALIDATE_BOOLEAN);
        $data['project_dimensions'] = json_decode($request->project_dimensions, true);
        $data['legal_detail'] = $request->legal_detail;

        $neededPhases = json_decode($request->needed_phases, true) ?? [];
        $data['needed_phases'] = $neededPhases;

        $data['bidding_choices'] = json_decode($request->bidding_choices, true) ?? [];

        $externalVendors = json_decode($request->external_vendors, true) ?? [];

        // Auto-publish the first non-management phase if PM is not wanted, 
        // or just management if PM is wanted.
        // CRITICAL: Only publish if NOT handled by an external vendor.
        $published = [];
        if ($data['wants_project_manager'] && !isset($externalVendors['project_manager'])) {
            $published[] = 'project_manager';
        } else {
            $roleMap = [
                'legal' => 'notaris',
                'design' => 'arsitek',
                'build' => 'kontraktor',
                'interior' => 'interior'
            ];
            foreach ($neededPhases as $phase) {
                $role = $roleMap[$phase] ?? null;
                if ($role && !isset($externalVendors[$role])) {
                    $published[] = $role;
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

            // Record the OPENING ceiling in the ledger.
            //
            // Without this, `projects.budget` begins life as an unexplained
            // number: no ledger row exists to account for it, so the escrow
            // ceiling can never be reconciled against the ledger that is
            // supposed to explain it. Once an owner can raise the ceiling with
            // a deposit (POST /budget/transactions), `SUM(deposit) -
            // SUM(adjustment_down)` is the ceiling's true value — but only if
            // the starting point is on the record too.
            //
            // Written directly rather than through `deductBudget()`'s deposit
            // path, which would ALSO `increment('budget')` and so double the
            // opening amount: `Project::create` has already set the column.
            // The row is a plain positive `deposit`, which is excluded from
            // `paidTotal` by DISBURSEMENT_TYPES, so `available` is unaffected.
            $openingBudget = \App\Support\Money::fromColumn($project->budget);
            if ($openingBudget->isPositive()) {
                ProjectBudgetTransaction::create([
                    'project_id' => $project->id,
                    'transaction_type' => 'deposit',
                    'amount' => $openingBudget->toDecimal(),
                    'title' => 'Opening project budget',
                    'transaction_date' => now(),
                    // The owner establishing the ceiling. Recorded explicitly
                    // rather than left NULL, because this row is the baseline
                    // every later ceiling movement is reconciled against — so
                    // "who set the original figure" is the first question
                    // `money:reconcile` has to answer about it.
                    'actor_user_id' => Auth::id(),
                    'actor_role' => Auth::user()?->role_type,
                ]);
            }

            // Save External Vendors
            foreach ($externalVendors as $role => $vendor) {
                if (!empty($vendor['contact_person']) && !empty($vendor['phone_number'])) {
                    ProjectExternalVendor::create([
                        'project_id' => $project->id,
                        'phase_role' => $role,
                        'contact_person' => $vendor['contact_person'],
                        'phone_number' => $vendor['phone_number'],
                        'company_name' => $vendor['company_name'] ?? null,
                    ]);
                }
            }

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
        } catch (\Throwable $e) {
            DB::rollBack();
            error_log('Project publish failed: ' . $e->getMessage() . "\n" . $e->getTraceAsString());
            \Illuminate\Support\Facades\Log::error('Project publish failed: ' . $e->getMessage(), [
                'exception' => $e,
                'trace' => $e->getTraceAsString(),
            ]);
            return response()->json([
                'message' => 'Failed to publish project.'
            ], 500);
        }
    }

    /**
     * Membership gate for full project detail. Owner, assigned PM, admin,
     * hired professionals, invited/active sub-professionals and anyone with
     * an existing bid may view; everyone else gets 403. Pros browsing for
     * work use the sanitized bidding-feed payloads instead of this endpoint.
     */
    private function authorizeProjectDetailAccess(Project $project, $user): bool
    {
        if (!$user) {
            return false;
        }
        if ($project->user_id === $user->id || (int) $project->pm_id === (int) $user->id) {
            return true;
        }
        if ($user->role_type === 'admin') {
            return true;
        }
        // Hired or bidder per role (mirrors getBids() checks)
        $role = $user->role_type;
        if ($role === 'arsitek' && $user->arsitek) {
            if ($project->selected_arsitek_id == $user->arsitek->id
                || $project->bidsArsitek()->where('arsitek_id', $user->arsitek->id)->exists()) return true;
        } elseif ($role === 'kontraktor' && $user->kontraktor) {
            if ($project->selected_kontraktor_id == $user->kontraktor->id
                || $project->bidsKontraktor()->where('kontraktor_id', $user->kontraktor->id)->exists()) return true;
        } elseif ($role === 'notaris' && $user->notaris_profile) {
            if ($project->selected_notaris_id == $user->notaris_profile->id
                || $project->bidsNotaris()->where('notaris_id', $user->notaris_profile->id)->exists()) return true;
        } elseif ($role === 'interior' && $user->interior_profile) {
            if ($project->selected_interior_id == $user->interior_profile->id
                || $project->bidsInterior()->where('interior_id', $user->interior_profile->id)->exists()) return true;
        } elseif ($role === 'structural') {
            $se = $user->structural_engineer ?: \App\Models\StructuralEngineer::where('user_id', $user->id)->first();
            if ($se && ($project->structural_id == $se->id
                || $project->bidsStructural()->where('structural_id', $se->id)->exists())) return true;
        } elseif ($role === 'mep') {
            $me = $user->mep_engineer ?: \App\Models\MepEngineer::where('user_id', $user->id)->first();
            if ($me && ($project->mep_id == $me->id
                || $project->bidsMep()->where('mep_id', $me->id)->exists())) return true;
        }
        // Invited/accepted sub-professionals are workspace members too
        if ($project->subProfessionals()->where('user_id', $user->id)->exists()) {
            return true;
        }
        return false;
    }

    /**
     * Race-safe bid creation: the DB-level unique (project_id, {role}_id)
     * added in migration 2026_08_24_100002 makes concurrent double-submits
     * throw instead of silently duplicating. Convert that into the same
     * friendly 422 the exists() pre-check produces.
     */
    private function createBidGuarded(string $modelClass, array $attributes)
    {
        try {
            return $modelClass::create($attributes);
        } catch (\Illuminate\Database\UniqueConstraintViolationException $e) {
            return null;
        }
    }

    public function show(Project $project)
    {
        $user = Auth::guard('sanctum')->user();

        // SECURITY: full detail previously served to ANY authenticated user
        // (sequential-id enumeration harvested hired pros' contacts, budgets
        // and RAB). Non-members must use the public brief/share endpoints.
        if (!$this->authorizeProjectDetailAccess($project, $user)) {
            return response()->json(['message' => 'Unauthorized access to this project.'], 403);
        }
        
        $relations = [
            // Hired Professionals
            'arsitek' => function ($q) {
                $q->withAvg('ratings', 'rating')->withCount('ratings')->with('user.phoneNumber');
            },
            'kontraktor' => function ($q) {
                $q->withAvg('ratings', 'rating')->withCount('ratings')->with('user.phoneNumber');
            },
            'notaris' => function ($q) {
                $q->withAvg('ratings', 'rating')->withCount('ratings')->with(['user.phoneNumber', 'services']);
            },
            'interior' => function ($q) {
                $q->withAvg('ratings', 'rating')->withCount('ratings')->with('user.phoneNumber');
            },
            'structuralEngineer.user.phoneNumber',
            'mepEngineer.user.phoneNumber',
            'projectManager' => function ($q) {
                $q->withAvg('ratings', 'rating')->withCount('ratings')->with('user.phoneNumber');
            },

            // Core Project Relations
            'images',
            'user.phoneNumber',
            'ratings',
            'kontraktorRating',
            'requirements',
            'addendums.teamMember',
            'addendums.assignedUser.phoneNumber',
            'subProfessionals.user.phoneNumber',
            'subProfessionals.assignedByUser',
        ];

        // Zero-trust: Eager load only the authenticated professional's own bid
        if ($user) {
            $role = $user->role_type;
            if ($role === 'arsitek' && $user->arsitek) {
                $relations['bidsArsitek'] = function ($q) use ($user) {
                    $q->where('arsitek_id', $user->arsitek->id)
                      ->with([
                          'negotiationLogs.user',
                          'arsitek.user.phoneNumber',
                          'arsitek.ratings'
                      ]);
                };
            } elseif ($role === 'kontraktor' && $user->kontraktor) {
                $relations['bidsKontraktor'] = function ($q) use ($user) {
                    $q->where('kontraktor_id', $user->kontraktor->id)
                      ->with([
                          'negotiationLogs.user',
                          'kontraktor.user.phoneNumber',
                          'kontraktor.ratings'
                      ]);
                };
            } elseif ($role === 'notaris' && $user->notaris_profile) {
                $relations['bidsNotaris'] = function ($q) use ($user) {
                    $q->where('notaris_id', $user->notaris_profile->id)
                      ->with([
                          'negotiationLogs.user',
                          'notaris.user.phoneNumber',
                          'notaris.services',
                          'notaris.ratings'
                      ]);
                };
            } elseif ($role === 'interior' && $user->interior_profile) {
                $relations['bidsInterior'] = function ($q) use ($user) {
                    $q->where('interior_id', $user->interior_profile->id)
                      ->with([
                          'negotiationLogs.user',
                          // BUGFIX: 'interior.interior.*' referenced a relation
                          // that doesn't exist on InteriorProfile -> guaranteed
                          // RelationNotFoundException for interior designers.
                          'interior.user.phoneNumber',
                          'interior.ratings'
                      ]);
                };
            } elseif ($role === 'project_manager') {
                $pm = $user->project_manager ?: \App\Models\ProjectManager::where('user_id', $user->id)->first();
                if ($pm) {
                    $relations['bidsProjectManager'] = function ($q) use ($pm) {
                        $q->where('pm_id', $pm->id)
                          ->with([
                              'negotiationLogs.user',
                              'pm.user.phoneNumber',
                              'pm.ratings'
                          ]);
                    };
                }
            } elseif ($role === 'structural') {
                $se = $user->structural_engineer ?: \App\Models\StructuralEngineer::where('user_id', $user->id)->first();
                if ($se) {
                    $relations['bidsStructural'] = function ($q) use ($se) {
                        $q->where('structural_id', $se->id)
                          ->with([
                              'negotiationLogs.user',
                              'structuralEngineer.user.phoneNumber'
                          ]);
                    };
                }
            } elseif ($role === 'mep') {
                $me = $user->mep_engineer ?: \App\Models\MepEngineer::where('user_id', $user->id)->first();
                if ($me) {
                    $relations['bidsMep'] = function ($q) use ($me) {
                        $q->where('mep_id', $me->id)
                          ->with([
                              'negotiationLogs.user',
                              'mepEngineer.user.phoneNumber'
                          ]);
                    };
                }
            }
        }

        $project->load($relations)->loadCount([
            'bidsArsitek', 'bidsKontraktor', 'bidsNotaris', 'bidsInterior', 
            'bidsProjectManager', 'bidsStructural', 'bidsMep'
        ]);

        $this->attachClientHistory($project);

        return new ProjectResource($project);
    }

    public function getBids(Project $project)
    {
        $user = Auth::guard('sanctum')->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // Strict Authorization check (Global Rule 1)
        $isOwner = $project->user_id === $user->id;
        $isPM = $project->pm_id === $user->id;
        
        $isHired = false;
        $hasBid = false;

        if (!$isOwner && !$isPM) {
            $role = $user->role_type;
            if ($role === 'arsitek' && $user->arsitek) {
                $isHired = $project->selected_arsitek_id === $user->arsitek->id;
                $hasBid = $project->bidsArsitek()->where('arsitek_id', $user->arsitek->id)->exists();
            } elseif ($role === 'kontraktor' && $user->kontraktor) {
                $isHired = $project->selected_kontraktor_id === $user->kontraktor->id;
                $hasBid = $project->bidsKontraktor()->where('kontraktor_id', $user->kontraktor->id)->exists();
            } elseif ($role === 'notaris' && $user->notaris_profile) {
                $isHired = $project->selected_notaris_id === $user->notaris_profile->id;
                $hasBid = $project->bidsNotaris()->where('notaris_id', $user->notaris_profile->id)->exists();
            } elseif ($role === 'interior' && $user->interior_profile) {
                $isHired = $project->selected_interior_id === $user->interior_profile->id;
                $hasBid = $project->bidsInterior()->where('interior_id', $user->interior_profile->id)->exists();
            } elseif ($role === 'project_manager') {
                $pm = $user->project_manager ?: \App\Models\ProjectManager::where('user_id', $user->id)->first();
                if ($pm) {
                    // BUGFIX: pm_id stores the PM's USER id, not the profile id —
                    // the old comparison (pm_id === profile->id) never matched,
                    // so hired PMs failed this isHired check.
                    $isHired = (int) $project->pm_id === (int) $user->id;
                    $hasBid = $project->bidsProjectManager()->where('pm_id', $pm->id)->exists();
                }
            } elseif ($role === 'structural') {
                $se = $user->structural_engineer ?: \App\Models\StructuralEngineer::where('user_id', $user->id)->first();
                if ($se) {
                    $isHired = $project->structural_id === $se->id;
                    $hasBid = $project->bidsStructural()->where('structural_id', $se->id)->exists();
                }
            } elseif ($role === 'mep') {
                $me = $user->mep_engineer ?: \App\Models\MepEngineer::where('user_id', $user->id)->first();
                if ($me) {
                    $isHired = $project->mep_id === $me->id;
                    $hasBid = $project->bidsMep()->where('mep_id', $me->id)->exists();
                }
            }

            if (!$isHired && !$hasBid) {
                return response()->json(['message' => 'Unauthorized access to project bids.'], 403);
            }
        }

        $project->load([
            'bidsArsitek.negotiationLogs.user',
            'bidsKontraktor.negotiationLogs.user',
            'bidsNotaris.negotiationLogs.user',
            'bidsInterior.negotiationLogs.user',
            'bidsStructural.negotiationLogs.user',
            'bidsMep.negotiationLogs.user',
            'bidsProjectManager.negotiationLogs.user',
            'bidsArsitek.arsitek' => function ($q) {
                $q->withAvg('ratings', 'rating')->withCount('ratings')->with('user.phoneNumber');
            },
            'bidsKontraktor.kontraktor' => function ($q) {
                $q->withAvg('ratings', 'rating')->withCount('ratings')->with('user.phoneNumber');
            },
            'bidsNotaris.notaris' => function ($q) {
                $q->withAvg('ratings', 'rating')->withCount('ratings')->with(['user.phoneNumber', 'services']);
            },
            'bidsInterior.interior' => function ($q) {
                $q->withAvg('ratings', 'rating')->withCount('ratings')->with('user.phoneNumber');
            },
            'bidsProjectManager.pm' => function ($q) {
                $q->withAvg('ratings', 'rating')->withCount('ratings')->with('user.phoneNumber');
            },
            'bidsStructural.structuralEngineer.user.phoneNumber',
            'bidsMep.mepEngineer.user.phoneNumber',
        ]);

        return new ProjectResource($project);
    }

    public function submitBid(Request $request, Project $project, \App\Services\BidCalculationService $calculationService)
    {
        $user = Auth::user();

        if (!in_array($user->role_type, ['arsitek', 'kontraktor', 'notaris', 'interior', 'structural', 'mep', 'project_manager'])) {
            return response()->json(['message' => 'Only verified professionals can submit bids.'], 403);
        }

        // VERIFICATION, NOT JUST ROLE.
        //
        // The error message above says "Only verified professionals can submit
        // bids", but the only test was the role list -- so the check did not do
        // what it claimed.
        //
        // This is the other half of the registration fix. `register()` was
        // corrected so that new profiles are created `pending` rather than
        // `verified`, which stops them appearing in the public directories --
        // but an unverified account could still BID, get shortlisted, and enter
        // the owner's shortlist. Closing the directory without closing bidding
        // leaves the product's central promise ("we check our professionals")
        // resting on a UI affordance rather than a server-side gate.
        //
        // `Hire::profileIdFor()` resolves the profile for the caller's role and
        // already encodes the PM special case (`projects.pm_id` stores a USER id,
        // every other role a PROFILE id), so no second role map is needed here.
        // The PROFILE ROW, not an id to compare against a project column.
        //
        // `Hire::profileIdFor()` returns the PM's USER id, because that is what
        // `projects.pm_id` stores. Feeding that to `ProjectManager::find()`
        // resolves a coincidentally-numbered row belonging to a DIFFERENT person
        // and reads THEIR verification status -- which is exactly what this gate
        // must not do. `Hire::profile()` returns the row for the PM as well as
        // every other role, so the vocabulary split is handled once.
        $profile = Hire::profile((string) $user->role_type, $user);

        if ($profile === null) {
            return response()->json([
                'message' => 'Complete your professional profile before bidding.',
            ], 403);
        }

        if ($profile->verification_status !== 'verified') {
            return response()->json([
                'message' => 'Your professional profile is still awaiting verification, so you cannot bid yet. We will notify you once it is approved.',
            ], 403);
        }

        $allowedStatuses = [
            'open', 'accepted_arsitek', 'accepted_kontraktor', 'procurement', 
            'in_progress', 'completed_build', 'awaiting_payment', 'contract_pending', 'planning'
        ];
        if (!in_array($project->status, $allowedStatuses)) {
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
        if ($user->role_type === 'project_manager' && $project->pm_id) {
            return response()->json(['message' => 'A Project Manager has already been hired for this project.'], 422);
        }

        // Project target role check
        if ($project->target_role !== 'both' && $project->target_role !== $user->role_type) {
            return response()->json(['message' => "This project is not seeking a {$user->role_type}."], 422);
        }

        // Sequential Bidding Constraint
        if ($user->role_type === 'kontraktor' && $project->target_role === 'both' && !$project->design_completed_at) {
            // Allow if explicitly published
            if (!collect($project->published_bidding_roles)->contains('kontraktor')) {
                return response()->json(['message' => 'Contractor bids are only accepted after the design package has been finalized and sealed by the Architect.'], 422);
            }
        }

        $priceRule = $user->role_type === 'notaris' ? 'required|numeric|min:0' : 'required|numeric|gt:0';
        $request->validate([
            'price' => $priceRule,
            'price_max' => 'nullable|numeric|min:0',
            'proposal' => 'required|string|max:2000',
            'estimated_duration' => 'nullable|integer|min:1',
            'duration_unit' => 'nullable|string|in:days,weeks,months',
            'fee_type' => 'nullable|string|in:fixed,percentage,unit,sqm,hourly',
            'unit_price' => 'nullable|numeric|min:0',
            'quantity' => 'nullable|numeric|min:0',
            // SECURITY: bid attachments previously had ZERO validation.
            'attachment_1' => 'nullable|file|mimes:jpeg,png,jpg,gif,webp,pdf,zip|max:10240',
            'attachment_2' => 'nullable|file|mimes:jpeg,png,jpg,gif,webp,pdf,zip|max:10240',
            'attachment_3' => 'nullable|file|mimes:jpeg,png,jpg,gif,webp,pdf,zip|max:10240',
        ]);
        $attachments = [];
        for ($i = 1; $i <= 3; $i++) {
            $key = "attachment_$i";
            if ($request->hasFile($key)) {
                $path = $request->file($key)->store("projects/project_{$project->id}/bids/user_{$user->id}", 'public');
                $attachments[$key] = $path;
            } else {
                $attachments[$key] = null;
            }
        }

        $calc = $calculationService->calculate($request->all(), $project);

        $servicesTotal = 0;
        $selectedServices = $request->selected_services;
        if ($selectedServices) {
            $services = is_string($selectedServices) ? json_decode($selectedServices, true) : $selectedServices;
            if (is_array($services)) {
                foreach ($services as $service) {
                    $servicesTotal += (float) ($service['price'] ?? 0);
                }
            }
        }

        $calculatedTotal = $calc['calculated_total'] + $servicesTotal;
        if ($calculatedTotal <= 0) {
            return response()->json(['message' => 'Proposed fee must be greater than zero.'], 422);
        }

        $baseData = [
            'project_id' => $project->id,
            'price' => $calc['price'],
            'price_max' => $request->price_max,
            'fee_type' => $calc['fee_type'],
            'unit_price' => $calc['unit_price'],
            'quantity' => $calc['quantity'],
            'calculated_total' => $calculatedTotal,
            'proposal' => $request->proposal,
            'estimated_duration' => $request->estimated_duration ?: 1,
            'duration_unit' => $request->duration_unit ?: 'weeks',
            'attachment_1' => $attachments['attachment_1'],
            'attachment_2' => $attachments['attachment_2'],
            'attachment_3' => $attachments['attachment_3'],
            'status' => 'pending',
            'offered_by_id' => $user->id,
        ];

        if ($user->role_type === 'arsitek') {
            $profile = \App\Models\Arsitek::where('user_id', $user->id)->firstOrFail();

            // Prevent duplicate bids
            $existing = \App\Models\BidArsitek::where('project_id', $project->id)
                ->where('arsitek_id', $profile->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }

            if ($this->createBidGuarded(\App\Models\BidArsitek::class, array_merge($baseData, [
                'arsitek_id' => $profile->id,
                'scopes' => is_string($request->scopes) ? json_decode($request->scopes, true) : $request->scopes,
                'deliverables' => is_string($request->deliverables) ? json_decode($request->deliverables, true) : $request->deliverables,
                'style' => $request->style,
            ])) === null) {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }
        } elseif ($user->role_type === 'kontraktor') {
            $profile = \App\Models\Kontraktor::where('user_id', $user->id)->firstOrFail();

            $existing = \App\Models\BidKontraktor::where('project_id', $project->id)
                ->where('kontraktor_id', $profile->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }

            if ($this->createBidGuarded(\App\Models\BidKontraktor::class, array_merge($baseData, [
                'kontraktor_id' => $profile->id,
                'construction_method' => $request->construction_method,
                'cost_breakdown' => $request->cost_breakdown ? json_decode($request->cost_breakdown, true) : null,
                'workforce_count' => $request->workforce_count,
                'equipment_owned' => $request->equipment_owned,
                'warranty_months' => $request->warranty_months ?? 6,
                'payment_preference' => $request->payment_preference,
                'scopes' => is_string($request->scopes) ? json_decode($request->scopes, true) : $request->scopes,
                'deliverables' => is_string($request->deliverables) ? json_decode($request->deliverables, true) : $request->deliverables,
            ])) === null) {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }
        } elseif ($user->role_type === 'notaris') {
            $profile = \App\Models\NotarisProfile::where('user_id', $user->id)->firstOrFail();

            $existing = \App\Models\BidNotaris::where('project_id', $project->id)
                ->where('notaris_id', $profile->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }

            if ($this->createBidGuarded(\App\Models\BidNotaris::class, array_merge($baseData, [
                'notaris_id' => $profile->id,
                'tax_estimate' => $request->tax_estimate,
                'selected_services' => $request->selected_services ? json_decode($request->selected_services, true) : null,
            ])) === null) {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }
        } elseif ($user->role_type === 'interior') {
            $profile = \App\Models\InteriorProfile::where('user_id', $user->id)->firstOrFail();

            $existing = \App\Models\BidInterior::where('project_id', $project->id)
                ->where('interior_id', $profile->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }

            if ($this->createBidGuarded(\App\Models\BidInterior::class, array_merge($baseData, [
                'interior_id' => $profile->id,
                'scopes' => is_string($request->scopes) ? json_decode($request->scopes, true) : $request->scopes,
                'deliverables' => is_string($request->deliverables) ? json_decode($request->deliverables, true) : $request->deliverables,
                'style' => $request->style,
            ])) === null) {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }
        } elseif ($user->role_type === 'structural') {
            $profile = \App\Models\StructuralEngineer::where('user_id', $user->id)->firstOrFail();
            $existing = \App\Models\BidStructural::where('project_id', $project->id)
                ->where('structural_id', $profile->id)->first();
            if ($existing && $existing->status !== 'invited') {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }

            if ($existing && $existing->status === 'invited') {
                $existing->update(array_merge($baseData, [
                    'license_number' => $request->license_number,
                    'experience_years' => $request->experience_years,
                    'technical_notes' => $request->technical_notes,
                    'scopes' => is_string($request->scopes) ? json_decode($request->scopes, true) : $request->scopes,
                    'deliverables' => is_string($request->deliverables) ? json_decode($request->deliverables, true) : $request->deliverables,
                ]));
                return new ProjectResource($project);
            }

            if ($this->createBidGuarded(\App\Models\BidStructural::class, array_merge($baseData, [
                'structural_id' => $profile->id,
                'license_number' => $request->license_number,
                'experience_years' => $request->experience_years,
                'technical_notes' => $request->technical_notes,
                'scopes' => is_string($request->scopes) ? json_decode($request->scopes, true) : $request->scopes,
                'deliverables' => is_string($request->deliverables) ? json_decode($request->deliverables, true) : $request->deliverables,
            ])) === null) {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }
        } elseif ($user->role_type === 'mep') {
            $profile = \App\Models\MepEngineer::where('user_id', $user->id)->firstOrFail();
            $existing = \App\Models\BidMep::where('project_id', $project->id)
                ->where('mep_id', $profile->id)->first();
            if ($existing && $existing->status !== 'invited') {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }

            if ($existing && $existing->status === 'invited') {
                $existing->update(array_merge($baseData, [
                    'mep_id' => $profile->id,
                    'license_number' => $request->license_number,
                    'experience_years' => $request->experience_years,
                    'technical_notes' => $request->technical_notes,
                    'scopes' => is_string($request->scopes) ? json_decode($request->scopes, true) : $request->scopes,
                    'deliverables' => is_string($request->deliverables) ? json_decode($request->deliverables, true) : $request->deliverables,
                ]));
                return new ProjectResource($project);
            }

            if ($this->createBidGuarded(\App\Models\BidMep::class, array_merge($baseData, [
                'mep_id' => $profile->id,
                'license_number' => $request->license_number,
                'experience_years' => $request->experience_years,
                'technical_notes' => $request->technical_notes,
                'scopes' => is_string($request->scopes) ? json_decode($request->scopes, true) : $request->scopes,
                'deliverables' => is_string($request->deliverables) ? json_decode($request->deliverables, true) : $request->deliverables,
            ])) === null) {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }
        } elseif ($user->role_type === 'project_manager') {
            $profile = \App\Models\ProjectManager::where('user_id', $user->id)->firstOrFail();

            $existing = \App\Models\BidProjectManager::where('project_id', $project->id)
                ->where('pm_id', $profile->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }

            if ($this->createBidGuarded(\App\Models\BidProjectManager::class, array_merge($baseData, [
                'pm_id' => $profile->id,
                'fee_type' => $request->fee_type ?? 'fixed',
                'scopes' => is_string($request->scopes) ? json_decode($request->scopes, true) : $request->scopes,
                'deliverables' => is_string($request->deliverables) ? json_decode($request->deliverables, true) : $request->deliverables,
            ])) === null) {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }
        }

        // Notify Project Owner
        $roleLabel = match ($user->role_type) {
            'arsitek' => 'Arsitek',
            'kontraktor' => 'Kontraktor',
            'notaris' => 'Notaris',
            'interior' => 'Desainer Interior',
            'project_manager' => 'Project Manager',
            'structural' => 'Structural Engineer',
            'mep' => 'MEP Engineer',
            default => 'Profesional',
        };
        Notification::create([
            'user_id' => $project->user_id,
            'type' => 'bid_received',
            'title' => 'New Bid Received!',
            'body' => "{$user->name} ({$roleLabel}) telah mengirimkan penawaran untuk proyek \"{$project->title}\".",
            'data' => ['project_id' => $project->id, 'bidder_name' => $user->name, 'role_type' => $user->role_type],
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

    public function proposeFeeAndTermins(Request $request, Project $project, \App\Services\BidCalculationService $calculationService)
    {
        $user = Auth::user();

        $bidType = $request->input('bid_type');
        $priceRule = $bidType === 'notaris' ? 'required|numeric|min:0' : 'required|numeric|gt:0';
        $validated = $request->validate([
            'bid_id' => 'required|integer',
            'bid_type' => 'required|string|in:arsitek,kontraktor,notaris,interior,project_manager,structural,mep',
            'price' => $priceRule,
            'fee_type' => 'nullable|string|in:fixed,percentage,unit,sqm,hourly',
            'note' => 'nullable|string', // Optional note for audit trail
            'proposed_termins' => 'required|array',
            'proposed_termins.*.percentage' => 'required|numeric|min:0|max:100',
            'proposed_termins.*.trigger_description' => 'required|string',
            'proposed_termins.*.milestone_index' => 'nullable|integer',
            'proposed_milestones' => 'nullable|array',
            'proposed_milestones.*.title' => 'required|string',
            'proposed_milestones.*.description' => 'nullable|string',
            'selected_services' => 'nullable|array',
            'proposed_team' => 'nullable|array',
            'proposed_team.*.team_member_id' => 'nullable|integer',
            'proposed_team.*.name' => 'required|string|max:255',
            'proposed_team.*.role_title' => 'required|string|max:100',
            'proposed_team.*.role' => 'required|string|max:50',
            'proposed_team.*.fee' => 'required|numeric|min:0',
            'proposed_team.*.fee_type' => 'required|string|in:fixed,percentage',
            'proposed_team.*.note' => 'nullable|string|max:500',
            'project_length' => 'nullable|numeric|min:0',
            'project_width' => 'nullable|numeric|min:0',
        ]);

        $totalPercentage = collect($validated['proposed_termins'])->sum('percentage');
        if (abs($totalPercentage - 100) > 0.01) {
            return response()->json(['message' => 'The total percentage of payment termins must equal exactly 100%.'], 422);
        }

        $bid = null;
        $bidId = $validated['bid_id'];
        $bidType = $validated['bid_type'];

        if ($bidType === 'project_manager' && isset($validated['fee_type'])) {
            if (!in_array($validated['fee_type'], ['fixed', 'percentage'])) {
                return response()->json(['message' => 'Invalid fee structure for Project Managers. Project Managers are only permitted to use Fixed Fee or Percentage structures.'], 422);
            }
        }

        // Single source of truth: config/bids.php
        $modelClass = config("bids.{$bidType}.bid_model");
        // SECURITY: scope the bid to THIS project — a global find() previously
        // let the owner of project A rewrite bids belonging to project B.
        $bid = $modelClass::where('id', $bidId)->where('project_id', $project->id)->first();

        if (!$bid) {
            return response()->json(['message' => 'Bid not found.'], 404);
        }

        // Authorization: User must be either the Bidder (Professional) OR the Project Owner
        $isProjectOwner = (int)$project->user_id === (int)$user->id;
        
        // Generic Bid Ownership Check
        $isBidOwner = false;
        $profileIdFields = ['arsitek_id', 'kontraktor_id', 'pm_id', 'notaris_id', 'interior_id', 'structural_id', 'mep_id'];
        
        foreach ($profileIdFields as $field) {
            if (isset($bid->$field)) {
                // Find the profile for this user that matches the role
                $profile = null;
                if ($field === 'arsitek_id') $profile = \App\Models\Arsitek::where('user_id', $user->id)->first();
                elseif ($field === 'kontraktor_id') $profile = \App\Models\Kontraktor::where('user_id', $user->id)->first();
                elseif ($field === 'pm_id') $profile = \App\Models\ProjectManager::where('user_id', $user->id)->first();
                elseif ($field === 'notaris_id') $profile = \App\Models\NotarisProfile::where('user_id', $user->id)->first();
                elseif ($field === 'interior_id') $profile = \App\Models\InteriorProfile::where('user_id', $user->id)->first();
                elseif ($field === 'structural_id') $profile = \App\Models\StructuralEngineer::where('user_id', $user->id)->first();
                elseif ($field === 'mep_id') $profile = \App\Models\MepEngineer::where('user_id', $user->id)->first();

                if ($profile && (int)$bid->$field === (int)$profile->id) {
                    $isBidOwner = true;
                    break;
                }
            }
        }

        if (!$isProjectOwner && !$isBidOwner) {
            return response()->json(['message' => 'Unauthorized. You do not have permission to counter this bid.'], 403);
        }

        if (!$bid) {
            return response()->json(['message' => 'Bid not found for this user.'], 404);
        }

        if (!in_array($bid->status, ['shortlisted', 'negotiating'])) {
            return response()->json(['message' => 'Proposals can only be made during the shortlisting/negotiation phase.'], 422);
        }

        return DB::transaction(function () use ($bid, $validated, $project, $user, $calculationService) {
            // Update project dimensions if passed
            if (isset($validated['project_length']) && isset($validated['project_width'])) {
                $dims = is_array($project->project_dimensions) ? $project->project_dimensions : (json_decode($project->project_dimensions, true) ?? []);
                
                $length = (float) $validated['project_length'];
                $width = (float) $validated['project_width'];
                $area = $length * $width;

                if ($length > 0 && $width > 0) {
                    if ($project->project_category === 'new_build') {
                        $dims['building_length'] = $length;
                        $dims['building_width'] = $width;
                        $dims['building_size'] = $area;
                    } elseif ($project->project_category === 'renovation') {
                        $dims['renovation_length'] = $length;
                        $dims['renovation_width'] = $width;
                        $dims['renovation_area'] = $area;
                    } elseif ($project->project_category === 'interior') {
                        $dims['area_length'] = $length;
                        $dims['area_width'] = $width;
                        $dims['area_size'] = $area;
                    } else {
                        $dims['building_length'] = $length;
                        $dims['building_width'] = $width;
                        $dims['building_size'] = $area;
                    }
                    $project->update(['project_dimensions' => $dims]);
                }
            }

            // 2. Recalculate total including services
            $calc = $calculationService->calculate([
                'price' => $validated['price'],
                'fee_type' => $validated['fee_type'] ?? $bid->fee_type ?? 'fixed',
                'unit_price' => $bid->unit_price,
                'quantity' => $bid->quantity,
            ], $project);

            $servicesTotal = 0;
            if (isset($validated['selected_services']) && is_array($validated['selected_services'])) {
                foreach ($validated['selected_services'] as $service) {
                    $servicesTotal += (float) ($service['price'] ?? 0);
                }
            }

            // Calculate team member fees total
            $teamTotal = 0;
            $proposedTeam = $validated['proposed_team'] ?? null;
            if (is_array($proposedTeam)) {
                foreach ($proposedTeam as $tm) {
                    $feeVal = (float) ($tm['fee'] ?? 0);
                    $feeType = $tm['fee_type'] ?? 'fixed';

                    if ($feeType === 'percentage') {
                        $actualFee = ($feeVal / 100) * $calc['calculated_total'];
                    } else {
                        $actualFee = $feeVal;
                    }

                    $teamTotal += round($actualFee);
                }
            }

            $grandTotal = $calc['calculated_total'] + $servicesTotal + $teamTotal;
            if ($grandTotal <= 0) {
                return response()->json(['message' => 'Proposed fee must be greater than zero.'], 422);
            }

            // 1. Log the current state as a snapshot before updating
            $this->negotiationService->logRound($bid, $validated, $validated['note']);

            $bid->update([
                'price' => $validated['price'],
                'fee_type' => $validated['fee_type'] ?? $bid->fee_type ?? 'fixed',
                'calculated_total' => $grandTotal,
                'proposed_termins' => $validated['proposed_termins'],
                'proposed_milestones' => $validated['proposed_milestones'] ?? null,
                'selected_services' => $validated['selected_services'] ?? $bid->selected_services ?? null,
                'proposed_team' => $proposedTeam,
                'status' => 'negotiating',
                'offered_by_id' => $user->id,
                'negotiation_count' => ($bid->negotiation_count ?? 0) + 1,
            ]);

            \App\Models\ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => $user->id,
                'action' => 'fee_proposed',
                'details' => "{$user->name} proposed a counter-offer (Round " . ($bid->negotiation_count) . ").",
            ]);

            return response()->json([
                'message' => 'Fee and phases proposed successfully',
                'data' => $bid
            ]);
        });
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

        // CRITICAL FIX: Check for Architectural Brief/Drawings (SIMBG Requirement)
        if ($project->construction_brief_status !== 'approved') {
            return response()->json(['message' => 'Regulatory Block: PBG verification is locked until the Architectural Construction Brief (DED) is approved and locked.'], 422);
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
    public function shortlistBid(Request $request, Project $project)
    {
        return DB::transaction(function () use ($request, $project) {
            $user = Auth::user();
            $isOwner = $project->user_id === $user->id;
            $isPM = $project->pm_id && $user->role_type === 'project_manager' && $user->id === $project->pm_id;
            $isLeadArchitect = $project->selected_arsitek_id && $user->role_type === 'arsitek' && optional($user->arsitek)->id === $project->selected_arsitek_id;
            $isLeadContractor = $project->selected_kontraktor_id && $user->role_type === 'kontraktor' && optional($user->kontraktor)->id === $project->selected_kontraktor_id;

            $isSpecialistRole = in_array($request->bid_type, ['structural', 'mep']);
            $canShortlist = $isOwner || $isPM || ($isSpecialistRole && ($isLeadArchitect || $isLeadContractor));

            if (!$canShortlist) {
                return response()->json(['message' => 'Unauthorized. Only project owner, PM, or assigned lead professional can shortlist candidates.'], 403);
            }

            if (($isOwner || $isPM) && $project->wants_project_manager && !$isPM) {
                // If owner tries but there is a PM, we might still block unless it's a specialist?
                // Actually, let's just keep the existing logic for owner vs PM
                return response()->json(['message' => 'This project is managed by a Project Manager. Only the Project Manager can shortlist professionals.'], 403);
            }

            $request->validate([
                'bid_id' => 'required|integer',
                'bid_type' => 'required|in:arsitek,kontraktor,notaris,interior,structural,mep',
            ]);

            $bid = null;
            if ($request->bid_type === 'arsitek') {
                $bid = \App\Models\BidArsitek::where('id', $request->bid_id)->where('project_id', $project->id)->with('arsitek.user')->firstOrFail();
            } elseif ($request->bid_type === 'kontraktor') {
                $bid = \App\Models\BidKontraktor::where('id', $request->bid_id)->where('project_id', $project->id)->with('kontraktor.user')->firstOrFail();
            } elseif ($request->bid_type === 'notaris') {
                $bid = \App\Models\BidNotaris::where('id', $request->bid_id)->where('project_id', $project->id)->with('notaris.user')->firstOrFail();
            } elseif ($request->bid_type === 'interior') {
                $bid = \App\Models\BidInterior::where('id', $request->bid_id)->where('project_id', $project->id)->with('interior.user')->firstOrFail();
            } elseif ($request->bid_type === 'structural') {
                $bid = \App\Models\BidStructural::where('id', $request->bid_id)->where('project_id', $project->id)->with('structuralEngineer.user')->firstOrFail();
            } elseif ($request->bid_type === 'mep') {
                $bid = \App\Models\BidMep::where('id', $request->bid_id)->where('project_id', $project->id)->with('mepEngineer.user')->firstOrFail();
            }

            // State guard: only live bids may be shortlisted (never rejected,
            // cancelled, already-hired, or contract-pending ones).
            if (!in_array($bid->status, ['pending', 'negotiating', 'invited', 'reviewed'])) {
                return response()->json(['message' => "A bid with status '{$bid->status}' cannot be shortlisted."], 422);
            }

            $bid->update(['status' => 'shortlisted']);

            // Notify the shortlisted professional
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
                'type' => 'bid_shortlisted',
                'title' => 'Proposal Shortlisted!',
                'body' => "You have been shortlisted for project \"{$project->title}\". The owner wants to discuss your proposal.",
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
        });
    }

    public function acceptBid(Request $request, Project $project)
    {
        return DB::transaction(function () use ($request, $project) {
            $project = Project::whereKey($project->id)->lockForUpdate()->firstOrFail();
            $user = Auth::user();
            $isOwner = $project->user_id === $user->id;
            $isPM = $project->pm_id && $user->role_type === 'project_manager' && $user->id === $project->pm_id;

            if (!$isOwner && !$isPM) {
                return response()->json(['message' => 'Unauthorized. Only the Project Owner or Hired Project Manager can finalize hiring.'], 403);
            }

            $request->validate([
                'bid_id' => 'required|integer',
                'bid_type' => 'required|in:arsitek,kontraktor,notaris,interior,structural,mep',
                'verification_notes' => 'nullable|string|max:1000',
            ]);

            // Validate that the bid is shortlisted before accepting
            $bidModel = match ($request->bid_type) {
                'arsitek' => \App\Models\BidArsitek::class,
                'kontraktor' => \App\Models\BidKontraktor::class,
                'notaris' => \App\Models\BidNotaris::class,
                'interior' => \App\Models\BidInterior::class,
                'structural' => \App\Models\BidStructural::class,
                'mep' => \App\Models\BidMep::class,
            };

            $bidToCheck = $bidModel::where('id', $request->bid_id)->where('project_id', $project->id)->lockForUpdate()->firstOrFail();
            $projectColumn = config("bids.{$request->bid_type}.project_profile_column");
            $committedBid = $bidModel::where('project_id', $project->id)
                ->whereIn('status', ['contract_pending', 'awaiting_payment', 'accepted', 'active'])
                ->lockForUpdate()
                ->first();

            if ($project->$projectColumn || $committedBid) {
                return response()->json(['message' => 'This role already has a hired professional or a pending contract.'], 422);
            }

            // Financial Safety Check: Prevent Rp 0 or Unconfirmed Hire
            if ($bidToCheck->status !== 'shortlisted' && $bidToCheck->status !== 'negotiating' && $bidToCheck->status !== 'pending') {
                return response()->json(['message' => 'You must shortlist, negotiate, or have a pending bid first before hiring.'], 422);
            }

            if ($bidToCheck->price <= 0 && ($bidToCheck->calculated_total ?? 0) <= 0) {
                return response()->json(['message' => 'Cannot hire a professional with a Rp 0 fee. Please negotiate terms first.'], 422);
            }

            // If fee hasn't been explicitly agreed yet, we'll mark it as agreed now since the owner or PM is finalizing the decision
            if (!$bidToCheck->fee_agreed_at) {
                $bidToCheck->update(['fee_agreed_at' => now()]);
            }

            if ($isPM) {
                $bidToCheck->update([
                    'is_recommended' => true,
                    'verification_notes' => $request->verification_notes
                ]);

                // Create activity log
                ProjectActivityLog::create([
                    'project_id' => $project->id,
                    'user_id' => Auth::id(),
                    'action' => 'bid_recommended',
                    'details' => "Recommended " . ucfirst($request->bid_type) . " bid to the owner. PM Notes: " . ($request->verification_notes ?? 'None'),
                ]);

                // Notification to the owner
                Notification::create([
                    'user_id' => $project->user_id,
                    'type' => 'bid_recommended',
                    'title' => 'Professional Recommended',
                    'body' => "Your Project Manager has recommended a professional for your project \"{$project->title}\". Please review and approve.",
                    'data' => ['project_id' => $project->id, 'bid_id' => $bidToCheck->id, 'bid_type' => $request->bid_type],
                ]);

                $project->load([
                    'arsitek.user',
                    'kontraktor.user',
                    'notaris.user',
                    'interior.user',
                    'bidsArsitek.arsitek.user',
                    'bidsKontraktor.kontraktor.user',
                    'bidsNotaris.notaris.user',
                    'bidsInterior.interior.user',
                    'bidsProjectManager.pm.user',
                    'user',
                    'images',
                    'ratings',
                    'kontraktorRating',
                    'projectManager.user',
                    'paymentTermins'
                ])->loadCount(['bidsArsitek', 'bidsKontraktor', 'bidsNotaris', 'bidsInterior', 'bidsProjectManager']);

                return new ProjectResource($project);
            }

            // Zero Frontend Trust Validation for Owner if project has PM
            if ($isOwner && $project->pm_id && !$bidToCheck->is_recommended) {
                return response()->json(['message' => 'Unauthorized. The Project Manager must recommend this professional first.'], 403);
            }

            $financialService = app(\App\Services\ProjectFinancialService::class);
            $bidderName = 'Professional';
            $bidderUserId = null;

            if ($request->bid_type === 'arsitek') {
                $bid = \App\Models\BidArsitek::where('id', $request->bid_id)->where('project_id', $project->id)->with('arsitek.user')->firstOrFail();
                $bid->update([
                    'status' => 'contract_pending',
                    'verification_notes' => $request->verification_notes
                ]);
                \App\Models\BidArsitek::where('project_id', $project->id)->where('id', '!=', $bid->id)->update(['status' => 'rejected']);

                if ($project->target_role === 'arsitek' || $project->status === 'accepted_kontraktor') {
                    $project->update(['selected_arsitek_id' => $bid->arsitek_id]);
                } else {
                    $project->update(['selected_arsitek_id' => $bid->arsitek_id]);
                }

                // Removed AUTO-DEDUCT. This now happens in verifyBidPayment.

            } elseif ($request->bid_type === 'kontraktor') {
                $bid = \App\Models\BidKontraktor::where('id', $request->bid_id)->where('project_id', $project->id)->with('kontraktor.user')->firstOrFail();
                $bid->update([
                    'status' => 'contract_pending',
                    'verification_notes' => $request->verification_notes
                ]);
                \App\Models\BidKontraktor::where('project_id', $project->id)->where('id', '!=', $bid->id)->update(['status' => 'rejected']);

                if ($project->target_role === 'kontraktor' || $project->status === 'accepted_arsitek') {
                    $project->update(['selected_kontraktor_id' => $bid->kontraktor_id]);
                } else {
                    $project->update(['selected_kontraktor_id' => $bid->kontraktor_id]);
                }

                // Removed AUTO-DEDUCT.
                $this->lifecycleService->implicitVerify($project, 'design');

            } elseif ($request->bid_type === 'notaris') {
                $bid = \App\Models\BidNotaris::where('id', $request->bid_id)->where('project_id', $project->id)->with('notaris.user')->firstOrFail();
                $bid->update([
                    'status' => 'contract_pending',
                    'verification_notes' => $request->verification_notes
                ]);
                \App\Models\BidNotaris::where('project_id', $project->id)->where('id', '!=', $bid->id)->update(['status' => 'rejected']);

                $project->update([
                    'selected_notaris_id' => $bid->notaris_id,
                    'status' => 'in_progress'
                ]);

                $bidderName = $bid->notaris->user->name ?? 'Notary';
                $bidderUserId = $bid->notaris->user_id;

                // 4. Auto-finalize legal scope using negotiated services
                $services = is_array($bid->selected_services) ? $bid->selected_services : [];
                if (!empty($services)) {
                    $serviceIds = array_map(function($s) {
                        return is_array($s) ? (string)($s['id'] ?? $s) : (string)$s;
                    }, $services);
                    \App\Http\Controllers\Api\ProjectLegalController::syncProjectLegalScope($project, $serviceIds, $user->id);
                }

                // Tax estimate confirmation via addendum
                if ($bid->tax_estimate > 0) {
                    $project->addendums()->create([
                        'role_type' => 'notaris',
                        'user_id' => Auth::id(),
                        'title' => 'Legal Tax Estimate Confirmation',
                        'description' => "Estimated taxes (BPHTB/PPH) for legalization. Click to acknowledge and include in budget.",
                        'amount' => $bid->tax_estimate,
                        'status' => 'pending_approval',
                        'recommended_bid_id' => $bid->id,
                        'recommended_bid_type' => 'notaris',
                    ]);
                }
            } elseif ($request->bid_type === 'interior') {
                $bid = \App\Models\BidInterior::where('id', $request->bid_id)->where('project_id', $project->id)->with('interior.user')->firstOrFail();
                $bid->update([
                    'status' => 'contract_pending',
                    'verification_notes' => $request->verification_notes
                ]);
                \App\Models\BidInterior::where('project_id', $project->id)->where('id', '!=', $bid->id)->update(['status' => 'rejected']);

                $bidderName = $bid->interior->user->name ?? 'Interior Designer';
                $bidderUserId = $bid->interior->user_id;
                $project->update(['selected_interior_id' => $bid->interior_id]);

            } elseif ($request->bid_type === 'structural') {
                $bid = \App\Models\BidStructural::where('id', $request->bid_id)->where('project_id', $project->id)->with('structuralEngineer.user')->firstOrFail();
                $bid->update([
                    'status' => 'contract_pending',
                    'verification_notes' => $request->verification_notes
                ]);
                $bidderName = $bid->structuralEngineer->user->name ?? 'Specialist';
                $bidderUserId = $bid->structuralEngineer->user_id;

                // BUDGET CONFIRMATION: Engineering Resource (Manual Authorization)
                $project->addendums()->create([
                    'role_type' => 'structural',
                    'user_id' => Auth::id(),
                    'title' => 'Structural Engineer Budget Authorization',
                    'description' => "Acknowledging fee for {$bidderName} structural analysis resource.",
                    'amount' => $bid->calculated_total ?? $bid->price,
                    'status' => 'pending_approval',
                    'recommended_bid_id' => $bid->id,
                    'recommended_bid_type' => 'structural',
                ]);
            } elseif ($request->bid_type === 'mep') {
                $bid = \App\Models\BidMep::where('id', $request->bid_id)->where('project_id', $project->id)->with('mepEngineer.user')->firstOrFail();
                $bid->update([
                    'status' => 'contract_pending',
                    'verification_notes' => $request->verification_notes
                ]);
                $bidderName = $bid->mepEngineer->user->name ?? 'Specialist';
                $bidderUserId = $bid->mepEngineer->user_id;

                // BUDGET CONFIRMATION: Engineering Resource (Manual Authorization)
                $project->addendums()->create([
                    'role_type' => 'mep',
                    'user_id' => Auth::id(),
                    'title' => 'MEP Engineer Budget Authorization',
                    'description' => "Acknowledging fee for {$bidderName} MEP design resource.",
                    'amount' => $bid->calculated_total ?? $bid->price,
                    'status' => 'pending_approval',
                    'recommended_bid_id' => $bid->id,
                    'recommended_bid_type' => 'mep',
                ]);
            }

            // Global Notification to hired professional
            if ($bidderUserId) {
                Notification::create([
                    'user_id' => $bidderUserId,
                    'type' => 'bid_accepted',
                    'title' => 'Congratulations! Your Bid was Accepted',
                    'body' => "Your proposal for project \"{$project->title}\" has been accepted. You are now officially assigned to the project.",
                    'data' => ['project_id' => $project->id],
                ]);
            }

            if ($project->status === 'in_progress' || $project->status === 'accepted_arsitek' || $project->status === 'accepted_kontraktor') {
                \App\Models\ProjectMilestone::firstOrCreate(
                    ['project_id' => $project->id, 'title' => 'Project Kickoff'],
                    ['description' => 'Contract executed. The project is ready to begin.', 'status' => 'pending']
                );
            }

            // Removed auto-generation of milestones/termins here. 
            // These are now created exclusively in signContract() when the professional defines the final terms.

            ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'bid_accepted',
                'details' => "Accepted {$request->bid_type} bid from {$bidderName}. Budget commitment managed via professional fee ledger.",
            ]);

            $project->load([
                'arsitek.user',
                'kontraktor.user',
                'notaris.user',
                'interior.user',
                'bidsArsitek.arsitek.user',
                'bidsKontraktor.kontraktor.user',
                'bidsNotaris.notaris.user',
                'bidsInterior.interior.user',
                'bidsProjectManager.pm.user',
                'user',
                'images',
                'ratings',
                'kontraktorRating',
                'projectManager.user',
                'paymentTermins'
            ])->loadCount(['bidsArsitek', 'bidsKontraktor', 'bidsNotaris', 'bidsInterior', 'bidsProjectManager']);

            return new ProjectResource($project);
        });
    }


    /**
     * Submit planning brief for client approval.
     */
    public function submitPlanning(Project $project, Request $request)
    {
        // Only the selected architect can propose the plan.
        //
        // `Hire::matches()` rather than a direct comparison: `!==` against a
        // null relation id is `null !== null` -> FALSE, so the check PASSED for a
        // user with no arsiteks profile on a project with no architect.
        if (! \App\Support\Hire::matches($project, Auth::user(), 'arsitek')) {
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
            // `design_payment_verified_at` is NOT set here, and that is the fix.
            //
            // This method used to write it:
            //
            //     $project->update([
            //         'planning_status'    => 'approved',
            //         'planning_approved_at' => now(),
            //         'design_payment_verified_at' => now(),   // <-- here
            //     ]);
            //
            // but `design_payment_verified_at` is the IDEMPOTENCY GUARD AND
            // money flag of `verifyDesignPayment()`:
            //
            //     if ($project->design_payment_verified_at) {
            //         return ...'The design fee has already been verified...', 422;
            //     }
            //     ...
            //     $financial->recordPayment(...);
            //
            // So approving the plan permanently blocked the only endpoint that
            // records the design fee. Every project with a PM gate reached this
            // on its way to approval, so the deadlock was total, not rare:
            //
            //   - `recordPayment()` never ran, so the escrow ledger held no row
            //     for the architect's fee and `available()` overstated free
            //     budget by the whole design fee;
            //   - the architect's bid never reached `payment_status = paid`;
            //   - and the 422 a real client then hit said the fee had "already
            //     been verified", which is the opposite of what happened.
            //
            // Approving a design brief is not a payment event. The two now have
            // separate columns and separate endpoints, and the flag is set only
            // where money actually moves.
            $project->update([
                'planning_status' => 'approved',
                'planning_approved_at' => now(),
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
        // Only the selected architect can verify payment. See the note on
        // submitPlanning: `!==` against a null relation id is `false`, so the
        // direct comparison passed for a profiled-null architect.
        if (! \App\Support\Hire::matches($project, Auth::user(), 'arsitek')) {
            return response()->json(['message' => 'Only the assigned architect can verify payments.'], 403);
        }

        if ($project->planning_status !== 'approved') {
            return response()->json(['message' => 'The project must be approved before payment can be verified.'], 422);
        }

        // Idempotency + dispute freeze: this endpoint re-runs milestone
        // generation, so a second call silently recreated every deliverable
        // milestone, and it previously moved money with no dispute check at all.
        if ($project->design_payment_verified_at) {
            return response()->json(['message' => 'The design fee has already been verified for this project.'], 422);
        }

        try {
            app(\App\Services\DisputeService::class)->assertNoOpenDispute($project);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], $e->getCode() ?: 422);
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

                // MONEY CORRECTNESS: this booked `$acceptedBid->price`, but for a
                // PERCENTAGE-fee bid `price` is the percentage (e.g. 5) and
                // `calculated_total` is the rupiah amount. A 5% bid on a
                // Rp 200,000,000 project booked Rp 5 to the ledger, so the
                // escrow believed ~Rp 10,000,000 was still free and the owner
                // could over-commit the budget. Same rule as every other path.
                $amount = (float) ($acceptedBid->calculated_total ?? $acceptedBid->price);

                $financial = app(\App\Services\ProjectFinancialService::class);

                if (! $financial->recordPayment(
                    $project,
                    $amount,
                    'Paid Architect Base Fee (Verified by Professional)',
                    'App\Models\BidArsitek',
                    $acceptedBid->id
                )) {
                    throw new \Exception(
                        'Project budget is insufficient for the design fee (Rp '.number_format($amount, 0, ',', '.')
                        .'). Available: Rp '.number_format($financial->available($project), 0, ',', '.').'.',
                        422
                    );
                }

                // Payee confirmation — this endpoint previously notified nobody.
                \App\Models\Notification::create([
                    'user_id' => $project->user_id,
                    'type' => 'payment_verified',
                    'title' => 'Payment Verified',
                    'body' => "Your Rp ".number_format($amount, 0, ',', '.')
                        ." design fee for \"{$project->title}\" has been verified.",
                    'data' => [
                        'project_id' => $project->id,
                        'payment_type' => 'arsitek_bid',
                        'payment_id' => $acceptedBid->id,
                    ],
                ]);
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
            \Log::error('verifyDesignPayment failed: '.$e->getMessage(), [
                'project_id' => $project->id,
                'exception' => $e,
            ]);

            // Business-rule failures (insufficient budget) must reach the
            // professional verbatim; anything else stays generic.
            $code = (int) $e->getCode();
            if ($code >= 400 && $code < 600) {
                return response()->json(['message' => $e->getMessage()], $code);
            }

            return response()->json([
                'message' => 'Failed to verify payment and generate roadmap.',
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
            $bid = \App\Models\BidArsitek::where('id', $request->bid_id)->where('project_id', $project->id)->whereIn('status', ['pending', 'shortlisted'])->firstOrFail();
            $bid->update(['status' => 'rejected', 'rejection_reason' => $request->reason]);
        } elseif ($request->bid_type === 'kontraktor') {
            $bid = \App\Models\BidKontraktor::where('id', $request->bid_id)->where('project_id', $project->id)->whereIn('status', ['pending', 'shortlisted'])->firstOrFail();
            $bid->update(['status' => 'rejected', 'rejection_reason' => $request->reason]);
        } elseif ($request->bid_type === 'notaris') {
            $bid = \App\Models\BidNotaris::where('id', $request->bid_id)->where('project_id', $project->id)->whereIn('status', ['pending', 'shortlisted'])->firstOrFail();
            $bid->update(['status' => 'rejected', 'rejection_reason' => $request->reason]);
        } elseif ($request->bid_type === 'interior') {
            $bid = \App\Models\BidInterior::where('id', $request->bid_id)->where('project_id', $project->id)->whereIn('status', ['pending', 'shortlisted'])->firstOrFail();
            $bid->update(['status' => 'rejected', 'rejection_reason' => $request->reason]);
        } elseif ($request->bid_type === 'structural') {
            $bid = \App\Models\BidStructural::where('id', $request->bid_id)->where('project_id', $project->id)->whereIn('status', ['pending', 'shortlisted'])->firstOrFail();
            $bid->update(['status' => 'rejected', 'rejection_reason' => $request->reason]);
        } elseif ($request->bid_type === 'mep') {
            $bid = \App\Models\BidMep::where('id', $request->bid_id)->where('project_id', $project->id)->whereIn('status', ['pending', 'shortlisted'])->firstOrFail();
            $bid->update(['status' => 'rejected', 'rejection_reason' => $request->reason]);
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
        $reason = $request->reason ?: null;
        $body = "Your proposal for project \"{$project->title}\" was not selected this time.";
        if ($reason) {
            $body .= " Reason: {$reason}";
        }
        Notification::create([
            'user_id' => $bidderUserId,
            'type' => 'bid_rejected',
            'title' => 'Proposal Update',
            'body' => $body,
            'data' => ['project_id' => $project->id, 'rejection_reason' => $reason],
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
        } elseif ($user->role_type === 'interior' && $project->selected_interior_id) {
            $interior = \App\Models\InteriorProfile::where('user_id', $user->id)->first();
            if ($interior && $interior->id === $project->selected_interior_id) {
                $isWorker = true;
            }
        }

        $isPM = $project->pm_id === $user->id;

        if (!$isOwner && !$isWorker && !$isPM) {
            return response()->json(['message' => 'Unauthorized. Must be project owner, hired professional, or PM.'], 403);
        }

        // THE ESCROW CEILING IS NOT EDITABLE HERE.
        //
        // `UpdateProjectRequest` still accepts `budget`, and `$project->update()`
        // wrote it straight to the column — so the owner could rewrite the
        // ceiling with NO ledger row, no activity-log entry and no
        // `money:detect-duplicates` report. The escrow balance would change with
        // no record of who changed it or why, which is precisely the question
        // dispute arbitration has to answer.
        //
        // There is already a correct endpoint for this:
        // `POST /projects/{id}/budget/transactions` with
        // `transaction_type: deposit|adjustment_down`, which moves the ceiling
        // through `deductBudget` and records the movement. Two paths existed
        // and only one of them was auditable.
        //
        // Rejecting rather than silently unsetting matters: a silent unset
        // returns 200 and the owner believes their edit applied, which is the
        // same "reported success, did nothing" shape as the `/legal-
        // disbursements` create endpoint that always 422'd.
        //
        // Non-owners had `budget` unset further down for a different reason
        // (they may not edit the owner's budget at all); this guard runs first
        // and applies to the owner, who legitimately may change it — just not
        // by writing the column.
        if ($request->has('budget')) {
            return response()->json([
                'message' => 'The project budget cannot be edited directly. '
                    .'Use POST /projects/{$project->id}/budget/transactions with '
                    .'transaction_type "deposit" (to add funds) or "adjustment_down" (to reduce), '
                    .'so the change is recorded in the ledger.',
            ], 422);
        }

        $data = $request->validated();

        // SECURITY: lifecycle status transitions belong to dedicated flows
        // (handover/snag QA, mutual termination, markComplete). A hired
        // professional must never be able to force complete/cancel.
        //
        // The same applies to the OWNER's money and commercial fields. Only
        // `status` was stripped before, so a hired contractor could set
        // `budget` to an arbitrary figure AND, in the same request, rewrite the
        // payment schedule (`payment_termins`, with `target_role` defaulting to
        // their own role type) to match it — inflating what the owner is
        // invoiced against a budget they never agreed to.
        if (!$isOwner) {
            unset(
                $data['status'],
                $data['budget'],
                $data['deadline'],
                $data['completed_phases'],
                $data['negotiated_fee'],
                $data['payment_instructions'],
                $data['target_role'],
                $data['requires_structural'],
                $data['requires_mep'],
                $data['wants_project_manager'],
            );
        }

        // `payment_termins` is validated by UpdateProjectRequest (`:55`) but is
        // NOT a column on `projects` and NOT in `Project::$fillable`. Leaving it
        // in `$data` made `$project->update($data)` throw
        // MassAssignmentException, so this endpoint returned a 500 for every
        // request that carried a payment schedule — the schedule rewrite below
        // was unreachable. It is a nested side effect, not a project attribute,
        // so it is removed from the column payload and handled on its own.
        unset($data['payment_termins']);

        // Robust JSON Handling: Merge instead of overwrite for structured details
        if ($request->has('design_details')) {
            $data['design_details'] = array_merge(
                (array) ($project->design_details ?? []),
                (array) $request->design_details
            );

            // Specialist Tagging Notification Trigger
            if (isset($data['design_details']['requirements'])) {
                $oldRequirements = collect($project->design_details['requirements'] ?? []);
                $newRequirements = $data['design_details']['requirements'];

                foreach ($newRequirements as $newReq) {
                    if (empty($newReq['tagged_role'])) {
                        continue;
                    }

                    $reqId = $newReq['id'] ?? null;
                    $taggedRole = $newReq['tagged_role'];
                    $newTitle = $newReq['title'] ?? 'New Requirement';

                    // Check if this requirement already had this specialist role tagged
                    $oldReq = $oldRequirements->firstWhere('id', $reqId);
                    $alreadyTagged = $oldReq && isset($oldReq['tagged_role']) && $oldReq['tagged_role'] === $taggedRole;

                    if (!$alreadyTagged) {
                        // Resolve user ID for the tagged specialist role
                        $targetUserId = null;

                        if ($taggedRole === 'structural' && $project->structural_id) {
                            $se = \App\Models\StructuralEngineer::find($project->structural_id);
                            if ($se) {
                                $targetUserId = $se->user_id;
                            }
                        } elseif ($taggedRole === 'mep' && $project->mep_id) {
                            $me = \App\Models\MepEngineer::find($project->mep_id);
                            if ($me) {
                                $targetUserId = $me->user_id;
                            }
                        } elseif ($taggedRole === 'interior' && $project->selected_interior_id) {
                            $ip = \App\Models\InteriorProfile::find($project->selected_interior_id);
                            if ($ip) {
                                $targetUserId = $ip->user_id;
                            }
                        }

                        if ($targetUserId) {
                            Notification::create([
                                'user_id' => $targetUserId,
                                'type' => 'requirement_tagged',
                                'title' => '🚨 Tagged in Requirement Brief',
                                'body' => "You have been tagged in the design requirement: \"{$newTitle}\". Please check the Architecture subtab to provide your feedback.",
                                'data' => [
                                    'project_id' => $project->id,
                                    'requirement_id' => $reqId
                                ]
                            ]);
                        }
                    }
                }
            }
        }
        if ($request->has('construction_details')) {
            $data['construction_details'] = array_merge(
                (array) ($project->construction_details ?? []),
                (array) $request->construction_details
            );
        }
        if ($request->has('interior_details')) {
            $data['interior_details'] = array_merge(
                (array) ($project->interior_details ?? []),
                (array) $request->interior_details
            );
        }

        // Handle needed_phases if sent as JSON string
        if ($request->has('needed_phases') && is_string($request->needed_phases)) {
            $data['needed_phases'] = json_decode($request->needed_phases, true) ?? $project->needed_phases;
        }

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

        // `negotiated_fee` and `payment_instructions` are OWNER-ONLY here, and the
        // owner-only `unset()` above already enforces that for every non-owner.
        //
        // This block used to be:
        //
        //     $isArsitek = Auth::user()->role_type === 'arsitek'
        //         && Auth::user()->arsitek?->id === $project->selected_arsitek_id;
        //     if (!$isArsitek && !$isOwner) {
        //         unset($data['negotiated_fee'], $data['payment_instructions']);
        //     }
        //
        // Two things were wrong with it, and in opposite directions:
        //
        // 1. It was DEAD. The unconditional non-owner `unset()` further up already
        //    removed both keys, so `$isArsitek` could not change the outcome.
        //    Dead authorization code is worse than none -- it reads as a policy
        //    that does not exist.
        //
        // 2. It was a null-comparison trap: no column guard, so `null === null`
        //    would have made a profile-less `role_type=arsitek` "the architect".
        //    That was not exploitable ONLY because of the deadness in (1); the
        //    moment the earlier `unset()` were relaxed, it would have become live
        //    and would have handed a caller the figure the whole termin plan is
        //    validated against.
        //
        // A professional negotiates their fee through the bid negotiation flow
        // (`negotiation_count` / `fee_agreed_at` on the bid), which is where the
        // counterparty can also see and respond to it -- not by PATCHing the
        // project.
        // See ProjectResource::visibleBids(), which only shows negotiation state
        // to the owner, the PM, and the bidder themselves.

        // Sync the payment plan. Wrapped with the project write in ONE
        // transaction below so a rejected plan cannot leave the project
        // half-updated or the schedule wiped.
        if ($request->has('payment_termins')) {
            $terminPlan = app(\App\Services\TerminPlanService::class);

            // a professional may only rewrite termins for their OWN role;
            // rewriting another role's plan requires owner or assigned PM.
            $targetRole = $request->input('target_role', $user->role_type);
            $canActForOthers = $isOwner || ($isPM && (int) $project->pm_id === (int) $user->id);
            if (!$canActForOthers && $targetRole !== $user->role_type) {
                return response()->json(['message' => 'Unauthorized. You can only modify payment termins for your own role.'], 403);
            }

            // A stage has to belong to one of the seven licensed roles. Without
            // this, an owner who omits `target_role` defaults it to their own
            // `role_type` — the string 'user' — which matches no contract, so
            // every bound below silently no-ops.
            try {
                $terminPlan->assertKnownRole($targetRole);
            } catch (\Exception $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }

            // never destroy money-in-flight records — if any termin
            // of this role is verifying/paid, refuse the wholesale delete.
            $inFlight = $project->paymentTermins()
                ->where('role_type', $targetRole)
                ->whereIn('status', ['verifying', 'paid'])
                ->exists();
            if ($inFlight) {
                return response()->json(['message' => 'Cannot replace payment termins while any of them is verifying or paid.'], 422);
            }

            // THE MISSING BOUND.
            //
            // This path previously called no integrity guard at all. It deleted
            // the role's stages and recreated them from the request body, so a
            // hired professional could post
            //     {"payment_termins":[{"label":"DP","percentage":100,
            //                             "amount": 280000000}]}
            // against a Rp 50,000,000 contract and get a 200. The escrow
            // happily paid it later, because `deductBudget` only checks that
            // the PROJECT budget can cover the amount — not that the amount was
            // ever agreed.
            //
            // `ProjectPaymentTerminController::storePaymentTermin` has always
            // had this bound. The two paths must share it, which is the entire
            // reason TerminPlanService exists.
            $submitted = $request->input('payment_termins', []);

            $plannedTotal = 0.0;
            foreach ($submitted as $termin) {
                $plannedTotal += (float) ($termin['amount'] ?? 0);
            }

            try {
                $terminPlan->assertPercentagesWithinWhole($targetRole, $submitted);
                $terminPlan->assertTotalWithinContractValue($project, $targetRole, $plannedTotal);
            } catch (\Exception $e) {
                // TerminPlanService raises a domain violation with a 4xx code,
                // which Laravel does not translate on its own — without this the
                // guard surfaces as a 500. Same shape as the sibling controller.
                return response()->json(['message' => $e->getMessage()], 422);
            }
        }

        // The project write and the plan rewrite move together, so a plan that
        // the guards reject cannot leave the project updated against a schedule
        // that was never applied.
        DB::transaction(function () use ($project, $data, $request, $user, $isOwner, $isPM) {
            $project->update($data);

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
        });

        return new ProjectResource($project);
    }

    /**
     * Generic file upload for project-related assets (brief images, moodboards, etc.)
     */
    public function uploadFile(Request $request)
    {
        $request->validate([
            'file' => 'required|file|mimes:jpg,jpeg,png,pdf,webp|max:10240',
            'folder' => 'nullable|string'
        ]);

        // SECURITY: the folder is no longer caller-controlled — arbitrary
        // namespaces let users squat trusted prefixes (receipts/, chat_images/,
        // project_attachments/) and host content under our domain.
        $allowedFolders = ['project_assets', 'design_briefs'];
        $folder = in_array($request->input('folder'), $allowedFolders, true)
            ? $request->input('folder')
            : 'project_assets';
        $path = $request->file('file')->store($folder, 'public');

        try {
            $url = Storage::disk('public')->temporaryUrl($path, now()->addHours(24));
        } catch (\Throwable $e) {
            $url = Storage::disk('public')->url($path);
        }

        return response()->json([
            'url' => $url,
            'path' => $path
        ]);
    }

    public function destroy(Project $project)
    {
        if ($project->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // Load necessary relationships for checks
        $project->load([
            'bidsArsitek',
            'bidsKontraktor',
            'bidsNotaris',
            'bidsInterior',
            'bidsProjectManager',
            'bidsStructural',
            'bidsMep',
            'paymentTermins',
            'dailyLogs',
            'subProfessionals'
        ]);

        // GATE 1: Active Hires Check
        $hasHiredProfessionals = $project->selected_arsitek_id
            || $project->selected_kontraktor_id
            || $project->selected_notaris_id
            || $project->selected_interior_id
            || $project->pm_id
            || $project->structural_id
            || $project->mep_id;

        if ($hasHiredProfessionals) {
            return response()->json([
                'message' => 'Proyek tidak bisa dihapus karena sudah ada profesional yang disewa. Silakan gunakan pengajuan Pembatalan Bersama (Mutual Termination).'
            ], 422);
        }

        // GATE 2: Proof-of-Payment Financial Check (Paid or Verifying Termins)
        $hasFinancialTransactions = $project->paymentTermins()
            ->whereIn('status', ['paid', 'verifying'])
            ->exists();

        if ($hasFinancialTransactions) {
            return response()->json([
                'message' => 'Proyek tidak bisa dihapus karena terdapat transaksi pembayaran yang sudah diverifikasi atau sedang dalam proses verifikasi bukti transfer.'
            ], 422);
        }

        // GATE 3: Work-in-Progress Check (Daily Logs or Active Subcontractors)
        $hasWorkProgress = $project->dailyLogs()->exists()
            || $project->subProfessionals()->where('status', 'active')->exists();

        if ($hasWorkProgress) {
            return response()->json([
                'message' => 'Proyek tidak bisa dihapus karena progress pembangunan lapangan sudah berjalan.'
            ], 422);
        }

        DB::beginTransaction();
        try {
            // Cancel and archive all outstanding proposals.
            //
            // `'cancelled'` is NOT a member of the bids_* status ENUM:
            //   enum('pending','shortlisted','invited','negotiating',
            //        'contract_pending','awaiting_payment','accepted','active',
            //        'rejected','declined','terminated','resigned')
            // Under STRICT_TRANS_TABLES every one of these updates raised
            // ERROR 1265 "Data truncated", so `DELETE /api/projects/{id}` 500'd and
            // rolled back for EVERY owner whose project had even one pending bid.
            //
            // `terminated` is the existing value that means the engagement ended
            // by the client's decision, which is what cancelling on project
            // deletion is. `rejected` would be wrong: nobody evaluated these.
            //
            // Never widen the ENUM here to accommodate a bad literal -- see
            // migration 2026_10_01_000011 for the case where appending IS the
            // right answer.
            $project->bidsArsitek()->where('status', 'pending')->update(['status' => 'terminated']);
            $project->bidsKontraktor()->where('status', 'pending')->update(['status' => 'terminated']);
            $project->bidsNotaris()->where('status', 'pending')->update(['status' => 'terminated']);
            $project->bidsInterior()->where('status', 'pending')->update(['status' => 'terminated']);
            $project->bidsProjectManager()->where('status', 'pending')->update(['status' => 'terminated']);
            $project->bidsStructural()->where('status', 'pending')->update(['status' => 'terminated']);
            $project->bidsMep()->where('status', 'pending')->update(['status' => 'terminated']);

            $project->delete();
            DB::commit();
            return response()->json([
                'message' => 'Proyek berhasil dihapus.'
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            \Log::error('Project deletion failed: '.$e->getMessage(), ['exception' => $e]);
            return response()->json([
                'message' => 'Gagal menghapus proyek. Silakan coba lagi.'
            ], 500);
        }
    }

    public function myBids()
    {
        // Performance optimized: return lightweight project model
        $user = Auth::user();
        $formatBids = function ($bids) use ($user) {
            return $bids->map(function ($bid) use ($user) {
                $array = $bid->toArray();
                $array['role_type'] = $user->role_type;
                if ($bid->project) {
                    $array['project'] = [
                        'id' => $bid->project->id,
                        'title' => $bid->project->title,
                        'status' => $bid->project->status,
                    ];
                }
                return $array;
            });
        };
        if ($user->role_type === 'arsitek') {
            $arsitek = \App\Models\Arsitek::where('user_id', $user->id)->first();
            if (!$arsitek) {
                return response()->json(['data' => []]);
            }
            $bids = \App\Models\BidArsitek::with('project')
                ->where('arsitek_id', $arsitek->id)
                ->orderBy('created_at', 'desc')
                ->get();

            return response()->json(['data' => $formatBids($bids)]);
        } elseif ($user->role_type === 'kontraktor') {
            $kontraktor = \App\Models\Kontraktor::where('user_id', $user->id)->first();
            if (!$kontraktor) {
                return response()->json(['data' => []]);
            }
            $bids = \App\Models\BidKontraktor::with('project')
                ->where('kontraktor_id', $kontraktor->id)
                ->orderBy('created_at', 'desc')
                ->get();

            return response()->json(['data' => $formatBids($bids)]);
        } elseif ($user->role_type === 'notaris') {
            $notaris = \App\Models\NotarisProfile::where('user_id', $user->id)->first();
            if (!$notaris) {
                return response()->json(['data' => []]);
            }
            $bids = \App\Models\BidNotaris::with('project')
                ->where('notaris_id', $notaris->id)
                ->orderBy('created_at', 'desc')
                ->get();

            return response()->json(['data' => $formatBids($bids)]);
        } elseif ($user->role_type === 'interior') {
            $interior = \App\Models\InteriorProfile::where('user_id', $user->id)->first();
            if (!$interior) {
                return response()->json(['data' => []]);
            }
            $bids = \App\Models\BidInterior::with('project')
                ->where('interior_id', $interior->id)
                ->orderBy('created_at', 'desc')
                ->get();

            return response()->json(['data' => $formatBids($bids)]);
        } elseif ($user->role_type === 'project_manager') {
            $pm = \App\Models\ProjectManager::where('user_id', $user->id)->first();
            if (!$pm) {
                return response()->json(['data' => []]);
            }
            $bids = \App\Models\BidProjectManager::with('project')
                ->where('pm_id', $pm->id)
                ->orderBy('created_at', 'desc')
                ->get();

            return response()->json(['data' => $formatBids($bids)]);
        } elseif ($user->role_type === 'structural') {
            $structural = \App\Models\StructuralEngineer::where('user_id', $user->id)->first();
            if (!$structural) return response()->json(['data' => []]);
            $bids = \App\Models\BidStructural::with('project')
                ->where('structural_id', $structural->id)
                ->orderBy('created_at', 'desc')
                ->get();
            return response()->json(['data' => $formatBids($bids)]);
        } elseif ($user->role_type === 'mep') {
            $mep = \App\Models\MepEngineer::where('user_id', $user->id)->first();
            if (!$mep) return response()->json(['data' => []]);
            $bids = \App\Models\BidMep::with('project')
                ->where('mep_id', $mep->id)
                ->orderBy('created_at', 'desc')
                ->get();
            return response()->json(['data' => $formatBids($bids)]);
        }
        return response()->json(['data' => []]);
    }

    public function getActiveProjects()
    {
        $user = Auth::guard('sanctum')->user();
        if (!$user) {
            return response()->json(['data' => []]);
        }

        // projects.pm_id stores the PM's *user* id (set at hire time from $bid->pm->user_id)
        $projects = Project::where(function ($query) use ($user) {
            $query->where('user_id', $user->id)
                ->orWhere('selected_arsitek_id', $user->arsitek?->id)
                ->orWhere('selected_kontraktor_id', $user->kontraktor?->id)
                ->orWhere('selected_notaris_id', $user->notaris_profile?->id)
                ->orWhere('selected_interior_id', $user->interior_profile?->id)
                ->orWhere('pm_id', $user->id)
                ->orWhere('structural_id', $user->structural_engineer?->id)
                ->orWhere('mep_id', $user->mep_engineer?->id);
        })
        ->whereIn('status', ['open', 'accepted_arsitek', 'accepted_kontraktor', 'procurement', 'in_progress', 'planning'])
        ->select('id', 'title')
        ->latest()
        ->get();

        return response()->json(['data' => $projects]);
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

        // SECURITY: this endpoint is unauthenticated (anyone holding the share
        // token). Map Q&A to an explicit safe shape — raw User objects would
        // leak commenter emails.
        $comments = $project->comments()->whereNull('parent_id')
            ->with(['user', 'replies.user'])
            ->get()
            ->map(fn ($c) => [
                'id' => $c->id,
                'message' => $c->message,
                'created_at' => $c->created_at?->toIso8601String(),
                'user' => ['name' => $c->user?->name ?? 'User'],
                'replies' => $c->replies->map(fn ($r) => [
                    'id' => $r->id,
                    'message' => $r->message,
                    'created_at' => $r->created_at?->toIso8601String(),
                    'user' => ['name' => $r->user?->name ?? 'User'],
                ]),
            ]);

        return response()->json([
            'title' => $project->title,
            'location' => $project->lokasi,
            'city' => $project->city,
            'construction_details' => $details,
            'construction_locked_at' => $project->construction_locked_at,
            'milestones' => $project->milestones()->orderBy('sort_order')->get(),
            'requirements' => $project->requirements()->orderBy('name')->get(),
            'comments' => $comments,
        ]);
    }

    public function broadcastPhase(Project $project, Request $request, ProjectPhaseService $service)
    {
        $request->validate(['role' => 'required|string|in:arsitek,kontraktor,notaris,interior,structural,mep']);

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
            'phase_role' => 'required|string|in:arsitek,kontraktor,notaris,interior,project_manager,structural,mep',
            'team_member_id' => 'nullable|exists:team_members,id',
            'company_name' => 'nullable|string|max:255',
            'contact_person' => 'required|string|max:255',
            'phone_number' => 'required|string|max:20',
            'email' => 'nullable|email|max:255',
            'agreed_fee' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
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
    public function inviteProfessional(Project $project, Request $request)
    {
        $user = Auth::user();
        
        $isOwner = $project->user_id === $user->id;
        $isArchitect = $project->selected_arsitek_id && $user->role_type === 'arsitek' && optional($user->arsitek)->id === $project->selected_arsitek_id;
        $isPM = $project->pm_id && $user->role_type === 'project_manager' && $user->id === $project->pm_id;

        if (!$isOwner && !$isArchitect && !$isPM) {
            return response()->json(['message' => 'Unauthorized. Only the owner, assigned architect, or project manager can invite professionals.'], 403);
        }

        $request->validate([
            'professional_id' => 'required|integer',
            'role_type' => 'required|in:arsitek,kontraktor,notaris,interior,project_manager,structural,mep',
        ]);

        return DB::transaction(function () use ($project, $request) {
            $bidModel = match ($request->role_type) {
                'arsitek' => \App\Models\BidArsitek::class,
                'kontraktor' => \App\Models\BidKontraktor::class,
                'notaris' => \App\Models\BidNotaris::class,
                'interior' => \App\Models\BidInterior::class,
                'project_manager' => \App\Models\BidProjectManager::class,
                'structural' => \App\Models\BidStructural::class,
                'mep' => \App\Models\BidMep::class,
            };

            $roleField = match ($request->role_type) {
                'arsitek' => 'arsitek_id',
                'kontraktor' => 'kontraktor_id',
                'notaris' => 'notaris_id',
                'interior' => 'interior_id',
                'project_manager' => 'pm_id',
                'structural' => 'structural_id',
                'mep' => 'mep_id',
            };

            // Resolve the target professional's profile first (validates existence).
            $profileModel = match ($request->role_type) {
                'arsitek' => \App\Models\Arsitek::class,
                'kontraktor' => \App\Models\Kontraktor::class,
                'notaris' => \App\Models\NotarisProfile::class,
                'interior' => \App\Models\InteriorProfile::class,
                'project_manager' => \App\Models\ProjectManager::class,
                'structural' => \App\Models\StructuralEngineer::class,
                'mep' => \App\Models\MepEngineer::class,
            };
            $professional = $profileModel::find($request->professional_id);
            if (!$professional) {
                return response()->json(['message' => 'The invited professional could not be found for this role.'], 422);
            }

            // Check if already invited or bid exists
            $existing = $bidModel::where('project_id', $project->id)
                ->where($roleField, $request->professional_id)
                ->first();

            if ($existing) {
                return response()->json(['message' => 'This professional already has a bid or invitation for this project.'], 422);
            }

            // Create "Invite" Bid
            $bid = $bidModel::create([
                'project_id' => $project->id,
                $roleField => $request->professional_id,
                'price' => 0, // Initial price is 0 for invitation
                'proposal' => 'You have been invited to join this project by the owner.',
                'status' => 'invited',
            ]);

            $proName = $professional->user?->name ?? ($professional->nama ?? "Professional #{$request->professional_id}");
            ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'professional_invited',
                'details' => "Invited {$proName} ({$request->role_type}) to bid on project.",
            ]);

            // Notify the professional
            $proUser = $professional->user;

            if ($proUser) {
                \App\Models\Notification::create([
                    'user_id' => $proUser->id,
                    'type' => 'project_invitation',
                    'title' => 'New Project Invitation!',
                    'body' => "You have been invited to participate in the project \"{$project->title}\".",
                    'data' => ['project_id' => $project->id, 'bid_id' => $bid->id, 'role_type' => $request->role_type],
                ]);
            }

            return response()->json([
                'message' => 'Invitation sent successfully.',
                'bid' => $bid
            ]);
        });
    }

    /**
     * Mark a project as completed (simple owner-only action).
     * Once completed, professionals can no longer modify the project
     * and the owner can leave ratings for the professionals.
     */
    public function markComplete(Project $project)
    {
        $user = Auth::guard('sanctum')->user();

        if ($project->user_id !== $user->id) {
            return response()->json(['message' => 'Only the project owner can complete the project.'], 403);
        }

        if ($project->status === 'completed') {
            return response()->json(['message' => 'Project is already completed.'], 422);
        }

        if ($project->status === 'cancelled') {
            return response()->json(['message' => 'Cannot complete a cancelled project.'], 422);
        }

        return DB::transaction(function () use ($project) {
            $project->update([
                'status' => 'completed',
                'completed_at' => now(),
            ]);

            \App\Models\ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'project_completed',
                'details' => 'Project marked as complete by owner.',
            ]);

            return response()->json([
                'message' => 'Project completed successfully.',
                'data' => new \App\Http\Resources\ProjectResource($project->fresh())
            ]);
        });
    }

    public function negotiateBidFee(Request $request, Project $project, $bidId, \App\Services\BidCalculationService $calculationService)
    {
        $user = Auth::user();
        $bidType = $request->input('bid_type');
        $priceRule = $bidType === 'notaris' ? 'required|numeric|min:0' : 'required|numeric|gt:0';
        $request->validate([
            'bid_type' => 'required|in:arsitek,kontraktor,notaris,interior,project_manager,structural,mep',
            'price' => $priceRule,
            'selected_services' => 'nullable|array',
        ]);
        $bidType = $request->bid_type;
        $bidModel = $this->getBidModel($bidType);
        $bid = $bidModel::where('id', $bidId)->where('project_id', $project->id)->firstOrFail();

        // Only owner, the assigned PM, the professional, or the hired lead architect/contractor can negotiate
        $proUserId = $this->getBidderUserId($bid, $bidType);
        $project->loadMissing(['arsitek.user', 'kontraktor.user']);
        $arsitekUserId = $project->arsitek->user_id ?? null;
        $kontraktorUserId = $project->kontraktor->user_id ?? null;

        if ($user->id !== $project->user_id && $user->id !== $project->pm_id &&
            $user->id !== $proUserId && $user->id !== $arsitekUserId && $user->id !== $kontraktorUserId) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        if ($bid->offered_by_id === $user->id) {
            return response()->json(['message' => 'You have already made an offer. Please wait for the other party to respond.'], 422);
        }

        return DB::transaction(function () use ($bid, $project, $request, $user, $calculationService) {
            // Check negotiation limit
            if ($bid->negotiation_count >= 5) {
                // B1: this is not a hard stop — confirmBidFee has no cap, so
                // either party can still ACCEPT the standing offer. Say so.
                return response()->json([
                    'message' => 'Negotiation limit reached (max 5 rounds). You can no longer counter-offer, but you can accept the current proposal ("Agree on Fee") or decline the bid.'
                ], 422);
            }

            $calc = $calculationService->calculate([
                'price' => $request->price,
                'fee_type' => $bid->fee_type,
                'unit_price' => $bid->unit_price,
                'quantity' => $bid->quantity,
            ], $project);

            $servicesTotal = 0;
            // Selected services can come from request array OR stay the same from current bid if not provided
            $services = $request->selected_services ?? $bid->selected_services ?? [];
            if (is_array($services)) {
                foreach ($services as $service) {
                    $servicesTotal += (float) ($service['price'] ?? 0);
                }
            }

            // Calculate team member fees total if any
            $teamTotal = 0;
            $proposedTeam = $bid->proposed_team;
            if (is_string($proposedTeam)) {
                $proposedTeam = json_decode($proposedTeam, true);
            }
            if (is_array($proposedTeam)) {
                foreach ($proposedTeam as $tm) {
                    $feeVal = (float) ($tm['fee'] ?? 0);
                    $feeType = $tm['fee_type'] ?? 'fixed';
                    if ($feeType === 'percentage') {
                        $actualFee = ($feeVal / 100) * $calc['calculated_total'];
                    } else {
                        $actualFee = $feeVal;
                    }
                    $teamTotal += round($actualFee);
                }
            }

            $newCalculatedTotal = $calc['calculated_total'] + $servicesTotal + $teamTotal;
            if ($newCalculatedTotal <= 0) {
                return response()->json(['message' => 'Proposed fee must be greater than zero.'], 422);
            }

            $bid->update([
                'price' => $calc['price'],
                'calculated_total' => $newCalculatedTotal,
                'selected_services' => $services,
                'unit_price' => $calc['unit_price'],
                'quantity' => $calc['quantity'],
                'status' => 'negotiating',
                'offered_by_id' => $user->id,
                'negotiation_count' => $bid->negotiation_count + 1,
                'fee_agreed_at' => null, // Reset agreement if renegotiating
            ]);

            return response()->json([
                'message' => 'Fee proposal submitted (' . $bid->negotiation_count . '/5).',
                'bid' => $bid
            ]);
        });
    }

    public function confirmBidFee(Project $project, $bidId, Request $request)
    {
        $user = Auth::user();
        $request->validate(['bid_type' => $this->bidTypeRule()]);

        $bidModel = $this->getBidModel($request->bid_type);
        $bid = $bidModel::where('id', $bidId)->where('project_id', $project->id)->firstOrFail();

        if ($bid->offered_by_id === $user->id) {
            return response()->json(['message' => 'You cannot confirm your own proposal. Wait for the other party.'], 422);
        }

        // Only owner, the assigned PM, the professional, or the hired lead architect/contractor can confirm
        $proUserId = $this->getBidderUserId($bid, $request->bid_type);
        $project->loadMissing(['arsitek.user', 'kontraktor.user']);
        $arsitekUserId = $project->arsitek->user_id ?? null;
        $kontraktorUserId = $project->kontraktor->user_id ?? null;

        if ($user->id !== $project->user_id && $user->id !== $project->pm_id &&
            $user->id !== $proUserId && $user->id !== $arsitekUserId && $user->id !== $kontraktorUserId) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        return DB::transaction(function () use ($bid, $user) {
            $updateData = [
                'fee_agreed_at' => now()
            ];

            // Only transition the status if it's currently in the negotiating or invited phase.
            // Prevent demoting active professionals if button was clicked via legacy data.
            if ($bid->status === 'negotiating' || $bid->status === 'invited') {
                // If the PM or Owner confirms, we push it to 'shortlisted' so the Owner can proceed to hire.
                if ($bid->project->user_id === $user->id || $bid->project->pm_id === $user->id) {
                    $updateData['status'] = 'shortlisted';
                }
            }

            $bid->update($updateData);

            return response()->json(['message' => 'Fee agreement confirmed.', 'bid' => $bid]);
        });
    }

    public function signContract(Project $project, $bidId, Request $request)
    {
        $user = Auth::user();
        $request->validate([
            'bid_type' => $this->bidTypeRule(),
            'termins' => 'required|array|min:1',
            'termins.*.label' => 'required|string',
            'termins.*.percentage' => 'required|numeric|min:0|max:100',
            'termins.*.amount' => 'required|numeric|min:0',
            'milestones' => 'nullable|array',
            'milestones.*.title' => 'required|string|max:255',
            'milestones.*.description' => 'nullable|string',
            // A signature is a base64 data URL for a real image.
            //
            // Previously `'nullable|string'` with no length bound and no format
            // check, and the handler's only test was
            // `preg_match('/^data:image\/(\w+);base64,/')` before
            // `base64_decode()` and `put()` at `.../signature_{role}_{bid}_{ts}.png`.
            // So a professional could put ARBITRARY BYTES at a `.png` path in the
            // private vault, unbounded in size -- filling the bucket, or leaving a
            // file that is not an image but is served as one.
            //
            // 1.5 MB of base64 is roughly a 1 MB image, comfortably above a
            // signature and far below anything a caller legitimately sends.
            'signature' => [
                'nullable',
                'string',
                'max:1572864',
                'regex:/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+\/=]+$/',
            ],
            'bank_type' => 'required|string|max:255',
            'bank_account_no' => 'required|string|regex:/^[0-9]+$/|min:5|max:30',
            'bank_account_name' => 'required|string|min:3|max:255',
        ]);

        $bidModel = $this->getBidModel($request->bid_type);
        $bid = $bidModel::where('id', $bidId)->where('project_id', $project->id)->firstOrFail();

        // Only the professional of THIS bid can sign
        $proUserId = $this->getBidderUserId($bid, $request->bid_type);
        if ($user->id !== $proUserId) {
            return response()->json(['message' => 'Unauthorized. Only the invited professional can sign this contract.'], 403);
        }

        if ($bid->status !== 'contract_pending') {
            return response()->json(['message' => 'This bid is not in a signable state.'], 422);
        }

        // Replay protection: once money starts moving for this role (proof uploaded
        // or payment verified), the agreed terms are frozen and cannot be re-signed.
        $hasActivePayments = $project->paymentTermins()
            ->where('role_type', $request->bid_type)
            ->whereIn('status', ['verifying', 'paid'])
            ->exists();
        if ($hasActivePayments) {
            return response()->json([
                'message' => 'This contract already has an ongoing or completed payment. Its terms are locked and can no longer be changed.'
            ], 422);
        }

        // THE EXPECTED TOTAL IS DERIVED ONCE, BY TerminPlanService.
        //
        // This used to be a third, local derivation:
        //
        //     $expectedTotal = calculated_total > 0 ? calculated_total : 0;
        //     if ($expectedTotal <= 0 && $bid->fee_type === 'percentage') {
        //         $expectedTotal = ($bid->price / 100) * ($project->budget ?? 0);
        //     } else { $expectedTotal = $bid->price; }
        //
        // which disagreed with `TerminPlanService::contractValueFor()` (that one
        // is `calculated_total ?? price`, with no budget-percentage fallback).
        // The same contract was therefore worth two different amounts depending
        // on which code read it — and this one runs on the path that makes the
        // contract BINDING.
        $terminPlan = app(\App\Services\TerminPlanService::class);
        $expectedTotal = $terminPlan->contractValueFor($project, $request->bid_type);

        // Critical Block: Prevent hiring for Rp 0
        if ($expectedTotal === null || $expectedTotal <= 0) {
            return response()->json([
                'message' => 'Contract value cannot be zero. Please negotiate a fee first.',
            ], 422);
        }

        // Percentages are a SPLIT of the agreed fee, not an increment, so they
        // must total exactly 100. `assertPercentagesWithinWhole()` also rejects
        // >100, which the previous local check did not.
        $terminPlan->assertPercentagesWithinWhole($request->bid_type, $request->termins);

        // A stage amount of zero is REJECTED, not recalculated.
        //
        // The old code skipped the total check when `$totalAmount <= 0`
        // ("we will recalculate below") and then rebuilt each amount with
        //
        //     $amount = round(($percentage / 100) * $expectedTotal);
        //
        // — a float multiply plus `round()`, applied AFTER the check that should
        // have caught it. A client sending all-zero amounts got stages written
        // whose sum did not equal the agreed fee, and nothing reconciled them
        // afterwards. A professional is SIGNING a contract here; they should be
        // shown the figures they agreed to, not handed derived ones.
        $totalAmount = collect($request->termins)->sum('amount');

        $zeroAmountStage = collect($request->termins)
            ->first(fn ($t) => (float) ($t['amount'] ?? 0) <= 0);

        if ($zeroAmountStage !== null) {
            return response()->json([
                'message' => 'Every payment stage must carry an amount. Stage "'
                    .($zeroAmountStage['label'] ?? 'untitled')
                    .'" was submitted as Rp 0; supply the amounts you agreed rather '
                    .'than having the server derive them.',
            ], 422);
        }

        // The plan total must equal the agreed fee. Exact integer minor units,
        // with the tolerance owned by TerminPlanService rather than restated here.
        $terminPlan->assertTotalWithinContractValue($project, $request->bid_type, $totalAmount);

        // ...and it must not undershoot either. `assertTotalWithinContractValue`
        // is one-sided (it bounds the ceiling), because during plan BUILDING a
        // partial schedule is legitimate. On the binding path a shortfall is
        // not: it would sign a contract for less than was negotiated.
        $shortfall = \App\Support\Money::of($expectedTotal)
            ->subtract(\App\Support\Money::fromColumn($totalAmount))
            ->toFloat();

        if ($shortfall > 0) {
            return response()->json([
                'message' => 'The total of the payment stages (Rp '
                    .number_format((float) $totalAmount, 0, ',', '.')
                    .') is Rp ' . number_format($shortfall, 0, ',', '.')
                    .' short of the negotiated contract value (Rp '
                    .number_format((float) $expectedTotal, 0, ',', '.').').',
            ], 422);
        }

        // `$expectedTotal` is NOT captured: after the guards above moved out, the
        // closure no longer reads it. Keeping an unused capture would imply the
        // persisted stages are still checked against it here — they are, by
        // `assertPlanComplete()`, which reads the DATABASE.
        return DB::transaction(function () use ($project, $bid, $request, $user, $terminPlan) {
            // 0. Bank details go to the SIGNER'S OWN record, and only there.
            //
            // This used to be followed by:
            //
            //     $project->update(['payment_instructions' =>
            //         "Bank: {$bankType} | No. Rekening: {$no} | A/N: {$name}"]);
            //
            // which is a counterparty writing into the OWNER's authoritative
            // payment-instruction field — the one `BriefingActionCenter` lets the
            // owner edit and `ProjectPayments` renders to the owner as "transfer
            // escrow here". It was also a single project-level column shared by
            // all seven roles, so signing was last-writer-wins: architect signs,
            // contractor signs, and the owner is left with one account belonging
            // to neither role in particular.
            //
            // The owner's own instructions stay the owner's, and the payout
            // destination per role is DERIVED from this structured, per-user data
            // by PayoutDestinationService. Nothing trustworthy was lost: this
            // line was the field's only non-owner writer.
            $bankType = trim($request->bank_type);
            $bankAccountNo = trim($request->bank_account_no);
            $bankAccountName = trim($request->bank_account_name);

            $user->update([
                'bank_name' => $bankType,
                'bank_account_number' => $bankAccountNo,
                'bank_account_name' => $bankAccountName,
            ]);

            // Save professional signature if provided
            if ($request->signature) {
                $signatureData = $request->signature;
                if (preg_match('/^data:image\/(\w+);base64,/', $signatureData, $type)) {
                    $signatureData = substr($signatureData, strpos($signatureData, ',') + 1);
                    $signatureData = base64_decode($signatureData);
                    
                    if ($signatureData !== false) {
                        $timestamp = $bid->created_at ? $bid->created_at->timestamp : time();
                        $fileName = "signature_{$request->bid_type}_{$bid->id}_{$timestamp}.png";
                        Storage::disk(\App\Support\Vault::disk())->put("contracts/project_{$project->id}/signatures/" . $fileName, $signatureData);
                        \Illuminate\Support\Facades\Cache::forget("sig_exists_{$project->id}_{$request->bid_type}_{$bid->id}_{$timestamp}");
                    }
                }
            }

            // 1. Clear existing termins for this role, but NEVER touch ones with
            // money in flight (proof uploaded / already paid) — defense in depth
            // alongside the replay guard above.
            $project->paymentTermins()
                ->where('role_type', $request->bid_type)
                ->whereNotIn('status', ['verifying', 'paid'])
                ->delete();

            // 1. Create Work Plan (Milestones) First
            $milestoneIdMap = [];
            $phaseContext = match ($request->bid_type) {
                'notaris' => 'legal',
                'arsitek' => 'design',
                'kontraktor' => 'build',
                'interior' => 'interior',
                'project_manager' => 'management',
                default => $request->bid_type,
            };

            if ($request->has('milestones') && is_array($request->milestones)) {
                foreach ($request->milestones as $index => $m) {
                    $milestoneData = [
                        'project_id' => $project->id,
                        'title' => $m['title'],
                        'description' => $m['description'] ?? null,
                        'approval_status' => 'pending',
                        'phase_context' => $phaseContext,
                        'sort_order' => $index,
                        'content' => [
                            'services' => $m['services'] ?? []
                        ],
                    ];

                    // Link to professional ID
                    if ($request->bid_type === 'notaris') $milestoneData['notaris_id'] = $bid->notaris_id;
                    elseif ($request->bid_type === 'arsitek') $milestoneData['arsitek_id'] = $bid->arsitek_id;
                    elseif ($request->bid_type === 'kontraktor') $milestoneData['kontraktor_id'] = $bid->kontraktor_id;
                    elseif ($request->bid_type === 'interior') $milestoneData['interior_id'] = $bid->interior_id;
                    elseif ($request->bid_type === 'project_manager') $milestoneData['pm_id'] = $bid->pm_id;
                    elseif ($request->bid_type === 'structural') $milestoneData['structural_id'] = $bid->structural_id;
                    elseif ($request->bid_type === 'mep') $milestoneData['mep_id'] = $bid->mep_id;

                    $milestone = \App\Models\ProjectMilestone::create($milestoneData);

                    $milestoneIdMap[$index] = $milestone->id;
                }
            }

            // 2. Create Termins and Link to Milestones
            foreach ($request->termins as $t) {
                $milestoneId = null;
                if (isset($t['milestone_index']) && isset($milestoneIdMap[$t['milestone_index']])) {
                    $milestoneId = $milestoneIdMap[$t['milestone_index']];
                }

                $percentage = (float) $t['percentage'];
                // No recalculation here. The old fail-safe did
                // `round(($percentage / 100) * $expectedTotal)` when the client
                // sent 0 — a float multiply plus `round()`, which loses minor
                // units so the stages stop summing to the agreed fee. Zero
                // amounts are now rejected up front, so this branch is gone
                // rather than merely unreachable.
                $amount = (float) $t['amount'];

                $project->paymentTermins()->create([
                    'label' => $t['label'],
                    'percentage' => $percentage,
                    'amount' => $amount,
                    'status' => 'pending',
                    'role_type' => $request->bid_type,
                    'recipient_id' => $user->id,
                    'milestone_id' => $milestoneId,
                ]);
            }

            // 3. Keep status as contract_pending until client reviews and signs
            $bid->update(['status' => 'contract_pending']);

            // POST-WRITE ASSERTION, inside the transaction.
            //
            // `assertPlanComplete()` existed from the start of TerminPlanService
            // and was NEVER CALLED — its own docblock said it should be enforced
            // "where a plan becomes binding (signContract)", which is exactly
            // here. The pre-write checks above validate the SUBMISSION; this
            // validates what was actually PERSISTED, which is a different
            // question and the one that decides whether money may move.
            //
            // Inside `DB::transaction` deliberately: if the persisted plan does
            // not reconcile, the exception rolls the whole signing back rather
            // than leaving a `contract_pending` bid attached to a broken
            // schedule.
            $terminPlan->assertPlanComplete($project->fresh(), $request->bid_type);

            // 3b. Auto-assign proposed team members as sub-professionals (Disabled to allow manual contractor section assignment)
            /*
            $proposedTeam = is_array($bid->proposed_team) ? $bid->proposed_team : [];
            foreach ($proposedTeam as $tmIndex => $tm) {
                $subRole = $tm['role'] ?? 'other';
                if ($request->bid_type === 'kontraktor') {
                    $roleTitle = strtolower($tm['role_title'] ?? $tm['role'] ?? '');
                    if (str_contains($roleTitle, 'structural') || str_contains($roleTitle, 'sipil') || str_contains($roleTitle, 'structure') || str_contains($roleTitle, 'civil') || str_contains($roleTitle, 'fondasi') || str_contains($roleTitle, 'foundation') || str_contains($roleTitle, 'beton') || str_contains($roleTitle, 'concrete')) {
                        $subRole = 'civil';
                    } elseif (str_contains($roleTitle, 'mechanical') || str_contains($roleTitle, 'hvac') || str_contains($roleTitle, 'ac') || str_contains($roleTitle, 'lift') || str_contains($roleTitle, 'elevator') || str_contains($roleTitle, 'mekanikal')) {
                        $subRole = 'mechanical';
                    } elseif (str_contains($roleTitle, 'electrical') || str_contains($roleTitle, 'listrik') || str_contains($roleTitle, 'power') || str_contains($roleTitle, 'wiring') || str_contains($roleTitle, 'elektrikal') || str_contains($roleTitle, 'lampu')) {
                        $subRole = 'electrical';
                    } elseif (str_contains($roleTitle, 'plumbing') || str_contains($roleTitle, 'drainage') || str_contains($roleTitle, 'piping') || str_contains($roleTitle, 'pipa') || str_contains($roleTitle, 'plumber') || str_contains($roleTitle, 'air')) {
                        $subRole = 'plumbing';
                    } elseif (str_contains($roleTitle, 'roofing') || str_contains($roleTitle, 'atap') || str_contains($roleTitle, 'truss') || str_contains($roleTitle, 'genteng')) {
                        $subRole = 'roofing';
                    } elseif (str_contains($roleTitle, 'finishing') || str_contains($roleTitle, 'facade') || str_contains($roleTitle, 'painting') || str_contains($roleTitle, 'cat') || str_contains($roleTitle, 'tiling') || str_contains($roleTitle, 'keramik') || str_contains($roleTitle, 'plaster') || str_contains($roleTitle, 'dinding') || str_contains($roleTitle, 'lantai')) {
                        $subRole = 'finishing';
                    } else {
                        if (!in_array($subRole, ['civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'])) {
                            $subRole = 'general';
                        }
                    }
                } else {
                    if ($subRole === 'other') {
                        $roleTitle = strtolower($tm['role_title'] ?? '');
                        if (str_contains($roleTitle, 'structural') || str_contains($roleTitle, 'sipil') || str_contains($roleTitle, 'structure')) {
                            $subRole = 'structural';
                        } elseif (str_contains($roleTitle, 'mep') || str_contains($roleTitle, 'mechanical') || str_contains($roleTitle, 'plumbing') || str_contains($roleTitle, 'electrical') || str_contains($roleTitle, 'mep')) {
                            $subRole = 'mep';
                        } elseif (str_contains($roleTitle, 'interior')) {
                            $subRole = 'interior';
                        } else {
                            $assignedUser = !empty($tm['team_member_id']) ? \App\Models\User::find($tm['team_member_id']) : null;
                            if ($assignedUser && in_array($assignedUser->role_type, ['structural', 'mep', 'interior'])) {
                                $subRole = $assignedUser->role_type;
                            }
                        }
                    }
                }

                $teamFee = (float) ($tm['fee'] ?? 0);
                $teamName = $tm['name'] ?? 'Team Member';

                // Determine the correct user_id for the sub-professional record (prioritize roster user, fallback to lead pro)
                $assignedUserId = !empty($tm['team_member_id']) && \App\Models\User::where('id', $tm['team_member_id'])->exists()
                    ? (int)$tm['team_member_id']
                    : $user->id;

                // If falling back to the lead professional's user_id, make sub_role unique to prevent DB unique key constraint violation
                $actualSubRole = $subRole;
                if ($assignedUserId === $user->id) {
                    $actualSubRole = substr($subRole . '-' . $tmIndex, 0, 50);
                }

                // If assignedUserId matches current contractor user id, make active. Otherwise invited.
                $status = ($assignedUserId !== $user->id) ? 'invited' : 'active';
                $acceptedAt = ($assignedUserId !== $user->id) ? null : now();
                $hiredAt = ($assignedUserId !== $user->id) ? null : now();

                // Create sub-professional record
                $sub = \App\Models\ProjectSubProfessional::create([
                    'project_id'  => $project->id,
                    'user_id'     => $assignedUserId,
                    'parent_role' => $request->bid_type,
                    'sub_role'    => $actualSubRole,
                    'assigned_by' => $user->id,
                    'status'      => $status,
                    'rate'        => $teamFee,
                    'scope_notes' => $tm['note'] ?? null,
                    'lead_pro_notes' => "Team: " . $teamName . " (" . ($tm['role_title'] ?? $subRole) . ")",
                    'hired_at'    => $hiredAt,
                    'accepted_at' => $acceptedAt,
                ]);

                // Create notification if invited
                if ($status === 'invited') {
                    \App\Models\Notification::create([
                        'user_id' => $assignedUserId,
                        'type' => 'sub_professional_invite',
                        'title' => 'Project Team Invitation',
                        'body' => "You have been proposed/invited as a " . ($tm['role_title'] ?? $subRole) . " for \"{$project->title}\" by the General Contractor.",
                        'data' => [
                            'project_id' => $project->id,
                            'sub_professional_id' => $sub->id,
                        ],
                    ]);
                }

                // Link to project main fields if applicable
                if ($subRole === 'structural') {
                    $struc = \App\Models\StructuralEngineer::where('user_id', $assignedUserId)->first();
                    if ($struc) $project->update(['structural_id' => $struc->id]);
                } elseif ($subRole === 'mep') {
                    $mep = \App\Models\MepEngineer::where('user_id', $assignedUserId)->first();
                    if ($mep) $project->update(['mep_id' => $mep->id]);
                } elseif ($subRole === 'interior') {
                    $interior = \App\Models\InteriorProfile::where('user_id', $assignedUserId)->first();
                    if ($interior) $project->update(['selected_interior_id' => $interior->id]);
                }

                // Create a milestone for this team member
                $teamPhase = match ($subRole) {
                    'structural' => 'design',
                    'mep'        => 'design',
                    default      => $phaseContext,
                };

                $teamMilestone = \App\Models\ProjectMilestone::create([
                    'project_id'      => $project->id,
                    'title'           => $teamName . " — " . ($tm['role_title'] ?? $subRole),
                    'description'     => $tm['note'] ?? "Work scope for {$teamName}",
                    'approval_status' => 'pending',
                    'phase_context'   => $teamPhase,
                    'type'            => 'sub_professional',
                    'sort_order'      => 100 + $tmIndex,
                ]);

                // Create a payment termin for this team member
                if ($teamFee > 0) {
                    $project->paymentTermins()->create([
                        'label'        => "Fee — " . $teamName . " (" . ($tm['role_title'] ?? $subRole) . ")",
                        'percentage'   => 100,
                        'amount'       => $teamFee,
                        'status'       => 'pending',
                        'role_type'    => $subRole,
                        'recipient_id' => $user->id,
                        'milestone_id' => $teamMilestone->id,
                    ]);
                }
            }
            */

            // 4. Special Hook for Notaries: Auto-finalize legal scope if signing
            if ($request->bid_type === 'notaris') {
                $services = is_array($bid->selected_services) ? $bid->selected_services : [];
                if (!empty($services)) {
                    // Extract IDs if they are objects
                    $serviceIds = array_map(function($s) {
                        return is_array($s) ? (string)($s['id'] ?? $s) : (string)$s;
                    }, $services);
                    
                    \App\Http\Controllers\Api\ProjectLegalController::syncProjectLegalScope($project, $serviceIds, $user->id);
                }
            }

            // 4. Log Activity
            \App\Models\ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => $user->id,
                'action' => 'contract_signed',
                'details' => "Professional has signed the SPK and defined payment termins.",
            ]);

            return $bid;
        });

        // 5. Generate SPK Draft (Outside Transaction to prevent row lock times)
        $contractService = app(\App\Services\ProjectContractService::class);
        $contractService->generateSPKDraft($project, $bid, $request->bid_type);

        return response()->json(['message' => 'Contract signed successfully! Awaiting owner signature.', 'bid' => $bid]);
    }

    public function clientSignContract(Project $project, $bidId, Request $request)
    {
        $user = Auth::user();
        $request->validate([
            'bid_type' => $this->bidTypeRule(),
            'signature' => 'required|string',
        ]);

        $bidModel = $this->getBidModel($request->bid_type);
        $bid = $bidModel::where('id', $bidId)->where('project_id', $project->id)->firstOrFail();

        // 1. Authorize: Only the project owner can sign as client
        if ($user->id !== $project->user_id) {
            return response()->json(['message' => 'Unauthorized. Only the project owner can sign this contract.'], 403);
        }

        // 2. Validate state: must be in contract_pending or awaiting_payment
        if (!in_array($bid->status, ['contract_pending', 'awaiting_payment'])) {
            return response()->json(['message' => 'This contract is not in a signable state.'], 422);
        }

        // 3. Verify professional has already signed
        $timestamp = $bid->created_at ? $bid->created_at->timestamp : time();
        $proFileName = "signature_{$request->bid_type}_{$bid->id}_{$timestamp}.png";
        
        $proSignatureExists = Storage::disk(\App\Support\Vault::disk())->exists("contracts/project_{$project->id}/signatures/" . $proFileName) ||
                              Storage::disk('public')->exists("contracts/project_{$project->id}/signatures/" . $proFileName) ||
                              Storage::disk(\App\Support\Vault::disk())->exists("signatures/" . $proFileName) ||
                              Storage::disk('public')->exists("signatures/" . $proFileName);
        if (!$proSignatureExists) {
            return response()->json(['message' => 'The professional must sign the contract first.'], 422);
        }

        // THE OWNER'S COUNTER-SIGNATURE IS WHAT BINDS THE PLAN.
        //
        // This endpoint had NO plan-integrity check at all. The professional's
        // `signContract` validated the SUBMISSION with a float comparison, but
        // the owner's counter-signature — the act that makes the schedule
        // enforceable and the money payable — accepted whatever was on the
        // table. A plan could therefore be bound with stages that do not total
        // the negotiated fee.
        //
        // `assertPlanComplete()` has existed since TerminPlanService was written
        // and its own docblock said it belonged "where a plan becomes BINDING
        // (signContract)". This is that place, and the professional's sign is
        // the other half.
        app(\App\Services\TerminPlanService::class)
            ->assertPlanComplete($project->fresh(), $request->bid_type);

        return DB::transaction(function () use ($project, $bid, $request, $user, $timestamp) {
            // Save client signature
            $signatureData = $request->signature;
            if (preg_match('/^data:image\/(\w+);base64,/', $signatureData, $type)) {
                $signatureData = substr($signatureData, strpos($signatureData, ',') + 1);
                $signatureData = base64_decode($signatureData);
                
                if ($signatureData !== false) {
                    $fileName = "signature_{$request->bid_type}_{$bid->id}_{$timestamp}_client.png";
                    Storage::disk(\App\Support\Vault::disk())->put("contracts/project_{$project->id}/signatures/" . $fileName, $signatureData);
                    \Illuminate\Support\Facades\Cache::forget("sig_exists_{$project->id}_{$request->bid_type}_{$bid->id}_{$timestamp}_client");
                }
            } else {
                return response()->json(['message' => 'Invalid signature format.'], 422);
            }

            // Update Bid and Project Status to awaiting_payment.
            // STATE GUARD: never drag a project that already progressed
            // (in_progress etc.) backwards — signing a SECOND professional's
            // contract previously reset the whole project to awaiting_payment.
            $bid->update(['status' => 'awaiting_payment']);
            if (!in_array($project->status, ['in_progress', 'completed', 'cancelled'])) {
                $project->update(['status' => 'awaiting_payment']);
            }

            // Generate and save immutable SPK contract snapshot to private storage
            $contractService = app(\App\Services\ProjectContractService::class);
            $contractService->storeContractSnapshot($project, $bid, $request->bid_type);

            // Log Activity
            \App\Models\ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => $user->id,
                'action' => 'contract_signed_by_client',
                'details' => "Client has signed the SPK contract. Status transitioned to awaiting payment.",
            ]);

            return response()->json(['message' => 'Contract signed successfully! Awaiting payment verification.', 'bid' => $bid]);
        });
    }

    public function acceptInvite(Project $project, $bidId, Request $request)
    {
        $user = Auth::user();
        $request->validate(['bid_type' => $this->bidTypeRule()]);

        $bidModel = $this->getBidModel($request->bid_type);
        $bid = $bidModel::where('id', $bidId)->where('project_id', $project->id)->firstOrFail();

        $proUserId = $this->getBidderUserId($bid, $request->bid_type);
        if ($user->id !== $proUserId) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        if ($bid->status !== 'invited') {
            return response()->json(['message' => 'This invitation is no longer active.'], 422);
        }

        return DB::transaction(function () use ($bid) {
            $bid->update(['status' => 'shortlisted']);
            return response()->json(['message' => 'Invitation accepted. You are now in the interview phase.', 'bid' => $bid]);
        });
    }

    public function rejectInvite(Project $project, $bidId, Request $request)
    {
        $user = Auth::user();
        $request->validate(['bid_type' => $this->bidTypeRule()]);

        $bidModel = $this->getBidModel($request->bid_type);
        $bid = $bidModel::where('id', $bidId)->where('project_id', $project->id)->firstOrFail();

        $proUserId = $this->getBidderUserId($bid, $request->bid_type);
        if ($user->id !== $proUserId) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        return DB::transaction(function () use ($bid) {
            $bid->update(['status' => 'rejected', 'rejection_reason' => $request->reason]);
            return response()->json(['message' => 'Invitation rejected.', 'bid' => $bid]);
        });
    }

private function getBidModel($type)
    {
        // Single source of truth: config/bids.php (was one of FIVE hand-rolled
        // role maps that had to be kept in sync manually).
        return config("bids.{$type}.bid_model")
        ?? throw new \InvalidArgumentException("Unknown bid type: {$type}");
    }

    /**
     * The `bid_type` validation rule.
     *
     * `bid_type` was `'required|string'` in five places, so an unknown value
     * reached `getBidModel()` and hit its `InvalidArgumentException` — an
     * UNCAUGHT exception, so the caller got a **500** for what is plainly a
     * client mistake. A bad role should be a 422 that names the valid roles.
     *
     * The list is derived from `config/bids.php`, the same registry
     * `TerminPlanService::knownRoles()` and the bid tables use, so a seventh
     * role cannot be added in one place and forgotten here. It is also the
     * vocabulary `project_payment_termins.role_type` is written with, which is
     * what makes `signContract`'s `role_type => $request->bid_type` correct.
     */
    private function bidTypeRule(): string
    {
        return 'required|string|in:' . implode(',', \App\Services\TerminPlanService::knownRoles());
    }

    private function getBidderUserId($bid, $type)
    {
        $config = config("bids.$type") ?? throw new \InvalidArgumentException("Unknown bid type: $type");
        $fk = $config['bid_fk'];
        $profileModel = $config['profile_model'];

        // Use the profile relation ONLY if it is already loaded — touching an
        // unloaded relation would throw under shouldBeStrict mode.
        $rel = $this->getBidProfileRelationName($type);
        if ($bid->relationLoaded($rel)) {
            return $bid->{$rel}?->user_id;
        }

        // Fall back to a direct profile lookup (null-safe for deleted profiles).
        return $profileModel::find($bid->{$fk})?->user_id;
    }

    /**
     * Relation name on each Bid model pointing at the professional profile.
     */
    private function getBidProfileRelationName($type)
    {
        return match ($type) {
            'arsitek' => 'arsitek',
            'kontraktor' => 'kontraktor',
            'notaris' => 'notaris',
            'interior' => 'interior',
            'project_manager' => 'pm',
            'structural' => 'structuralEngineer',
            'mep' => 'mepEngineer',
        };
    }
    // NOTE: verifyBidPayment + uploadBidPaymentProof removed — their routes
    // had zero consumers; the live payment flow runs through
    // verifyDesignPayment and PaymentVerificationController.

    private function attachClientHistory($projects)
    {
        $projects->loadMissing('user');
        
        $isSingle = $projects instanceof Project;
        $collection = $isSingle ? collect([$projects]) : $projects;
        
        $userIds = $collection->pluck('user_id')->unique()->filter()->toArray();
        if (empty($userIds)) {
            return $projects;
        }

        $postedCounts = Project::whereIn('user_id', $userIds)
            ->groupBy('user_id')
            ->select('user_id', DB::raw('count(*) as count'))
            ->pluck('count', 'user_id');

        $hiredCounts = Project::whereIn('user_id', $userIds)
            ->where(function($q) {
                $q->whereNotNull('selected_arsitek_id')
                    ->orWhereNotNull('selected_kontraktor_id')
                    ->orWhereNotNull('selected_notaris_id')
                    ->orWhereNotNull('selected_interior_id')
                    ->orWhereNotNull('pm_id')
                    ->orWhereNotNull('structural_id')
                    ->orWhereNotNull('mep_id');
            })
            ->groupBy('user_id')
            ->select('user_id', DB::raw('count(*) as count'))
            ->pluck('count', 'user_id');

        $activeCounts = Project::whereIn('user_id', $userIds)
            ->whereIn('status', ['in_progress', 'planning', 'awaiting_payment', 'contract_pending', 'accepted_arsitek', 'accepted_kontraktor', 'procurement'])
            ->groupBy('user_id')
            ->select('user_id', DB::raw('count(*) as count'))
            ->pluck('count', 'user_id');

        // Net disbursed per owner, refunds subtracted.
        //
        // BUGFIX: this was `->where('transaction_type', 'payment')` with no
        // refund term. Refunds are NEGATIVE ledger rows, so disputed-and-
        // returned money still counted as spent — inflating `total_spent` on
        // a professional's PUBLIC client_history, and inflating it further
        // every time arbitration correctly refunded them. It is a marketing
        // figure, so it being wrong in the platform's own favour is the worst
        // direction for it to be wrong in.
        //
        // Routed through the service so the `payment + refund` rule lives in
        // one place (see ProjectFinancialService::DISBURSEMENT_TYPES) instead
        // of being restated here. Still one grouped query — the caller renders
        // many owners, and a call per project would be N+1.
        $totalSpentByOwner = app(\App\Services\ProjectFinancialService::class)
            ->paidTotalByOwner($userIds);

        foreach ($collection as $project) {
            $uid = $project->user_id;
            $pPosted = $postedCounts[$uid] ?? 0;
            $pHired = $hiredCounts[$uid] ?? 0;
            $project->client_history = [
                'projects_posted' => $pPosted,
                'projects_hired' => $pHired,
                'hire_rate' => $pPosted > 0 ? round(($pHired / $pPosted) * 100) : 0,
                'active_projects' => $activeCounts[$uid] ?? 0,
                'total_spent' => ($totalSpentByOwner[$uid] ?? null)?->toFloat() ?? 0.0,
                'member_since' => $project->user?->created_at ? $project->user->created_at->format('M Y') : null,
            ];
        }

        return $projects;
    }
}
