<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Arsitek;
use App\Models\Kontraktor;
use App\Models\InteriorProfile;
use App\Models\NotarisProfile;
use App\Models\ProjectManager;
use App\Models\StructuralEngineer;
use App\Models\MepEngineer;
use Illuminate\Support\Facades\Cache;

class PublicProfessionalController extends Controller
{
    public function getArsiteks()
    {
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
        $data = $supportsTags
            ? Cache::tags(['professionals'])->remember('api_arsitek_list', 600, function () {
                return Arsitek::with(['user.phoneNumber', 'user.teamMembers', 'ratings', 'projects.images'])->get();
            })
            : Cache::remember('api_arsitek_list', 600, function () {
                return Arsitek::with(['user.phoneNumber', 'user.teamMembers', 'ratings', 'projects.images'])->get();
            });
        return response()->json(['data' => $data]);
    }

    public function getKontraktors()
    {
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
        $data = $supportsTags
            ? Cache::tags(['professionals'])->remember('api_kontraktor_list', 600, function () {
                return Kontraktor::with(['user.phoneNumber', 'user.teamMembers', 'ratings', 'spesialisasis', 'projects.images'])->get();
            })
            : Cache::remember('api_kontraktor_list', 600, function () {
                return Kontraktor::with(['user.phoneNumber', 'user.teamMembers', 'ratings', 'spesialisasis', 'projects.images'])->get();
            });
        return response()->json(['data' => $data]);
    }

    public function getInteriors()
    {
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
        $data = $supportsTags
            ? Cache::tags(['professionals'])->remember('api_interior_list', 600, function () {
                return InteriorProfile::with(['user.phoneNumber', 'ratings', 'projects.images'])->get();
            })
            : Cache::remember('api_interior_list', 600, function () {
                return InteriorProfile::with(['user.phoneNumber', 'ratings', 'projects.images'])->get();
            });
        return response()->json(['data' => $data]);
    }

    public function getNotarises()
    {
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
        $data = $supportsTags
            ? Cache::tags(['professionals'])->remember('api_notaris_list', 600, function () {
                return NotarisProfile::with(['user.phoneNumber', 'ratings', 'services'])->get();
            })
            : Cache::remember('api_notaris_list', 600, function () {
                return NotarisProfile::with(['user.phoneNumber', 'ratings', 'services'])->get();
            });
        return response()->json(['data' => $data]);
    }

    public function getProjectManagers()
    {
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
        $data = $supportsTags
            ? Cache::tags(['professionals'])->remember('api_project_manager_list', 600, function () {
                return ProjectManager::with(['user.phoneNumber', 'ratings', 'projects.images'])->get();
            })
            : Cache::remember('api_project_manager_list', 600, function () {
                return ProjectManager::with(['user.phoneNumber', 'ratings', 'projects.images'])->get();
            });
        return response()->json(['data' => $data]);
    }

    public function getStructuralEngineers()
    {
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
        $data = $supportsTags
            ? Cache::tags(['professionals'])->remember('api_structural_list', 600, function () {
                return StructuralEngineer::with(['user.phoneNumber'])->get();
            })
            : Cache::remember('api_structural_list', 600, function () {
                return StructuralEngineer::with(['user.phoneNumber'])->get();
            });
        return response()->json(['data' => $data]);
    }

    public function getMepEngineers()
    {
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
        $data = $supportsTags
            ? Cache::tags(['professionals'])->remember('api_mep_list', 600, function () {
                return MepEngineer::with(['user.phoneNumber'])->get();
            })
            : Cache::remember('api_mep_list', 600, function () {
                return MepEngineer::with(['user.phoneNumber'])->get();
            });
        return response()->json(['data' => $data]);
    }
}
