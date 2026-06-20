<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Arsitek;
use App\Models\InteriorProfile;
use App\Models\Kontraktor;
use App\Models\MepEngineer;
use App\Models\NotarisProfile;
use App\Models\Notification;
use App\Models\StructuralEngineer;
use App\Models\User;
use App\Http\Resources\UserResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class RegistrationDraftController extends Controller
{
    /**
     * Show registration draft for a tempId.
     */
    public function show($tempId)
    {
        $draftKey = "registration:draft:{$tempId}";
        $draft = Cache::get($draftKey);
        return response()->json(['draft' => $draft ?: (object)[]]);
    }

    /**
     * Save registration draft step.
     */
    public function store(Request $request, $tempId)
    {
        $validated = $request->validate([
            'step' => 'required|integer',
            'data' => 'required|array',
        ]);

        $draftKey = "registration:draft:{$tempId}";
        $currentDraft = Cache::get($draftKey) ?: [];
        $currentDraft['step_' . $validated['step']] = $validated['data'];

        if (!isset($currentDraft['all_data'])) {
            $currentDraft['all_data'] = [];
        }
        $currentDraft['all_data'] = array_merge($currentDraft['all_data'], $validated['data']);

        Cache::put($draftKey, $currentDraft, 86400); // 24 hours

        return response()->json(['message' => 'Step saved successfully']);
    }

    /**
     * Submit and complete registration from draft.
     */
    public function submit($tempId)
    {
        $draftKey = "registration:draft:{$tempId}";
        $draft = Cache::get($draftKey);

        if (!$draft || !isset($draft['all_data'])) {
            return response()->json(['message' => 'Draft not found or expired.'], 422);
        }

        $allData = $draft['all_data'];

        $validator = Validator::make($allData, [
            'name' => 'required|string|max:255',
            'username' => 'required|string|max:255|unique:users',
            'email' => 'required|string|lowercase|email|max:255|unique:users',
            'password' => 'required|string|min:6',
            'role_type' => 'required|in:user,arsitek,kontraktor,admin,notaris,interior,structural,mep,project_manager,supplier,logistics,civil,mechanical,electrical,plumbing,roofing,finishing',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validation failed', 'errors' => $validator->errors()], 422);
        }

        $validated = $validator->validated();

        DB::beginTransaction();
        try {
            $user = User::create([
                'name' => $validated['name'],
                'username' => $validated['username'],
                'email' => strtolower($validated['email']),
                'password' => Hash::make($validated['password']),
                'role_type' => $validated['role_type'],
            ]);

            $this->createRoleProfile($user);

            if (isset($allData['phone_numbers']) && is_array($allData['phone_numbers'])) {
                foreach ($allData['phone_numbers'] as $number) {
                    if (!empty(trim($number))) {
                        $user->phoneNumber()->create(['contact' => trim($number)]);
                    }
                }
            }

            $relations = [
                'phoneNumber', 'arsitek', 'kontraktor',
                'notaris_profile.services', 'interior_profile', 'project_manager',
                'structural_engineer', 'mep_engineer', 'supplier', 'roles',
            ];
            if (in_array($user->role_type, ['arsitek', 'kontraktor'])) {
                $relations[] = 'teamMembers';
            }
            $user->load($relations);

            $token = $user->createToken('auth_token')->plainTextToken;

            DB::commit();
            Cache::forget($draftKey);

            return response()->json([
                'message' => 'User created successfully from draft',
                'access_token' => $token,
                'token_type' => 'Bearer',
                'user' => new UserResource($user),
            ], 201);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to complete registration.', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Create role-specific profiles and assign roles.
     */
    private function createRoleProfile(User $user)
    {
        $role = $user->role_type;

        if ($role === 'arsitek') {
            Arsitek::create(['user_id' => $user->id, 'nama' => $user->name, 'rate_harga' => 0, 'pengalaman_tahun' => 0]);
            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Complete Your Architect Profile',
                'body' => 'Your profile is almost ready! Add your skills, rate, and location to attract more clients.',
                'data' => ['tab' => 'profile', 'action' => 'edit_profile'],
            ]);
            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Get Verified to Start Bidding',
                'body' => 'Verified architects are more trusted. Upload your certifications now.',
                'data' => ['tab' => 'profile', 'action' => 'verify'],
            ]);
        } elseif ($role === 'kontraktor') {
            Kontraktor::create(['user_id' => $user->id, 'nama' => $user->name]);
            Notification::create([
                'user_id' => $user->id,
                'type' => 'onboarding',
                'title' => 'Complete Your Contractor Profile',
                'body' => 'Make your profile stand out! Fill in company details, specialties, and experience.',
                'data' => ['tab' => 'profile', 'action' => 'edit_profile'],
            ]);
        } elseif ($role === 'supplier') {
            \App\Models\Supplier::create(['user_id' => $user->id, 'store_name' => $user->name]);
        } elseif ($role === 'logistics') {
            \App\Models\CourierProfile::create(['user_id' => $user->id]);
        } elseif ($role === 'notaris') {
            NotarisProfile::create(['user_id' => $user->id, 'nama' => $user->name]);
        } elseif ($role === 'interior') {
            InteriorProfile::create(['user_id' => $user->id, 'nama' => $user->name]);
        } elseif ($role === 'structural') {
            StructuralEngineer::create(['user_id' => $user->id, 'nama' => $user->name]);
        } elseif ($role === 'mep') {
            MepEngineer::create(['user_id' => $user->id, 'nama' => $user->name]);
        } elseif ($role === 'project_manager') {
            \App\Models\ProjectManager::create(['user_id' => $user->id, 'nama' => $user->name]);
        } elseif (in_array($role, ['civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'])) {
            Kontraktor::create(['user_id' => $user->id, 'nama' => $user->name]);
        }

        if (in_array($role, ['arsitek', 'kontraktor', 'admin', 'notaris', 'interior', 'structural', 'mep', 'project_manager', 'supplier', 'logistics'])) {
            $user->assignRole($role);
        } elseif (in_array($role, ['civil', 'mechanical', 'electrical', 'plumbing', 'roofing', 'finishing'])) {
            $user->assignRole($role);
        } else {
            $user->assignRole('user');
        }
    }
}
