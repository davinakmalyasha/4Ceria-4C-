<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use Illuminate\Http\Request;

class AdminSupplierController extends Controller
{
    /**
     * Get all suppliers for admin verification.
     */
    public function index()
    {
        return response()->json([
            'data' => Supplier::with('user')->get()
        ]);
    }

    /**
     * Update supplier verification status.
     */
    public function updateStatus(Request $request, $id)
    {
        $validated = $request->validate([
            'verification_status' => 'required|in:pending,verified,rejected',
            'rejection_reason' => 'nullable|string|max:500',
        ]);

        $supplier = Supplier::findOrFail($id);
        $supplier->update($validated);

        return response()->json([
            'message' => 'Status updated',
            'supplier' => $supplier->load('user')
        ]);
    }
}
