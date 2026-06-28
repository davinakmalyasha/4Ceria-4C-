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

        $relations = [
            'images',
            'milestones',
            'user.phoneNumber',
        ];

        if ($user) {
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
            $projects = $query->latest()->get();
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
                'message' => 'Failed to publish project.',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function show(Project $project)
    {
        $user = Auth::guard('sanctum')->user();
        
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
                          'interior.interior.user.phoneNumber',
                          'interior.interior.ratings'
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
                    $isHired = $project->pm_id === $pm->id;
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

            \App\Models\BidArsitek::create(array_merge($baseData, [
                'arsitek_id' => $profile->id,
                'scopes' => is_string($request->scopes) ? json_decode($request->scopes, true) : $request->scopes,
                'deliverables' => is_string($request->deliverables) ? json_decode($request->deliverables, true) : $request->deliverables,
                'style' => $request->style,
            ]));
        } elseif ($user->role_type === 'kontraktor') {
            $profile = \App\Models\Kontraktor::where('user_id', $user->id)->firstOrFail();

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

            $existing = \App\Models\BidInterior::where('project_id', $project->id)
                ->where('interior_id', $profile->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }

            \App\Models\BidInterior::create(array_merge($baseData, [
                'interior_id' => $profile->id,
                'scopes' => is_string($request->scopes) ? json_decode($request->scopes, true) : $request->scopes,
                'deliverables' => is_string($request->deliverables) ? json_decode($request->deliverables, true) : $request->deliverables,
                'style' => $request->style,
            ]));
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

            \App\Models\BidStructural::create(array_merge($baseData, [
                'structural_id' => $profile->id,
                'license_number' => $request->license_number,
                'experience_years' => $request->experience_years,
                'technical_notes' => $request->technical_notes,
                'scopes' => is_string($request->scopes) ? json_decode($request->scopes, true) : $request->scopes,
                'deliverables' => is_string($request->deliverables) ? json_decode($request->deliverables, true) : $request->deliverables,
            ]));
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

            \App\Models\BidMep::create(array_merge($baseData, [
                'mep_id' => $profile->id,
                'license_number' => $request->license_number,
                'experience_years' => $request->experience_years,
                'technical_notes' => $request->technical_notes,
                'scopes' => is_string($request->scopes) ? json_decode($request->scopes, true) : $request->scopes,
                'deliverables' => is_string($request->deliverables) ? json_decode($request->deliverables, true) : $request->deliverables,
            ]));
        } elseif ($user->role_type === 'project_manager') {
            $profile = \App\Models\ProjectManager::where('user_id', $user->id)->firstOrFail();

            $existing = \App\Models\BidProjectManager::where('project_id', $project->id)
                ->where('pm_id', $profile->id)->first();
            if ($existing) {
                return response()->json(['message' => 'You have already submitted a bid for this project.'], 422);
            }

            \App\Models\BidProjectManager::create(array_merge($baseData, [
                'pm_id' => $profile->id,
                'fee_type' => $request->fee_type ?? 'fixed',
                'scopes' => is_string($request->scopes) ? json_decode($request->scopes, true) : $request->scopes,
                'deliverables' => is_string($request->deliverables) ? json_decode($request->deliverables, true) : $request->deliverables,
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

        $modelMap = [
            'arsitek' => \App\Models\BidArsitek::class,
            'kontraktor' => \App\Models\BidKontraktor::class,
            'notaris' => \App\Models\BidNotaris::class,
            'interior' => \App\Models\BidInterior::class,
            'structural' => \App\Models\BidStructural::class,
            'mep' => \App\Models\BidMep::class,
            'project_manager' => \App\Models\BidProjectManager::class,
        ];

        $modelClass = $modelMap[$bidType];
        $bid = $modelClass::find($bidId);

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

            $bidToCheck = $bidModel::where('id', $request->bid_id)->where('project_id', $project->id)->firstOrFail();

            // Financial Safety Check: Prevent Rp 0 or Unconfirmed Hire
            if ($bidToCheck->status !== 'shortlisted' && $bidToCheck->status !== 'negotiating') {
                return response()->json(['message' => 'You must shortlist or negotiate with this professional first before hiring.'], 422);
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

        $data = $request->validated();

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

        $project->update($data);

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

    /**
     * Generic file upload for project-related assets (brief images, moodboards, etc.)
     */
    public function uploadFile(Request $request)
    {
        $request->validate([
            'file' => 'required|file|mimes:jpg,jpeg,png,pdf,webp|max:10240',
            'folder' => 'nullable|string'
        ]);

        $folder = $request->input('folder', 'project_assets');
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

        // GATE 4 & 5: Pre-hire Clean-up & Soft Deletion
        DB::beginTransaction();
        try {
            // Cancel and archive all outstanding proposals
            $project->bidsArsitek()->where('status', 'pending')->update(['status' => 'cancelled']);
            $project->bidsKontraktor()->where('status', 'pending')->update(['status' => 'cancelled']);
            $project->bidsNotaris()->where('status', 'pending')->update(['status' => 'cancelled']);
            $project->bidsInterior()->where('status', 'pending')->update(['status' => 'cancelled']);
            $project->bidsProjectManager()->where('status', 'pending')->update(['status' => 'cancelled']);
            $project->bidsStructural()->where('status', 'pending')->update(['status' => 'cancelled']);
            $project->bidsMep()->where('status', 'pending')->update(['status' => 'cancelled']);

            // Soft delete the project to preserve audit trail
            $project->delete();

            DB::commit();
            return response()->json([
                'message' => 'Proyek dan semua bid pending berhasil dihapus dan diarsipkan.'
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'message' => 'Gagal menghapus proyek: ' . $e->getMessage()
            ], 500);
        }
    }

    public function myBids()
    {
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

        $pm = \App\Models\ProjectManager::where('user_id', $user->id)->first();
        $pmId = $pm ? $pm->id : null;

        $projects = Project::where(function ($query) use ($user, $pmId) {
            $query->where('user_id', $user->id)
                ->orWhere('selected_arsitek_id', $user->arsitek?->id)
                ->orWhere('selected_kontraktor_id', $user->kontraktor?->id)
                ->orWhere('selected_notaris_id', $user->notaris_profile?->id)
                ->orWhere('selected_interior_id', $user->interior_profile?->id)
                ->orWhere('pm_id', $user->id) 
                ->orWhere('structural_id', $user->structural_engineer?->id)
                ->orWhere('mep_id', $user->mep_engineer?->id);

            if ($pmId) {
                $query->orWhere('pm_id', $pmId);
            }
        })
        ->whereIn('status', ['open', 'accepted_arsitek', 'accepted_kontraktor', 'procurement', 'in_progress', 'planning'])
        ->select('id', 'title')
        ->latest()
        ->get();

        return response()->json(['data' => $projects]);
    }

    public function getNotarisServices()
    {
        $user = Auth::user();
        if ($user->role_type !== 'notaris') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $profile = $user->notaris_profile;
        if (!$profile) {
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

            $proName = $professional->user->name ?? "Professional #{$request->professional_id}";
            ProjectActivityLog::create([
                'project_id' => $project->id,
                'user_id' => Auth::id(),
                'action' => 'professional_invited',
                'details' => "Invited {$proName} ({$request->role_type}) to bid on project.",
            ]);

            // Notify the professional
            $proUser = match ($request->role_type) {
                'arsitek' => \App\Models\Arsitek::find($request->professional_id)->user,
                'kontraktor' => \App\Models\Kontraktor::find($request->professional_id)->user,
                'notaris' => \App\Models\NotarisProfile::find($request->professional_id)->user,
                'interior' => \App\Models\InteriorProfile::find($request->professional_id)->user,
                'project_manager' => \App\Models\ProjectManager::find($request->professional_id)->user,
                'structural' => \App\Models\StructuralEngineer::find($request->professional_id)->user,
                'mep' => \App\Models\MepEngineer::find($request->professional_id)->user,
            };

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
        $arsitekUserId = $project->arsitek->user_id ?? $project->arsitek->user->id ?? null;
        $kontraktorUserId = $project->kontraktor->user_id ?? $project->kontraktor->user->id ?? null;

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
                return response()->json([
                    'message' => 'Negotiation limit reached (max 5 rounds). Please discuss deeply before making a final decision.'
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
        $request->validate(['bid_type' => 'required|string']);

        $bidModel = $this->getBidModel($request->bid_type);
        $bid = $bidModel::where('id', $bidId)->where('project_id', $project->id)->firstOrFail();

        if ($bid->offered_by_id === $user->id) {
            return response()->json(['message' => 'You cannot confirm your own proposal. Wait for the other party.'], 422);
        }

        // Only owner, the assigned PM, the professional, or the hired lead architect/contractor can confirm
        $proUserId = $this->getBidderUserId($bid, $request->bid_type);
        $arsitekUserId = $project->arsitek->user_id ?? $project->arsitek->user->id ?? null;
        $kontraktorUserId = $project->kontraktor->user_id ?? $project->kontraktor->user->id ?? null;

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
            'bid_type' => 'required|string',
            'termins' => 'required|array|min:1',
            'termins.*.label' => 'required|string',
            'termins.*.percentage' => 'required|numeric|min:0|max:100',
            'termins.*.amount' => 'required|numeric|min:0',
            'milestones' => 'nullable|array',
            'milestones.*.title' => 'required|string|max:255',
            'milestones.*.description' => 'nullable|string',
            'signature' => 'nullable|string',
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

        // Robustly derive expected total: prioritize calculated_total, fallback to manual calc for percentage fees
        $expectedTotal = (float) ($bid->calculated_total > 0 ? $bid->calculated_total : 0);
        if ($expectedTotal <= 0) {
            if ($bid->fee_type === 'percentage') {
                $expectedTotal = ($bid->price / 100) * ($project->budget ?? 0);
            } else {
                $expectedTotal = $bid->price;
            }
        }

        // Validate termin total matches agreed fee
        $totalPercentage = collect($request->termins)->sum('percentage');
        if (abs($totalPercentage - 100) > 0.01) {
            return response()->json(['message' => 'Total termin percentage must be exactly 100%.'], 422);
        }

        $totalAmount = collect($request->termins)->sum('amount');
        
        // Critical Block: Prevent hiring for Rp 0
        if ($expectedTotal <= 0) {
            return response()->json(['message' => 'Contract value cannot be zero. Please negotiate a fee first.'], 422);
        }

        if ($totalAmount <= 0 || abs($totalAmount - $expectedTotal) > 1000) { 
            // If amount is zero or significantly off, we might allow it ONLY if we can recalculate it
            if ($totalAmount <= 0) {
                // We will recalculate below, so we don't block here yet
            } else {
                return response()->json([
                    'message' => 'The total amount of payment termins (Rp ' . number_format($totalAmount) . ') does not match the negotiated contract value (Rp ' . number_format($expectedTotal) . ').'
                ], 422);
            }
        }

        return DB::transaction(function () use ($project, $bid, $request, $user, $expectedTotal) {
            // 0. Update Project Payment Instructions using validated bank details
            $bankType = trim($request->bank_type);
            $bankAccountNo = trim($request->bank_account_no);
            $bankAccountName = trim($request->bank_account_name);
            
            // Save to professional user profile
            $user->update([
                'bank_name' => $bankType,
                'bank_account_number' => $bankAccountNo,
                'bank_account_name' => $bankAccountName,
            ]);

            $paymentInstructions = "Bank: {$bankType} | No. Rekening: {$bankAccountNo} | A/N: {$bankAccountName}";
            $project->update(['payment_instructions' => $paymentInstructions]);

            // Save professional signature if provided
            if ($request->signature) {
                $signatureData = $request->signature;
                if (preg_match('/^data:image\/(\w+);base64,/', $signatureData, $type)) {
                    $signatureData = substr($signatureData, strpos($signatureData, ',') + 1);
                    $signatureData = base64_decode($signatureData);
                    
                    if ($signatureData !== false) {
                        $timestamp = $bid->created_at ? $bid->created_at->timestamp : time();
                        $fileName = "signature_{$request->bid_type}_{$bid->id}_{$timestamp}.png";
                        Storage::disk('supabase')->put("contracts/project_{$project->id}/signatures/" . $fileName, $signatureData);
                        \Illuminate\Support\Facades\Cache::forget("sig_exists_{$project->id}_{$request->bid_type}_{$bid->id}_{$timestamp}");
                    }
                }
            }

            // 1. Clear any existing termins for this specific role
            $project->paymentTermins()->where('role_type', $request->bid_type)->delete();

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
                $amount = (float) $t['amount'];

                // RECALCULATION FAIL-SAFE: If frontend sent 0, calculate from expected total
                if ($amount <= 0 && $expectedTotal > 0) {
                    $amount = round(($percentage / 100) * $expectedTotal);
                }

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
            'bid_type' => 'required|string',
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
        
        $proSignatureExists = Storage::disk('supabase')->exists("contracts/project_{$project->id}/signatures/" . $proFileName) ||
                              Storage::disk('public')->exists("contracts/project_{$project->id}/signatures/" . $proFileName) ||
                              Storage::disk('supabase')->exists("signatures/" . $proFileName) ||
                              Storage::disk('public')->exists("signatures/" . $proFileName);
        if (!$proSignatureExists) {
            return response()->json(['message' => 'The professional must sign the contract first.'], 422);
        }

        return DB::transaction(function () use ($project, $bid, $request, $user, $timestamp) {
            // Save client signature
            $signatureData = $request->signature;
            if (preg_match('/^data:image\/(\w+);base64,/', $signatureData, $type)) {
                $signatureData = substr($signatureData, strpos($signatureData, ',') + 1);
                $signatureData = base64_decode($signatureData);
                
                if ($signatureData !== false) {
                    $fileName = "signature_{$request->bid_type}_{$bid->id}_{$timestamp}_client.png";
                    Storage::disk('supabase')->put("contracts/project_{$project->id}/signatures/" . $fileName, $signatureData);
                    \Illuminate\Support\Facades\Cache::forget("sig_exists_{$project->id}_{$request->bid_type}_{$bid->id}_{$timestamp}_client");
                }
            } else {
                return response()->json(['message' => 'Invalid signature format.'], 422);
            }

            // Update Bid and Project Status to awaiting_payment
            $bid->update(['status' => 'awaiting_payment']);
            $project->update(['status' => 'awaiting_payment']);

            // Generate and save immutable SPK contract snapshot to Supabase
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

    public function getContractSignature(Request $request, string $roleType, $bidId, string $timestamp, string $clientSuffix = null)
    {
        $suffix = $clientSuffix === 'client' ? '_client' : '';
        
        // Cryptographic token verification
        $token = $request->query('token');
        $expectedToken = hash_hmac('sha256', "{$roleType}_{$bidId}_{$timestamp}{$suffix}", config('app.key'));
        
        if (!$token || !hash_equals($expectedToken, $token)) {
            abort(403, 'Invalid or expired signature token.');
        }

        $bidModel = $this->getBidModel($roleType);
        $bid = $bidModel::where('id', $bidId)->firstOrFail();

        $newPath = "contracts/project_{$bid->project_id}/signatures/signature_{$roleType}_{$bidId}_{$timestamp}{$suffix}.png";
        $legacyPath = "signatures/signature_{$roleType}_{$bidId}_{$timestamp}{$suffix}.png";
        
        if (Storage::disk('supabase')->exists($newPath)) {
            $file = Storage::disk('supabase')->get($newPath);
            return response($file, 200)->header('Content-Type', 'image/png');
        }
        
        if (Storage::disk('public')->exists($newPath)) {
            $file = Storage::disk('public')->get($newPath);
            return response($file, 200)->header('Content-Type', 'image/png');
        }
        
        if (Storage::disk('supabase')->exists($legacyPath)) {
            $file = Storage::disk('supabase')->get($legacyPath);
            return response($file, 200)->header('Content-Type', 'image/png');
        }
        
        if (Storage::disk('public')->exists($legacyPath)) {
            $file = Storage::disk('public')->get($legacyPath);
            return response($file, 200)->header('Content-Type', 'image/png');
        }
        
        abort(404, 'Signature not found.');
    }

    public function acceptInvite(Project $project, $bidId, Request $request)
    {
        $user = Auth::user();
        $request->validate(['bid_type' => 'required|string']);

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
        $request->validate(['bid_type' => 'required|string']);

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
        return match ($type) {
            'arsitek' => \App\Models\BidArsitek::class,
            'kontraktor' => \App\Models\BidKontraktor::class,
            'notaris' => \App\Models\BidNotaris::class,
            'interior' => \App\Models\BidInterior::class,
            'project_manager' => \App\Models\BidProjectManager::class,
            'structural' => \App\Models\BidStructural::class,
            'mep' => \App\Models\BidMep::class,
        };
    }

    private function getBidderUserId($bid, $type)
    {
        return match ($type) {
            'arsitek' => $bid->arsitek->user_id ?? \App\Models\Arsitek::find($bid->arsitek_id)->user_id,
            'kontraktor' => $bid->kontraktor->user_id ?? \App\Models\Kontraktor::find($bid->kontraktor_id)->user_id,
            'notaris' => $bid->notaris->user_id ?? \App\Models\NotarisProfile::find($bid->notaris_id)->user_id,
            'interior' => $bid->interior->user_id ?? \App\Models\InteriorProfile::find($bid->interior_id)->user_id,
            'project_manager' => $bid->pm->user_id ?? \App\Models\ProjectManager::find($bid->pm_id)->user_id,
            'structural' => $bid->structuralEngineer->user_id ?? \App\Models\StructuralEngineer::find($bid->structural_id)->user_id,
            'mep' => $bid->mepEngineer->user_id ?? \App\Models\MepEngineer::find($bid->mep_id)->user_id,
        };
    }
    public function verifyBidPayment(Project $project, $bidId, Request $request)
    {
        $user = Auth::user();
        $request->validate(['bid_type' => 'required|string']);

        $bidModel = $this->getBidModel($request->bid_type);
        $bid = $bidModel::where('id', $bidId)->where('project_id', $project->id)->firstOrFail();

        // Only owner or PM can verify payment
        $isOwner = $project->user_id === $user->id;
        $isPM = $project->pm_id === $user->id;

        if (!$isOwner && !$isPM) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        if (!in_array($bid->status, ['accepted', 'awaiting_payment'])) {
            return response()->json(['message' => 'Bid must be accepted or awaiting payment before payment verification.'], 422);
        }

        return DB::transaction(function () use ($project, $bid, $request, $user) {
            $bid->update([
                'payment_status' => 'paid',
                'paid_at' => now(),
            ]);

            // Budget Deduction
            $financialService = app(\App\Services\ProjectFinancialService::class);
            $fee = $bid->calculated_total ?? $bid->price;

            $bidderName = 'Professional';
            $proUser = $this->getBidderUser($bid, $request->bid_type);
            if ($proUser)
                $bidderName = $proUser->name;

            $referenceModel = match ($request->bid_type) {
                'arsitek' => 'BidArsitek',
                'kontraktor' => 'BidKontraktor',
                'notaris' => 'BidNotaris',
                'interior' => 'BidInterior',
                'project_manager' => 'BidProjectManager',
                'structural' => 'BidStructural',
                'mep' => 'BidMep',
            };

            $financialService->deductBudget($project, (float) $fee, 'payment', "Professional Fee: {$bidderName}", $referenceModel, $bid->id);

            // Transition Project Status if necessary
            if ($request->bid_type === 'arsitek' && $project->status === 'open') {
                $project->update(['status' => 'accepted_arsitek']);
            } elseif ($request->bid_type === 'kontraktor') {
                if ($project->status === 'accepted_arsitek' || $project->target_role === 'kontraktor') {
                    $project->update(['status' => 'in_progress']);
                } else {
                    $project->update(['status' => 'accepted_kontraktor']);
                }
            }

            return response()->json(['message' => 'Payment verified successfully.', 'bid' => $bid]);
        });
    }

    private function getBidderUser($bid, $type)
    {
        return match ($type) {
            'arsitek' => $bid->arsitek->user ?? \App\Models\Arsitek::find($bid->arsitek_id)->user,
            'kontraktor' => $bid->kontraktor->user ?? \App\Models\Kontraktor::find($bid->kontraktor_id)->user,
            'notaris' => $bid->notaris->user ?? \App\Models\NotarisProfile::find($bid->notaris_id)->user,
            'interior' => $bid->interior->user ?? \App\Models\InteriorProfile::find($bid->interior_id)->user,
            'project_manager' => $bid->pm->user ?? \App\Models\ProjectManager::find($bid->pm_id)->user,
            'structural' => $bid->structuralEngineer->user ?? \App\Models\StructuralEngineer::find($bid->structural_id)->user,
            'mep' => $bid->mepEngineer->user ?? \App\Models\MepEngineer::find($bid->mep_id)->user,
        };
    }

    public function uploadBidPaymentProof(Project $project, $bidId, Request $request)
    {
        $user = Auth::user();
        if ($project->user_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized. Only project owner can upload proof.'], 403);
        }

        $request->validate([
            'bid_type' => 'required|string',
            'payment_proof' => 'required|file|mimes:jpg,jpeg,png,pdf|max:2048',
        ]);

        $bidModel = $this->getBidModel($request->bid_type);
        $bid = $bidModel::where('id', $bidId)->where('project_id', $project->id)->firstOrFail();

        if ($request->hasFile('payment_proof')) {
            $path = $request->file('payment_proof')->store("projects/{$project->id}/proofs/bids", 'public');

            $bid->update([
                'payment_proof_path' => $path,
                'payment_status' => 'verifying',
            ]);

            return response()->json([
                'message' => 'Proof uploaded successfully! Awaiting professional verification.',
                'bid' => $bid
            ]);
        }

        return response()->json(['message' => 'File upload failed.'], 400);
    }

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

        $totalSpent = ProjectBudgetTransaction::whereIn('project_id', function($q) use ($userIds) {
                $q->select('id')->from('projects')->whereIn('user_id', $userIds);
            })
            ->where('transaction_type', 'payment')
            ->join('projects', 'project_budget_transactions.project_id', '=', 'projects.id')
            ->groupBy('projects.user_id')
            ->select('projects.user_id', DB::raw('sum(project_budget_transactions.amount) as total'))
            ->pluck('total', 'projects.user_id');

        foreach ($collection as $project) {
            $uid = $project->user_id;
            $pPosted = $postedCounts[$uid] ?? 0;
            $pHired = $hiredCounts[$uid] ?? 0;
            $project->client_history = [
                'projects_posted' => $pPosted,
                'projects_hired' => $pHired,
                'hire_rate' => $pPosted > 0 ? round(($pHired / $pPosted) * 100) : 0,
                'active_projects' => $activeCounts[$uid] ?? 0,
                'total_spent' => (float) ($totalSpent[$uid] ?? 0),
                'member_since' => $project->user?->created_at ? $project->user->created_at->format('M Y') : null,
            ];
        }

        return $projects;
    }
}
