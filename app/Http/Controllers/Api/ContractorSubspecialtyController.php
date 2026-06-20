<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ContractorSubspecialty;

class ContractorSubspecialtyController extends Controller
{
    public function index(): \Illuminate\Http\JsonResponse
    {
        $subspecialties = \Illuminate\Support\Facades\Cache::rememberForever('contractor_subspecialties_list', function () {
            return ContractorSubspecialty::orderBy('category')
                ->orderBy('label')
                ->get();
        });

        return response()->json(['data' => $subspecialties]);
    }
}
